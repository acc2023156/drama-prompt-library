/* 天玑 → 模型 API 转发。上游网址与 key 只存在服务端环境变量里，网页拿不到。
   - /v1/models、/v1/chat/completions：直接转发（对话、审稿）
   - /jobs：整剧生成（qwen38-script 要 3–10 分钟）交给 GitHub Actions 跑，网页拿单号轮询 */
import { randomUUID } from 'node:crypto';
import { handleAccount, readToken, charge, refund, logCall, safeEqual } from './account.js';
import { putSnapshot, getSnapshot, createJob, setJobState, getJobState, getJobBody } from './store.js';

const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/* ctx = { cfg, db }：cfg 来自 config.js，db 来自 db.js。返回 (Request) => Response 的处理函数 */
export function createApp(ctx) {
  const { cfg, db } = ctx;
  const ALLOW = cfg.corsOrigins;

  const cors = origin => ({
    'Access-Control-Allow-Origin': ALLOW.includes(origin) ? origin : ALLOW[0],
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Tianji-Code, Authorization, X-Admin-Key',
    'Access-Control-Expose-Headers': 'X-Points',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  });
  const jobSecretOk = req => !!cfg.jobSecret && safeEqual(req.headers.get('X-Job-Secret') || '', cfg.jobSecret);

  async function newJob(req, h) {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
    body.model = 'qwen38-script'; body.stream = false;
    const raw = JSON.stringify(body);
    if (raw.length > 60000) return json({ error: 'too large' }, 413, h);
    const id = randomUUID().replace(/-/g, '').slice(0, 16);
    await createJob(db, id, { status: 'queued', created: Date.now() }, raw);   // 公开纪录里只出现单号，请求体只给 Actions 取用
    let r, msg = '';
    try {
      r = await fetch(`https://api.github.com/repos/${cfg.ghRepo}/actions/workflows/${cfg.ghWorkflow}/dispatches`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + cfg.ghToken, 'Accept': 'application/vnd.github+json', 'User-Agent': 'tianji-api', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main', inputs: { job_id: id } }),
      });
      if (!r.ok) msg = (await r.text()).slice(0, 300);
    } catch (e) { msg = String(e.message || e).slice(0, 300); }
    if (!r || !r.ok) {
      await setJobState(db, id, { status: 'error', error: 'dispatch ' + (r ? r.status : 0) + ' ' + msg });
      return json({ id, status: 'error', error: 'dispatch failed' }, 502, h);
    }
    return json({ id, status: 'queued' }, 202, h);
  }

  async function jobDone(req, id) {
    if (!jobSecretOk(req)) return json({ error: 'forbidden' }, 403, {});
    const prev = JSON.parse(await getJobState(db, id) || '{}');
    const status = req.headers.get('X-Job-Status') || 'done';
    const text = await req.text();
    let result = null, error = null;
    if (status === 'done') { try { result = JSON.parse(text); if (result.error) { error = JSON.stringify(result.error).slice(0, 500); result = null; } } catch { error = text.slice(0, 500); } }
    else error = text.slice(0, 500);
    await setJobState(db, id, { ...prev, status: error ? 'error' : status, finished: Date.now(), result, error });
    return json({ ok: true }, 200, {});
  }

  return async function handle(req) {
    const origin = req.headers.get('Origin') || '';
    const h = cors(origin);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    const url = new URL(req.url), p = url.pathname;
    if (p === '/') return json({ ok: true }, 200, h);
    if (p === '/auth/login' || p === '/me' || p.startsWith('/works') || p.startsWith('/admin/')) {
      if (origin && !ALLOW.includes(origin)) return json({ error: 'origin not allowed' }, 403, h);
      const r = await handleAccount(req, ctx, p, h, json); if (r) return r;
    }

    // 热点：只给标题、创作灵感、排名，不带来源与平台。资料由 GitHub Actions 定时推上来
    if (p === '/hot/push' && req.method === 'POST') {
      if (!jobSecretOk(req)) return json({ error: 'forbidden' }, 403, {});
      let d; try { d = await req.json(); } catch { return json({ error: 'bad json' }, 400, {}); }
      const clean = s => String(s || '').replace(/^【[^】]*】/, '').trim();
      const topics = (d.topics || []).filter(t => t.status === '可改编' && !t.redline)
        .map(t => ({ t: clean(t.title), cat: t.cat || '', score: (t.ai && t.ai.score) || 0, stars: (t.ai && t.ai.stars) || 0, trend: t.trend || '', ideas: ((t.ai && t.ai.ideas) || []).slice(0, 3) }))
        .sort((a, b) => b.score - a.score);
      const works = ((d.daily && d.daily.works) || [])
        .map(w => ({ t: clean(w.title).replace(/\s*第.季$/, ''), genre: w.genre || '', ideas: (w.ideas || []).slice(0, 3) }));
      await putSnapshot(db, 'hot', { at: d.generatedAt || '', topics, works });
      return json({ ok: true, topics: topics.length, works: works.length }, 200, {});
    }
    // 热词：只留词根、分类、热度、走势、更新时间；排掉一级红线词
    if (p === '/words/push' && req.method === 'POST') {
      if (!jobSecretOk(req)) return json({ error: 'forbidden' }, 403, {});
      let d; try { d = await req.json(); } catch { return json({ error: 'bad json' }, 400, {}); }
      const RED = /乱伦|母子|父女|兄妹|姐弟|叔嫂|小姨子|干娘|继母|岳母|萝莉|正太|未成年|学生|校园|高中|初中|迷奸|强奸|偷拍|下药|师生|老师|女学生/;
      const words = (d.words || []).map(w => ({ word: String(w.word || '').replace(/^#/, '').trim(), cat: w.cat || '', heat: +w.heat || +w.clueCount || 0, trend: w.trend || '', updatedAt: w.updatedAt || d.generatedAt || '' }))
        .filter(w => w.word && !RED.test(w.word)).sort((a, b) => b.heat - a.heat);
      await putSnapshot(db, 'words', { at: d.generatedAt || '', words });
      return json({ ok: true, words: words.length }, 200, {});
    }
    if (p === '/words' && req.method === 'GET') {
      if (origin && !ALLOW.includes(origin)) return json({ error: 'origin not allowed' }, 403, h);
      const v = await getSnapshot(db, 'words');
      return v ? new Response(v, { headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=300' } }) : json({ error: 'words unavailable' }, 503, h);
    }
    if (p === '/hot' && req.method === 'GET') {
      if (origin && !ALLOW.includes(origin)) return json({ error: 'origin not allowed' }, 403, h);
      const v = await getSnapshot(db, 'hot');
      return v ? new Response(v, { headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=300' } }) : json({ error: 'hot unavailable' }, 503, h);
    }

    // GitHub Actions 回报（不经过浏览器，用另一组密码）
    let m = p.match(/^\/jobs\/([a-f0-9]{16})\/body$/);
    if (m && req.method === 'GET') {
      if (!jobSecretOk(req)) return json({ error: 'forbidden' }, 403, {});
      const b = await getJobBody(db, m[1]);
      return b ? new Response(b, { headers: { 'Content-Type': 'application/json; charset=utf-8' } }) : json({ error: 'not found' }, 404, {});
    }
    m = p.match(/^\/jobs\/([a-f0-9]{16})\/(done|running)$/);
    if (m && req.method === 'POST') {
      if (m[2] === 'running') {
        if (!jobSecretOk(req)) return json({ error: 'forbidden' }, 403, {});
        const prev = JSON.parse(await getJobState(db, m[1]) || '{}');
        await setJobState(db, m[1], { ...prev, status: 'running', started: Date.now() });
        return json({ ok: true }, 200, {});
      }
      return jobDone(req, m[1]);
    }

    // 云桥写作：对天玑网页开放（不需通行码），只认我们的网页来源；登录后每次调用扣 1 点
    if (p.startsWith('/yq/v1/')) {
      const code = req.headers.get('X-Tianji-Code');
      const trusted = !!cfg.accessCode && !!code && safeEqual(code, cfg.accessCode);
      if (!trusted && !ALLOW.includes(origin)) return json({ error: 'origin not allowed' }, 403, h);
      if (!cfg.yqBase || !cfg.yqKey) return json({ error: 'upstream not configured' }, 503, h);
      let left = null, chargedUid = null;
      if (!trusted && req.method === 'POST' && p === '/yq/v1/chat/completions') {
        const uid = readToken(cfg, req);
        if (!uid) return json({ error: 'login required' }, 401, h);
        const c = await charge(db, uid, 1, '写作');
        if (c.short) return json({ error: 'no points', points: c.points }, 402, { ...h, 'X-Points': String(c.points) });
        if (c.error) return json({ error: 'login required' }, 401, h);
        left = c.points; chargedUid = uid;
      }
      const sub = p.slice(3);
      const ok = (req.method === 'GET' && sub === '/v1/models') || (req.method === 'POST' && (sub === '/v1/chat/completions' || sub === '/v1/embeddings'));
      if (!ok) return json({ error: 'not found' }, 404, h);
      // 失败一律退点并记录，让网页自动重试；UPSTREAM_TIMEOUT_MS 为 0 时不设超时
      const bodyText = req.method === 'POST' ? await req.text() : undefined;
      let model = ''; try { model = JSON.parse(bodyText || '{}').model || ''; } catch {}
      const t0 = Date.now(), ac = new AbortController();
      const timer = cfg.upstreamTimeoutMs ? setTimeout(() => ac.abort('timeout'), cfg.upstreamTimeoutMs) : null;
      let r, status = 0;
      try {
        r = await fetch(cfg.yqBase + sub, { method: req.method, body: bodyText, signal: ac.signal,
          headers: { 'Authorization': 'Bearer ' + cfg.yqKey, 'Content-Type': 'application/json' } });
        status = r.status;
      } catch (e) { status = ac.signal.aborted ? 504 : 502; }
      if (timer) clearTimeout(timer);
      const failed = status !== 200;
      if (failed && chargedUid) { const back = await refund(db, chargedUid, 1, '写作失败退点'); if (back !== null) left = back; }
      if (sub === '/v1/chat/completions') logCall(db, status, Date.now() - t0, model).catch(() => {});
      const xh = { ...h, 'Cache-Control': 'no-store', ...(left === null ? {} : { 'X-Points': String(left) }) };
      if (!r) return json({ error: status === 504 ? 'upstream timeout' : 'upstream unreachable', retry: true }, status, xh);
      return new Response(r.body, { status: r.status, headers: { ...xh, 'Content-Type': r.headers.get('Content-Type') || 'application/json' } });
    }
    if (origin && !ALLOW.includes(origin)) return json({ error: 'origin not allowed' }, 403, h);
    if (!cfg.accessCode || !safeEqual(req.headers.get('X-Tianji-Code') || '', cfg.accessCode)) return json({ error: 'bad access code' }, 401, h);

    if (req.method === 'POST' && p === '/jobs') return newJob(req, h);
    m = p.match(/^\/jobs\/([a-f0-9]{16})$/);
    if (m && req.method === 'GET') {
      const v = await getJobState(db, m[1]);
      return v ? new Response(v, { headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }) : json({ error: 'not found' }, 404, h);
    }

    const route = req.method === 'GET' && p === '/v1/models' ? 'models'
      : req.method === 'POST' && p === '/v1/chat/completions' ? 'chat' : null;
    if (!route) return json({ error: 'not found' }, 404, h);
    if (!cfg.qwenBase || !cfg.qwenKey) return json({ error: 'upstream not configured' }, 503, h);

    const body = route === 'chat' ? await req.text() : undefined;
    try { if (JSON.parse(body || '{}').model === 'qwen38-script') return json({ error: 'use /jobs for qwen38-script' }, 400, h); } catch {}
    const r = await fetch(cfg.qwenBase + p, {
      method: req.method, body, signal: req.signal,
      headers: { 'Authorization': 'Bearer ' + cfg.qwenKey, 'Content-Type': 'application/json' },
    });
    return new Response(r.body, { status: r.status, headers: { ...h, 'Content-Type': r.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' } });
  };
}
