/* 集成测试：需要一个空的测试库，例如
   TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/tianji_test npm run test:worker
   没设 TEST_DATABASE_URL 时整组跳过。测试开始会清空该库里天玑的表，别指向有数据的库。 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadConfig, DEFAULT_CORS_ORIGINS } from '../src/config.js';
import { createDb, ensureSchema } from '../src/db.js';
import { createApp } from '../src/index.js';
import { createServer } from '../src/http.js';
import { createJob, getJobState, purgeExpired } from '../src/store.js';

const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_ && '未设 TEST_DATABASE_URL';
const ORIGIN = DEFAULT_CORS_ORIGINS[2];
const SECRETS = { AUTH_SECRET: 's', ADMIN_KEY: 'adm', ACCESS_CODE: 'code', JOB_SECRET: 'job', YQ_KEY: 'k', QWEN_KEY: 'k' };

let db, upstream, server, base, token, uid;

const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
async function call(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await fetch(base + path, { method, headers: { Origin: ORIGIN, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
}
const authed = () => ({ Authorization: 'Bearer ' + token });
const admin = { 'X-Admin-Key': 'adm' };
const jobHdr = { 'X-Job-Secret': 'job' };

before(async () => {
  if (skip) return;
  // 假上游：model 为 fail 时回 500，其余回 200
  upstream = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      const m = b ? JSON.parse(b).model : '';
      res.writeHead(m === 'fail' ? 500 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(m === 'fail' ? { error: 'boom' } : { choices: [{ message: { content: 'ok ' + req.url } }] }));
    });
  });
  const up = await listen(upstream);
  db = createDb(URL_, 4);
  await ensureSchema(db);
  await db.query('TRUNCATE users, works, yqlog, ledger, snapshots, jobs RESTART IDENTITY');
  const cfg = loadConfig({ ...SECRETS, DATABASE_URL: URL_, YQ_BASE: `http://127.0.0.1:${up}`, QWEN_BASE: `http://127.0.0.1:${up}` });
  server = createServer(createApp({ cfg, db }), { maxBodyBytes: 100000 });
  base = 'http://127.0.0.1:' + await listen(server);
});
after(async () => { if (skip) return; server.close(); upstream.close(); await db.end(); });

test('配置：CORS 默认值与环境变量覆盖', () => {
  assert.deepEqual(loadConfig({}).corsOrigins, DEFAULT_CORS_ORIGINS);
  assert.deepEqual(loadConfig({ CORS_ALLOW_ORIGINS: ' https://a.example , https://b.example ' }).corsOrigins, ['https://a.example', 'https://b.example']);
  assert.equal(loadConfig({}).upstreamTimeoutMs, 0);
});

test('建表可重复执行', { skip }, async () => { await ensureSchema(db); await ensureSchema(db); });

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
  const chat = (model, h = authed()) => call('/yq/v1/chat/completions', { method: 'POST', headers: h, body: { model, messages: [] } });
  const a = await chat('m'); assert.equal(a.status, 200); assert.equal(a.headers.get('x-points'), '49');
  const b = await chat('fail'); assert.equal(b.status, 500); assert.equal(b.headers.get('x-points'), '49');
  assert.equal((await call('/me', { headers: authed() })).data.user.points, 49);
  assert.equal((await chat('m', {})).status, 401);
  const led = (await call(`/admin/ledger?uid=${uid}`, { headers: admin })).data.ledger.map(x => x.delta);
  assert.deepEqual(led, [1, -1, -1, 50]);
});

test('写作：积分不足回 402', { skip }, async () => {
  await db.query('UPDATE users SET points=0 WHERE uid=$1', [uid]);
  const r = await call('/yq/v1/chat/completions', { method: 'POST', headers: authed(), body: { model: 'm' } });
  assert.equal(r.status, 402); assert.equal(r.data.points, 0);
});

test('写作：不再有按 IP 的每日次数限制', { skip }, async () => {
  const codes = new Set();
  for (let i = 0; i < 650; i += 25) {
    const rs = await Promise.all(Array.from({ length: 25 }, () => call('/yq/v1/models')));
    rs.forEach(r => codes.add(r.status));
  }
  assert.deepEqual([...codes], [200]);
});

test('通行码：不扣点', { skip }, async () => {
  const r = await call('/yq/v1/chat/completions', { method: 'POST', headers: { 'X-Tianji-Code': 'code', Origin: 'https://other.example' }, body: { model: 'm' } });
  assert.equal(r.status, 200); assert.equal(r.headers.get('x-points'), null);
});

test('作品：保存、读取、删除', { skip }, async () => {
  assert.equal((await call('/works/w1', { method: 'POST', headers: authed(), body: { title: '测试' } })).status, 200);
  assert.deepEqual((await call('/works', { headers: authed() })).data.works.map(w => [w.id, w.data.title]), [['w1', '测试']]);
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
  assert.deepEqual((await call('/words')).data.words.map(w => w.word), ['穿越']);   // 只留最新一批
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
  assert.equal((await call('/me', { headers: authed() })).data.user.points, null);   // 测试身份不限点
  assert.equal((await call('/admin/role', { method: 'POST', headers: admin, body: { uid, role: 'x' } })).status, 400);
});

test('任务：状态流转、请求体保留期、过期清理', { skip }, async () => {
  const id = 'a'.repeat(16);
  await createJob(db, id, { status: 'queued' }, '{"x":1}');
  assert.equal((await call(`/jobs/${id}`, { headers: { 'X-Tianji-Code': 'code' } })).data.status, 'queued');
  assert.equal((await call(`/jobs/${id}/body`)).status, 403);
  assert.equal((await call(`/jobs/${id}/body`, { headers: jobHdr })).data.x, 1);
  await call(`/jobs/${id}/running`, { method: 'POST', headers: jobHdr });
  assert.equal(JSON.parse(await getJobState(db, id)).status, 'running');
  await call(`/jobs/${id}/done`, { method: 'POST', headers: { ...jobHdr, 'Content-Type': 'application/json' }, body: { choices: [1] } });
  const done = (await call(`/jobs/${id}`, { headers: { 'X-Tianji-Code': 'code' } })).data;
  assert.equal(done.status, 'done'); assert.deepEqual(done.result, { choices: [1] });
  await db.query('UPDATE jobs SET body_expires=1 WHERE id=$1', [id]);
  assert.equal((await call(`/jobs/${id}/body`, { headers: jobHdr })).status, 404);
  await db.query('UPDATE jobs SET state_expires=1 WHERE id=$1', [id]);
  await purgeExpired(db);
  assert.equal((await db.query('SELECT 1 FROM jobs WHERE id=$1', [id])).rowCount, 0);
});

test('请求体超过上限回 413', { skip }, async () => {
  const r = await call('/works/big', { method: 'POST', headers: authed(), body: { d: 'x'.repeat(200000) } });
  assert.equal(r.status, 413);
});
