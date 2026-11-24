/* 集成测试：需要一个空的测试库，例如
   TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/tianji_test npm run test:worker
   没设 TEST_DATABASE_URL 时数据库相关用例跳过。测试开始会用 prisma migrate deploy 建表并清空天玑的表，别指向有数据的库。 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, type ServerType } from '@hono/node-server';
import { createApp } from '../src/app.js';
import { DEFAULT_CORS_ORIGINS, loadConfig } from '../src/config.js';
import { type PrismaClient, createPrisma } from '../src/lib/db.js';
import { MIGRATIONS_DIR, migrationNames, migrationStatus } from '../src/lib/migrations.js';
import { createJob, getJobState, purgeExpired } from '../src/lib/store.js';

const WORKER_DIR = fileURLToPath(new URL('..', import.meta.url));
const URL_ = process.env.TEST_DATABASE_URL ?? '';
const skip = !URL_ && '未设 TEST_DATABASE_URL';
const ORIGIN = DEFAULT_CORS_ORIGINS[2]!;
const SECRETS = { AUTH_SECRET: 's', ADMIN_KEY: 'adm', ACCESS_CODE: 'code', JOB_SECRET: 'job', YQ_KEY: 'k', QWEN_KEY: 'k' };

let prisma: PrismaClient, upstream: http.Server, server: ServerType, base: string, token: string, uid: string;
const upstreamClosed = new Set<string>(); // 上游连接被我们这边关闭的流式用例

/** 执行 prisma migrate deploy，返回输出 */
const migrateDeploy = (): string =>
  execFileSync(process.execPath, [join(WORKER_DIR, '../../node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: WORKER_DIR, env: { ...process.env, DATABASE_URL: URL_ }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });

const frame = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
/* 流式假上游：sse-ok 正常结束；sse-noend 没有结尾标记就结束；sse-cut 中途断连；sse-slow 一直不结束 */
function sse(m: string, res: http.ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.write(': PING\n\n'); res.write(frame('he'));
  res.on('close', () => upstreamClosed.add(m));
  if (m === 'sse-ok') setTimeout(() => { res.write(frame('llo')); res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'); res.end(); }, 300);
  else if (m === 'sse-noend') setTimeout(() => { res.write(frame('x')); res.end(); }, 100);
  else if (m === 'sse-cut') setTimeout(() => res.destroy(), 100);
}

const listen = (srv: http.Server) => new Promise<number>((r) => srv.listen(0, '127.0.0.1', () => r((srv.address() as AddressInfo).port)));
type Res = { status: number; data: any; headers: Headers };
async function call(path: string, { method = 'GET', headers = {}, body, raw }: { method?: string; headers?: Record<string, string>; body?: unknown; raw?: string } = {}): Promise<Res> {
  const payload = raw ?? (body ? JSON.stringify(body) : undefined);
  const r = await fetch(base + path, { method, headers: { Origin: ORIGIN, ...(payload ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: payload });
  const text = await r.text(); let data: any; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
}
const authed = () => ({ Authorization: 'Bearer ' + token });
const admin = { 'X-Admin-Key': 'adm' };
const jobHdr = { 'X-Job-Secret': 'job' };

before(async () => {
  if (skip) return;
  // 假上游：model 为 fail 时回 500，其余回 200
  upstream = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      const m = b ? String(JSON.parse(b).model) : '';
      if (m.startsWith('sse-')) return sse(m, res);
      res.writeHead(m === 'fail' ? 500 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(m === 'fail' ? { error: 'boom' } : { choices: [{ message: { content: 'ok ' + req.url } }] }));
    });
  });
  const up = await listen(upstream);
  migrateDeploy();
  prisma = createPrisma(URL_, 4);
  await prisma.$executeRaw`TRUNCATE users, works, yqlog, ledger, snapshots, jobs RESTART IDENTITY`;
  const cfg = loadConfig({ ...SECRETS, DATABASE_URL: URL_, YQ_BASE: `http://127.0.0.1:${up}`, QWEN_BASE: `http://127.0.0.1:${up}`, MAX_BODY_BYTES: '100000' });
  await new Promise<void>((r) => { server = serve({ fetch: createApp({ cfg, prisma }).fetch, port: 0, hostname: '127.0.0.1' }, (info) => { base = 'http://127.0.0.1:' + info.port; r(); }); });
});
after(async () => { if (skip) return; server.close(); upstream.close(); await prisma.$disconnect(); });

test('配置：CORS 默认值与环境变量覆盖', () => {
  assert.deepEqual(loadConfig({}).corsOrigins, DEFAULT_CORS_ORIGINS);
  assert.deepEqual(loadConfig({ CORS_ALLOW_ORIGINS: ' https://a.example , https://b.example ' }).corsOrigins, ['https://a.example', 'https://b.example']);
  assert.equal(loadConfig({}).upstreamTimeoutMs, 0);
});

test('迁移文件：命名有序、每个迁移目录都有 migration.sql', () => {
  const names = migrationNames();
  assert.ok(names.length >= 1);
  assert.deepEqual(names, [...names].sort());
  for (const n of names) {
    assert.match(n, /^\d{14}_[\w-]+$/, `迁移目录名不规范：${n}`);
    assert.ok(existsSync(join(MIGRATIONS_DIR, n, 'migration.sql')), `${n} 缺少 migration.sql`);
  }
  assert.ok(existsSync(join(MIGRATIONS_DIR, 'migration_lock.toml')), '缺少 migration_lock.toml');
});

test('迁移：执行后没有待执行项，重复执行无副作用', { skip }, async () => {
  assert.equal((await migrationStatus(prisma)).pending.length, 0);
  assert.match(migrateDeploy(), /No pending migrations to apply/); // 已是最新，无事可做
  const { applied } = await migrationStatus(prisma);
  assert.deepEqual(applied, migrationNames());
});

test('登录：新号送 50 点，/me 一致，坏来源被拒', { skip }, async () => {
  const r = await call('/auth/login', { method: 'POST', body: { phone: '13800138000' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.points, 50); assert.equal(r.data.user.cap, 40); assert.equal(r.data.user.role, 'free');
  token = r.data.token; uid = r.data.user.uid;
  const me = await call('/me', { headers: authed() });
  assert.equal(me.data.user.uid, uid);
  assert.equal((await call('/auth/login', { method: 'POST', body: { phone: '1' } })).status, 400);
  assert.equal((await call('/auth/login', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: { phone: '13800138001' } })).status, 403);
  // 同一手机号再登录不重复建号
  assert.equal((await call('/auth/login', { method: 'POST', body: { phone: '13800138000' } })).data.user.uid, uid);
});

test('CORS：响应头跟随白名单', { skip }, async () => {
  const ok = await call('/', { headers: { Origin: ORIGIN } });
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const other = await call('/', { headers: { Origin: 'https://evil.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), DEFAULT_CORS_ORIGINS[0]);
  assert.equal((await call('/', { method: 'OPTIONS' })).status, 204);
});

test('写作：成功扣 1 点；上游失败退点；无 token 401', { skip }, async () => {
  const chat = (model: string, h: Record<string, string> = authed()) => call('/yq/v1/chat/completions', { method: 'POST', headers: h, body: { model, messages: [] } });
  const a = await chat('m'); assert.equal(a.status, 200); assert.equal(a.headers.get('x-points'), '49');
  const b = await chat('fail'); assert.equal(b.status, 500); assert.equal(b.headers.get('x-points'), '49');
  assert.equal((await call('/me', { headers: authed() })).data.user.points, 49);
  assert.equal((await chat('m', {})).status, 401);
  const led = (await call(`/admin/ledger?uid=${uid}`, { headers: admin })).data.ledger.map((x: { delta: number }) => x.delta);
  assert.deepEqual(led, [1, -1, -1, 50]);
});

test('写作：积分不足回 402', { skip }, async () => {
  await prisma.$executeRaw`UPDATE users SET points = 0 WHERE uid = ${uid}`;
  const r = await call('/yq/v1/chat/completions', { method: 'POST', headers: authed(), body: { model: 'm' } });
  assert.equal(r.status, 402); assert.equal(r.data.points, 0);
});

test('写作：不再有按 IP 的每日次数限制', { skip }, async () => {
  const codes = new Set<number>();
  for (let i = 0; i < 650; i += 25) {
    const rs = await Promise.all(Array.from({ length: 25 }, () => call('/yq/v1/models')));
    rs.forEach((r) => codes.add(r.status));
  }
  assert.deepEqual([...codes], [200]);
});

test('通行码：不扣点', { skip }, async () => {
  const r = await call('/yq/v1/chat/completions', { method: 'POST', headers: { 'X-Tianji-Code': 'code', Origin: 'https://other.example' }, body: { model: 'm' } });
  assert.equal(r.status, 200); assert.equal(r.headers.get('x-points'), null);
});

test('作品：保存、读取、删除', { skip }, async () => {
  assert.equal((await call('/works/w1', { method: 'POST', headers: authed(), body: { title: '测试' } })).status, 200);
  assert.deepEqual((await call('/works', { headers: authed() })).data.works.map((w: { id: string; data: { title: string } }) => [w.id, w.data.title]), [['w1', '测试']]);
  assert.equal((await call('/works', {})).status, 401);
  await call('/works/w1', { method: 'DELETE', headers: authed() });
  assert.equal((await call('/works', { headers: authed() })).data.works.length, 0);
});

test('热点与热词：推送要密码，红线词被滤，读取返回最新一批', { skip }, async () => {
  assert.equal((await call('/hot')).status, 503);
  assert.equal((await call('/hot/push', { method: 'POST', headers: { 'X-Job-Secret': 'x' }, body: {} })).status, 403);
  const topics = [{ title: '【x】热点A', status: '可改编', cat: '都市', ai: { score: 9, stars: 5, ideas: ['i1'] } }, { title: '被红线', status: '可改编', redline: true }];
  assert.deepEqual((await call('/hot/push', { method: 'POST', headers: jobHdr, body: { generatedAt: 't', topics } })).data, { ok: true, topics: 1, works: 0 });
  assert.equal((await call('/hot')).data.topics[0].t, '热点A');
  await call('/words/push', { method: 'POST', headers: jobHdr, body: { words: [{ word: '#重生', heat: 5 }, { word: '校园恋', heat: 9 }] } });
  await call('/words/push', { method: 'POST', headers: jobHdr, body: { words: [{ word: '穿越', heat: 1 }] } });
  assert.deepEqual((await call('/words')).data.words.map((w: { word: string }) => w.word), ['穿越']); // 只留最新一批
});

test('后台：口令校验、统计、加点、改身份', { skip }, async () => {
  assert.equal((await call('/admin/users')).status, 403);
  const users = (await call('/admin/users', { headers: admin })).data.users;
  assert.equal(users[0].uid, uid); assert.equal(typeof users[0].created, 'number'); assert.equal(typeof users[0].works, 'number');
  const st = (await call('/admin/stats', { headers: admin })).data;
  assert.ok(st.today.n >= 2 && st.today.ok >= 1 && st.today.other >= 1);
  assert.equal(typeof st.lastHour.n, 'number');
  assert.equal((await call('/admin/points', { method: 'POST', headers: admin, body: { uid, delta: 10, note: 't' } })).data.user.points, 10);
  assert.equal((await call('/admin/points', { method: 'POST', headers: admin, body: { uid: 'nope', delta: 1 } })).status, 404);
  const role = (await call('/admin/role', { method: 'POST', headers: admin, body: { uid, role: 'tester' } })).data.user.role;
  assert.equal(role, 'tester');
  assert.equal((await call('/me', { headers: authed() })).data.user.points, null); // 测试身份不限点
  assert.equal((await call('/admin/role', { method: 'POST', headers: admin, body: { uid, role: 'x' } })).status, 400);
});

test('任务：状态流转、请求体保留期、过期清理', { skip }, async () => {
  const id = 'a'.repeat(16);
  await createJob(prisma, id, { status: 'queued' }, '{"x":1}');
  assert.equal((await call(`/jobs/${id}`, { headers: { 'X-Tianji-Code': 'code' } })).data.status, 'queued');
  assert.equal((await call(`/jobs/${id}/body`)).status, 403);
  assert.equal((await call(`/jobs/${id}/body`, { headers: jobHdr })).data.x, 1);
  await call(`/jobs/${id}/running`, { method: 'POST', headers: jobHdr });
  assert.equal(JSON.parse((await getJobState(prisma, id))!).status, 'running');
  await call(`/jobs/${id}/done`, { method: 'POST', headers: { ...jobHdr, 'Content-Type': 'application/json' }, body: { choices: [1] } });
  const done = (await call(`/jobs/${id}`, { headers: { 'X-Tianji-Code': 'code' } })).data;
  assert.equal(done.status, 'done'); assert.deepEqual(done.result, { choices: [1] });
  await prisma.job.update({ where: { id }, data: { bodyExpires: 1n } });
  assert.equal((await call(`/jobs/${id}/body`, { headers: jobHdr })).status, 404);
  await prisma.job.update({ where: { id }, data: { stateExpires: 1n } });
  await purgeExpired(prisma);
  assert.equal(await prisma.job.count({ where: { id } }), 0);
});

test('请求体超过上限回 413', { skip }, async () => {
  const r = await call('/works/big', { method: 'POST', headers: authed(), body: { d: 'x'.repeat(200000) } });
  assert.equal(r.status, 413);
});

/* ---- 流式写作：stream:true 时边收边转发，流结束才判成败 ---- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type U = { token: string; uid: string };
async function newUser(phone: string): Promise<U> { const r = await call('/auth/login', { method: 'POST', body: { phone } }); return { token: r.data.token, uid: r.data.user.uid }; }
const ledgerOf = async (u: string): Promise<number[]> => (await call(`/admin/ledger?uid=${u}`, { headers: admin })).data.ledger.map((x: { delta: number }) => x.delta);
const streamChat = (u: U, model: string, signal?: AbortSignal) => fetch(base + '/yq/v1/chat/completions', {
  method: 'POST', signal,
  headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token }, body: JSON.stringify({ model, stream: true, messages: [] }),
});
const drain = async (r: Response) => { const rd = r.body!.getReader(), dec = new TextDecoder(); let out = ''; try { for (;;) { const { done, value } = await rd.read(); if (done) break; out += dec.decode(value, { stream: true }); } } catch { out += '[ERR]'; } return out; };
async function waitFor(fn: () => boolean | Promise<boolean>, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(50); } return false; }

test('流式：边收边转发，正常结束只扣一次点', { skip }, async () => {
  const u = await newUser('13700000001');
  const r = await streamChat(u, 'sse-ok');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type')!, /event-stream/); assert.equal(r.headers.get('x-points'), '49');
  const rd = r.body!.getReader(), dec = new TextDecoder(), t0 = Date.now();
  let text = dec.decode((await rd.read()).value);
  assert.ok(Date.now() - t0 < 250, `首包应在上游结束前到达，实际 ${Date.now() - t0}ms`); // 上游 300ms 后才结束
  for (;;) { const { done, value } = await rd.read(); if (done) break; text += dec.decode(value); }
  assert.ok(text.includes('he') && text.includes('llo') && text.includes('[DONE]'));
  assert.ok(await waitFor(async () => (await prisma.yqLog.count({ where: { model: 'sse-ok', status: 200 } })) === 1));
  assert.deepEqual(await ledgerOf(u.uid), [-1, 50]);
});

test('流式：没收到结尾标记就退点', { skip }, async () => {
  const u = await newUser('13700000002');
  await drain(await streamChat(u, 'sse-noend'));
  assert.ok(await waitFor(async () => (await ledgerOf(u.uid)).length === 3));
  assert.deepEqual(await ledgerOf(u.uid), [1, -1, 50]);
});

test('流式：上游中途断连就退点', { skip }, async () => {
  const u = await newUser('13700000003');
  await drain(await streamChat(u, 'sse-cut'));
  assert.ok(await waitFor(async () => (await ledgerOf(u.uid)).length === 3));
  assert.deepEqual(await ledgerOf(u.uid), [1, -1, 50]);
});

test('流式：浏览器中途断开，取消上游请求并退点', { skip }, async () => {
  const u = await newUser('13700000004'), ac = new AbortController();
  const r = await streamChat(u, 'sse-slow', ac.signal);
  await r.body!.getReader().read(); // 收到第一包后断开
  ac.abort();
  assert.ok(await waitFor(() => upstreamClosed.has('sse-slow')), '上游连接应被关闭');
  assert.ok(await waitFor(async () => (await ledgerOf(u.uid)).length === 3), '应退点');
  assert.deepEqual(await ledgerOf(u.uid), [1, -1, 50]);
  const st = (await call('/admin/stats', { headers: admin })).data;
  assert.ok(st.models.some((m: { model: string; ok: number }) => m.model === 'sse-slow' && m.ok === 0)); // 记为失败
});

/* ---- 以下为 TypeScript + Hono + Zod 重构后新增 ---- */

test('环境变量校验：非法 URL、非法数字直接报错，空值用默认', () => {
  assert.throws(() => loadConfig({ YQ_BASE: 'not a url' }), /YQ_BASE/);
  assert.throws(() => loadConfig({ QWEN_BASE: 'example.com/v1' }), /QWEN_BASE/);
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
  assert.throws(() => loadConfig({ MAX_BODY_BYTES: '-1' }), /MAX_BODY_BYTES/);
  assert.throws(() => loadConfig({ PG_POOL_MAX: '1.5' }), /PG_POOL_MAX/);
  const d = loadConfig({ PORT: '', MAX_BODY_BYTES: '' });
  assert.equal(d.port, 8080); assert.equal(d.maxBodyBytes, 5 * 1024 * 1024);
  assert.equal(loadConfig({ PORT: '9000', YQ_BASE: 'http://127.0.0.1:1' }).port, 9000);
});

test('请求校验：畸形 JSON、手机号、后台参数，状态码与错误文本', { skip }, async () => {
  const login = (raw: string) => call('/auth/login', { method: 'POST', raw });
  assert.deepEqual(await login('{oops').then((r) => [r.status, r.data]), [400, { error: 'bad json' }]);
  assert.deepEqual(await login('{"phone":"12-34"}').then((r) => [r.status, r.data]), [400, { error: '请输入 8–11 码手机号' }]);
  assert.deepEqual(await login('{"phone":"123456789012"}').then((r) => [r.status, r.data]), [400, { error: '请输入 8–11 码手机号' }]);
  assert.deepEqual(await login('[]').then((r) => [r.status, r.data]), [400, { error: '请输入 8–11 码手机号' }]);
  // 不带 Content-Type 也照样按 JSON 解析（旧版行为）
  const noType = await fetch(base + '/auth/login', { method: 'POST', headers: { Origin: ORIGIN }, body: '{"phone":"138-0013-8000"}' });
  assert.equal(noType.status, 200); assert.equal((await noType.json() as { user: { uid: string } }).user.uid, uid);

  const pts = (body: unknown) => call('/admin/points', { method: 'POST', headers: admin, body });
  for (const b of [{}, { uid }, { delta: 5 }, { uid, delta: 0 }, { uid, delta: 'x' }, { uid: '', delta: 1 }]) {
    assert.deepEqual(await pts(b).then((r) => [r.status, r.data]), [400, { error: 'uid and delta required' }], JSON.stringify(b));
  }
  assert.equal((await call('/admin/points', { method: 'POST', headers: admin, raw: 'nope' })).data.error, 'bad json');
  assert.equal((await pts({ uid, delta: '3' })).status, 200); // 字符串数字照旧接受
  for (const role of ['x', '', null]) {
    assert.deepEqual(await call('/admin/role', { method: 'POST', headers: admin, body: { uid, role } }).then((r) => [r.status, r.data]), [400, { error: 'bad role' }]);
  }
  assert.deepEqual((await call('/admin/role', { method: 'POST', headers: admin, body: { role: 'member' } })).data, { user: null }); // 没给 uid 不改任何人
  assert.equal((await call('/admin/ledger', { headers: admin })).data.ledger.length, 0);

  // 作品：请求体必须是 JSON 对象；id 不合规当作路径不存在；未登录先 401
  for (const raw of ['[1,2]', '"str"', 'null', '3']) {
    const r = await call('/works/w2', { method: 'POST', headers: authed(), raw });
    assert.deepEqual([r.status, r.data], [400, { error: 'work must be a JSON object' }], raw);
  }
  assert.equal((await call('/works/w2', { method: 'POST', headers: authed(), raw: '{bad' })).data.error, 'bad json');
  for (const raw of ['[1]', 'null', '"s"']) {
    const r = await call('/jobs', { method: 'POST', headers: { 'X-Tianji-Code': 'code' }, raw });
    assert.deepEqual([r.status, r.data], [400, { error: 'job must be a JSON object' }], raw);
  }
  assert.equal((await call('/jobs', { method: 'POST', headers: { 'X-Tianji-Code': 'code' }, raw: '{' })).data.error, 'bad json');
  assert.equal((await call('/works/' + 'x'.repeat(41), { method: 'POST', headers: authed(), body: {} })).status, 404);
  assert.equal((await call('/works/bad!id', { method: 'POST', body: {} })).status, 401);
  assert.deepEqual(await call('/works/big', { method: 'POST', headers: authed(), body: { d: 'x'.repeat(200000) } }).then((r) => r.data), { error: 'too large' });
});

test('热点推送：字段缺失或类型不对时给默认值，不整批拒收', { skip }, async () => {
  const topics = [null, 'x', { title: 7, status: '可改编', ai: 'bad' }, { title: '【a】B', status: '可改编', cat: '古装', ai: { score: '8', ideas: ['1', '2', '3', '4'] } }];
  const r = await call('/hot/push', { method: 'POST', headers: jobHdr, body: { topics, daily: { works: [{ title: '剧 第二季', ideas: 'no' }] } } });
  assert.deepEqual(r.data, { ok: true, topics: 2, works: 1 });
  const hot = await call('/hot');
  assert.equal(hot.headers.get('cache-control'), 'max-age=300');
  assert.deepEqual(hot.data, {
    at: '',
    topics: [{ t: 'B', cat: '古装', score: 8, stars: 0, trend: '', ideas: ['1', '2', '3'] }, { t: '', cat: '', score: 0, stars: 0, trend: '', ideas: [] }],
    works: [{ t: '剧', genre: '', ideas: [] }],
  });
  assert.deepEqual((await call('/words/push', { method: 'POST', headers: jobHdr, body: { generatedAt: 'g', words: 'bad' } })).data, { ok: true, words: 0 });
  const w = await call('/words/push', { method: 'POST', headers: jobHdr, body: { generatedAt: 'g', words: [{ word: 123, clueCount: '4' }, {}, { word: '#甜宠 ', heat: 9, updatedAt: 'u' }] } });
  assert.deepEqual(w.data, { ok: true, words: 2 });
  assert.deepEqual((await call('/words')).data.words, [
    { word: '甜宠', cat: '', heat: 9, trend: '', updatedAt: 'u' },
    { word: '123', cat: '', heat: 4, trend: '', updatedAt: 'g' },
  ]);
});

test('未知路径统一 404；错误响应带 CORS 与 no-store', { skip }, async () => {
  for (const [method, p] of [['GET', '/nope'], ['GET', '/v2/models'], ['GET', '/auth/login'], ['POST', '/hot'], ['GET', '/jobs/xyz'], ['GET', '/yq/v1/other']] as const) {
    const r = await call(p, { method, headers: { 'X-Tianji-Code': 'code' } });
    assert.deepEqual([r.status, r.data], [404, { error: 'not found' }], `${method} ${p}`);
  }
  for (const p of ['/hot', '/yq/v1/models', '/works', '/admin/users']) assert.equal((await call(p, { method: 'HEAD', headers: { 'X-Tianji-Code': 'code', ...admin, ...authed() } })).status, 404, `HEAD ${p}`);
  assert.equal((await call('/', { method: 'HEAD' })).status, 200);
  assert.equal((await call('/me', { method: 'HEAD', headers: authed() })).status, 200);
  const bad = await call('/me', { headers: { Origin: 'https://evil.example' } });
  assert.deepEqual([bad.status, bad.data], [403, { error: 'origin not allowed' }]);
  assert.equal(bad.headers.get('access-control-allow-origin'), DEFAULT_CORS_ORIGINS[0]);
  assert.equal(bad.headers.get('access-control-expose-headers'), 'X-Points');
  assert.equal(bad.headers.get('cache-control'), 'no-store');
  assert.match(bad.headers.get('content-type')!, /application\/json; charset=utf-8/);
  assert.deepEqual((await call('/v1/models')).data, { error: 'bad access code' });
  assert.deepEqual((await call('/v1/other')).data, { error: 'bad access code' }); // 先校验通行码，再判路径
  assert.deepEqual((await call('/admin/users', { headers: { 'X-Admin-Key': 'no' } })).data, { error: 'forbidden' });
  const pre = await call('/works/x', { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers')!, /X-Admin-Key/);
  assert.equal(pre.headers.get('access-control-max-age'), '86400');
});

test('请求体超限：分块上传也回 413；超限后同一条 keep-alive 连接仍可复用', { skip }, async () => {
  const chunked = await fetch(base + '/works/big', {
    method: 'POST', headers: { Origin: ORIGIN, ...authed() }, duplex: 'half',
    body: new ReadableStream({ start(c) { for (let i = 0; i < 4; i++) c.enqueue(new TextEncoder().encode('x'.repeat(40000))); c.close(); } }),
  } as RequestInit);
  assert.deepEqual([chunked.status, await chunked.json()], [413, { error: 'too large' }]);

  // 旧版回 413 后丢弃剩余请求体、连接保持；这里用同一个 socket 发第二个请求验证（等过 node-server 的 500ms 排空期限）
  const { port } = new URL(base);
  const sock = net.connect(+port, '127.0.0.1');
  let buf = '';
  sock.on('data', (d) => (buf += d));
  const body = 'x'.repeat(200000);
  sock.write(`POST /works/big HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
  assert.ok(await waitFor(() => buf.includes('\r\n\r\n{"error":"too large"}')), '应先收到 413');
  await sleep(700);
  buf = '';
  sock.write('GET / HTTP/1.1\r\nHost: x\r\n\r\n');
  assert.ok(await waitFor(() => buf.includes('{"ok":true}')), `连接应仍可用，实际收到：${JSON.stringify(buf.slice(0, 80))}，已关闭：${sock.destroyed}`);
  sock.destroy();
});
