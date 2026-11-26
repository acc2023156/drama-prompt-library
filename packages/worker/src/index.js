/* 天玑 → 模型 API 转发。key 只存在 Cloudflare 的 secret 里，网页拿不到。
   - /v1/models、/v1/chat/completions：直接转发（对话、审稿，100 秒内能回的）
   - /jobs：整剧生成（qwen38-script 要 3–10 分钟）交给 GitHub Actions 跑，网页拿单号轮询 */
import { handleAccount, readToken, charge, refund, logCall } from './account.js';
// 上游网址放在 Worker secret（QWEN_BASE、YQ_BASE），代码里不写死
const YQ_DAILY = 600;            // 每个 IP 每天最多调用次数（约 50 部 10 集）
const YQ_COUNT = new Map();
const ALLOW = ['https://acc2023156.github.io', 'http://localhost:8765', 'http://localhost:8766'];
const JOB_TTL = 60 * 60 * 24 * 7;   // 结果保留 7 天

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOW.includes(origin) ? origin : ALLOW[0],
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Tianji-Code, Authorization, X-Admin-Key',
    'Access-Control-Expose-Headers': 'X-Points',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function newJob(req, env, h) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
  body.model = 'qwen38-script'; body.stream = false;
  const raw = JSON.stringify(body);
  if (raw.length > 60000) return json({ error: 'too large' }, 413, h);
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await env.JOBS.put('job:' + id, JSON.stringify({ status: 'queued', created: Date.now() }), { expirationTtl: JOB_TTL });
  await env.JOBS.put('body:' + id, raw, { expirationTtl: 60 * 60 * 2 });   // 只给 Actions 取用，公开纪录里只出现单号
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.GH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'tianji-api', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { job_id: id } }),
  });
  if (!r.ok) {
    const msg = (await r.text()).slice(0, 300);
    await env.JOBS.put('job:' + id, JSON.stringify({ status: 'error', error: 'dispatch ' + r.status + ' ' + msg }), { expirationTtl: JOB_TTL });
    return json({ id, status: 'error', error: 'dispatch failed' }, 502, h);
  }
  return json({ id, status: 'queued' }, 202, h);
}

async function jobDone(req, env, id) {
  if (!env.JOB_SECRET || req.headers.get('X-Job-Secret') !== env.JOB_SECRET) return json({ error: 'forbidden' }, 403, {});
  const prev = JSON.parse(await env.JOBS.get('job:' + id) || '{}');
  const status = req.headers.get('X-Job-Status') || 'done';
  const text = await req.text();
  let result = null, error = null;
  if (status === 'done') { try { result = JSON.parse(text); if (result.error) { error = JSON.stringify(result.error).slice(0, 500); result = null; } } catch { error = text.slice(0, 500); } }
  else error = text.slice(0, 500);
  await env.JOBS.put('job:' + id, JSON.stringify({ ...prev, status: error ? 'error' : status, finished: Date.now(), result, error }), { expirationTtl: JOB_TTL });
  return json({ ok: true }, 200, {});
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const h = cors(origin);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    const url = new URL(req.url), p = url.pathname;
    if (p === '/') return json({ ok: true }, 200, h);
    if (p === '/auth/login' || p === '/me' || p.startsWith('/works') || p.startsWith('/admin/')) {
      if (origin && !ALLOW.includes(origin)) return json({ error: 'origin not allowed' }, 403, h);
      const r = await handleAccount(req, env, p, h, json); if (r) return r;
    }

    // 热点：只给标题、创作灵感、排名，不带来源与平台。资料由 GitHub Actions 定时推上来
    if (p === '/hot/push' && req.method === 'POST') {
      if (!env.JOB_SECRET || req.headers.get('X-Job-Secret') !== env.JOB_SECRET) return json({ error: 'forbidden' }, 403, {});
      let d; try { d = await req.json(); } catch { return json({ error: 'bad json' }, 400, {}); }
      const clean = s => String(s || '').replace(/^【[^】]*】/, '').trim();
      const topics = (d.topics || []).filter(t => t.status === '可改编' && !t.redline)
        .map(t => ({ t: clean(t.title), cat: t.cat || '', score: (t.ai && t.ai.score) || 0, stars: (t.ai && t.ai.stars) || 0, trend: t.trend || '', ideas: ((t.ai && t.ai.ideas) || []).slice(0, 3) }))
        .sort((a, b) => b.score - a.score);
      const works = ((d.daily && d.daily.works) || [])
        .map(w => ({ t: clean(w.title).replace(/\s*第.季$/, ''), genre: w.genre || '', ideas: (w.ideas || []).slice(0, 3) }));
      await env.JOBS.put('hot:last', JSON.stringify({ at: d.generatedAt || '', topics, works }));
      return json({ ok: true, topics: topics.length, works: works.length }, 200, {});
    }
    // 热词：只留词根、分类、热度、走势、更新时间；排掉一级红线词
    if (p === '/words/push' && req.method === 'POST') {
      if (!env.JOB_SECRET || req.headers.get('X-Job-Secret') !== env.JOB_SECRET) return json({ error: 'forbidden' }, 403, {});
      let d; try { d = await req.json(); } catch { return json({ error: 'bad json' }, 400, {}); }
      const RED = /乱伦|母子|父女|兄妹|姐弟|叔嫂|小姨子|干娘|继母|岳母|萝莉|正太|未成年|学生|校园|高中|初中|迷奸|强奸|偷拍|下药|师生|老师|女学生/;
      const words = (d.words || []).map(w => ({ word: String(w.word || '').replace(/^#/, '').trim(), cat: w.cat || '', heat: +w.heat || +w.clueCount || 0, trend: w.trend || '', updatedAt: w.updatedAt || d.generatedAt || '' }))
        .filter(w => w.word && !RED.test(w.word)).sort((a, b) => b.heat - a.heat);
      await env.JOBS.put('words:last', JSON.stringify({ at: d.generatedAt || '', words }));
      return json({ ok: true, words: words.length }, 200, {});
    }
    if (p === '/words' && req.method === 'GET') {
      if (origin && !ALLOW.includes(origin)) return json({ error: 'origin not allowed' }, 403, h);
      const v = await env.JOBS.get('words:last');
      return v ? new Response(v, { headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=300' } }) : json({ error: 'words unavailable' }, 503, h);
    }
    // 标签配比：词表不放进网页原始码，存在 KV（tags:v1、tags:v2…），tags:cur 指向现用版号；换版只要上传新版再改 tags:cur
    if (p === '/tags' && req.method === 'GET') {
      if (origin && !ALLOW.includes(origin)) return json({ error: 'origin not allowed' }, 403, h);
      const cur = await env.JOBS.get('tags:cur');
      const v = cur && await env.JOBS.get('tags:v' + cur);
      return v ? new Response(v, { headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=300' } }) : json({ error: 'tags unavailable' }, 503, h);
    }
    if (p === '/hot' && req.method === 'GET') {
      if (origin && !ALLOW.includes(origin)) return json({ error: 'origin not allowed' }, 403, h);
      const v = await env.JOBS.get('hot:last');
      return v ? new Response(v, { headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=300' } }) : json({ error: 'hot unavailable' }, 503, h);
    }

    // GitHub Actions 回报（不经过浏览器，用另一组密码）
    let m = p.match(/^\/jobs\/([a-f0-9]{16})\/body$/);
    if (m && req.method === 'GET') {
      if (!env.JOB_SECRET || req.headers.get('X-Job-Secret') !== env.JOB_SECRET) return json({ error: 'forbidden' }, 403, {});
      const b = await env.JOBS.get('body:' + m[1]);
      return b ? new Response(b, { headers: { 'Content-Type': 'application/json; charset=utf-8' } }) : json({ error: 'not found' }, 404, {});
    }
    m = p.match(/^\/jobs\/([a-f0-9]{16})\/(done|running)$/);
    if (m && req.method === 'POST') {
      if (m[2] === 'running') {
        if (req.headers.get('X-Job-Secret') !== env.JOB_SECRET) return json({ error: 'forbidden' }, 403, {});
        const prev = JSON.parse(await env.JOBS.get('job:' + m[1]) || '{}');
        await env.JOBS.put('job:' + m[1], JSON.stringify({ ...prev, status: 'running', started: Date.now() }), { expirationTtl: JOB_TTL });
        return json({ ok: true }, 200, {});
      }
      return jobDone(req, env, m[1]);
    }

    // 云桥写作：对天玑网页开放（不需通行码），只认我们的网页来源，每个 IP 每天有上限
    if (p.startsWith('/yq/v1/')) {
      const code = req.headers.get('X-Tianji-Code');
      const trusted = env.ACCESS_CODE && code === env.ACCESS_CODE;
      if (!trusted && !ALLOW.includes(origin)) return json({ error: 'origin not allowed' }, 403, h);
      let left = null, chargedUid = null;
      if (!trusted) {
        const ip = req.headers.get('CF-Connecting-IP') || '?', day = new Date().toISOString().slice(0, 10), k = day + ip;
        const n = (YQ_COUNT.get(k) || 0) + 1; YQ_COUNT.set(k, n);
        if (YQ_COUNT.size > 5000) YQ_COUNT.clear();
        if (n > YQ_DAILY) return json({ error: 'daily limit' }, 429, h);
        if (req.method === 'POST' && p === '/yq/v1/chat/completions') {
          const uid = await readToken(env, req);
          if (!uid) return json({ error: 'login required' }, 401, h);
          const c = await charge(env, uid, 1, '写作');
          if (c.short) return json({ error: 'no points', points: c.points }, 402, { ...h, 'X-Points': String(c.points) });
          if (c.error) return json({ error: 'login required' }, 401, h);
          left = c.points; chargedUid = uid;
        }
      }
      const sub = p.slice(3);
      const ok = (req.method === 'GET' && sub === '/v1/models') || (req.method === 'POST' && (sub === '/v1/chat/completions' || sub === '/v1/embeddings'));
      if (!ok) return json({ error: 'not found' }, 404, h);
      // 上游 90 秒还没回就放弃（Cloudflare 约 100 秒会硬切），失败一律退点并记录，让网页自动重试
      const bodyText = req.method === 'POST' ? await req.text() : undefined;
      let model = ''; try { model = JSON.parse(bodyText || '{}').model || ''; } catch {}
      const t0 = Date.now(), ac = new AbortController(), timer = setTimeout(() => ac.abort('timeout'), 90000);
      let r, status = 0, rd = null, settled = false;
      // 只结算一次：成功就记录；失败、逾时、用户断线一律退点并记录
      const settle = async (ok, st) => {
        if (settled) return null; settled = true; let back = null;
        if (!ok && chargedUid) back = await refund(env, chargedUid, 1, '写作失败退点').catch(() => null);
        if (sub === '/v1/chat/completions') await logCall(env, ok ? 200 : st, Date.now() - t0, model).catch(() => {});
        return back;
      };
      // 用户关掉网页或断线（不论在等上游还是串流中）：Cloudflare 很快会停掉这次执行，所以在断线当下就结算
      req.signal.addEventListener('abort', () => { ac.abort('client'); if (rd) rd.cancel('client gone').catch(() => {}); ctx.waitUntil(settle(false, 499)); }, { once: true });
      try {
        r = await fetch(env.YQ_BASE + sub, { method: req.method, body: bodyText, signal: ac.signal,
          headers: { 'Authorization': 'Bearer ' + env.YQ_KEY, 'Content-Type': 'application/json' } });
        status = r.status;
      } catch (e) { status = ac.signal.aborted ? 504 : 502; }
      clearTimeout(timer);
      // 串流：边收边转发，等串流结束才判断成败（没收到结尾就退点），上游停住 90 秒没新字就放弃
      if (status === 200 && /event-stream/.test(r.headers.get('Content-Type') || '')) {
        const { readable, writable } = new TransformStream(), w = writable.getWriter(), dec = new TextDecoder(); rd = r.body.getReader();
        const pump = async () => {
          let tail = '', ended = false, st = 502, idle;
          const arm = () => { clearTimeout(idle); idle = setTimeout(() => { st = 504; rd.cancel('idle').catch(() => {}); }, 90000); };
          try {
            arm();
            for (;;) {
              const { done, value } = await rd.read(); if (done) break;
              const piece = dec.decode(value, { stream: true });
              if (/"content":"[^"]|finish_reason":"/.test(piece)) arm();   // 上游的 ": PING" 保活不算，要真的有字才算没停
              tail = (tail + piece).slice(-400);
              if (!ended && (tail.includes('[DONE]') || /"finish_reason":"[a-z_]+"/.test(tail))) ended = true;
              await w.write(value);
            }
          } catch (e) { rd.cancel().catch(() => {}); /* 上游断线或用户关掉网页 */ }
          clearTimeout(idle);
          if (ended) st = 200;
          await w.close().catch(() => {});
          await settle(ended, st);
        };
        ctx.waitUntil(pump());
        return new Response(readable, { status: 200, headers: { ...h, 'Cache-Control': 'no-store', 'Content-Type': 'text/event-stream; charset=utf-8', ...(left === null ? {} : { 'X-Points': String(left) }) } });
      }
      const back = await settle(status === 200, status); if (back !== null) left = back;
      const xh = { ...h, 'Cache-Control': 'no-store', ...(left === null ? {} : { 'X-Points': String(left) }) };
      if (!r) return json({ error: status === 504 ? 'upstream timeout' : 'upstream unreachable', retry: true }, status, xh);
      return new Response(r.body, { status: r.status, headers: { ...xh, 'Content-Type': r.headers.get('Content-Type') || 'application/json' } });
    }
    if (origin && !ALLOW.includes(origin)) return json({ error: 'origin not allowed' }, 403, h);
    if (!env.ACCESS_CODE || req.headers.get('X-Tianji-Code') !== env.ACCESS_CODE) return json({ error: 'bad access code' }, 401, h);

    if (req.method === 'POST' && p === '/jobs') return newJob(req, env, h);
    m = p.match(/^\/jobs\/([a-f0-9]{16})$/);
    if (m && req.method === 'GET') {
      const v = await env.JOBS.get('job:' + m[1]);
      return v ? new Response(v, { headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }) : json({ error: 'not found' }, 404, h);
    }


    const route = req.method === 'GET' && p === '/v1/models' ? 'models'
      : req.method === 'POST' && p === '/v1/chat/completions' ? 'chat' : null;
    if (!route) return json({ error: 'not found' }, 404, h);

    const body = route === 'chat' ? await req.text() : undefined;
    try { if (JSON.parse(body || '{}').model === 'qwen38-script') return json({ error: 'use /jobs for qwen38-script' }, 400, h); } catch {}
    const r = await fetch(env.QWEN_BASE + p, {
      method: req.method, body, signal: req.signal,
      headers: { 'Authorization': 'Bearer ' + env.QWEN_KEY, 'Content-Type': 'application/json' },
    });
    return new Response(r.body, { status: r.status, headers: { ...h, 'Content-Type': r.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' } });
  },
};
