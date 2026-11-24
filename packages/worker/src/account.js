/* 天玑帐号：手机号登录（不验证）、作品上云、每日积分、管理后台 */
export const FREE_DAILY = 40;     // 免费用户每天补到
export const MEMBER_DAILY = 200;  // 会员每天补到
export const NEW_BONUS = 50;      // 新号首日
const TOKEN_DAYS = 30;

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
export async function makeToken(env, uid) {
  const exp = Date.now() + TOKEN_DAYS * 864e5, body = `${uid}.${exp}`;
  return `${body}.${await hmac(env.AUTH_SECRET, body)}`;
}
export async function readToken(env, req) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/); if (!m) return null;
  const [uid, exp, sig] = m[1].split('.'); if (!uid || !exp || !sig || +exp < Date.now()) return null;
  return (await hmac(env.AUTH_SECRET, `${uid}.${exp}`)) === sig ? uid : null;
}

export const bjDay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const capOf = role => role === 'member' ? MEMBER_DAILY : FREE_DAILY;
const pub = u => ({ uid: u.uid, phone: u.phone, role: u.role, points: u.role === 'tester' ? null : u.points, cap: u.role === 'tester' ? null : capOf(u.role) });

export async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users(uid TEXT PRIMARY KEY, phone TEXT UNIQUE, role TEXT DEFAULT 'free', points INTEGER DEFAULT 0, day TEXT, created INTEGER, last_login INTEGER, used_total INTEGER DEFAULT 0)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS works(uid TEXT, id TEXT, data TEXT, updated INTEGER, PRIMARY KEY(uid,id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS yqlog(id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT, at INTEGER, status INTEGER, ms INTEGER, model TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, delta INTEGER, reason TEXT, at INTEGER, day TEXT)`),
  ]);
}

/* 换日补点：补到上限，不累加 */
export async function refill(env, u) {
  const day = bjDay(); if (u.day === day) return u;
  const cap = capOf(u.role), pts = Math.max(u.points || 0, cap);
  await env.DB.prepare('UPDATE users SET points=?, day=? WHERE uid=?').bind(pts, day, u.uid).run();
  if (pts !== u.points) await env.DB.prepare('INSERT INTO ledger(uid,delta,reason,at,day) VALUES(?,?,?,?,?)').bind(u.uid, pts - (u.points || 0), '每日补满', Date.now(), day).run();
  return { ...u, points: pts, day };
}
const getUser = (env, uid) => env.DB.prepare('SELECT * FROM users WHERE uid=?').bind(uid).first();

/* 扣点：成功回传剩余点数；测试身份不扣；不够回传 null */
export async function charge(env, uid, n, reason) {
  let u = await getUser(env, uid); if (!u) return { error: 'no user' };
  u = await refill(env, u);
  if (u.role === 'tester') { await env.DB.prepare('UPDATE users SET used_total=used_total+? WHERE uid=?').bind(n, uid).run(); return { points: null }; }
  const r = await env.DB.prepare('UPDATE users SET points=points-?, used_total=used_total+? WHERE uid=? AND points>=?').bind(n, n, uid, n).run();
  if (!r.meta.changes) return { points: u.points, short: true };
  await env.DB.prepare('INSERT INTO ledger(uid,delta,reason,at,day) VALUES(?,?,?,?,?)').bind(uid, -n, reason, Date.now(), bjDay()).run();
  return { points: u.points - n };
}

/* 上游失败时退回刚扣的点（测试身份本来就没扣） */
export async function refund(env, uid, n, reason) {
  const u = await getUser(env, uid); if (!u || u.role === 'tester') return null;
  await env.DB.prepare('UPDATE users SET points=points+?, used_total=MAX(0,used_total-?) WHERE uid=?').bind(n, n, uid).run();
  await env.DB.prepare('INSERT INTO ledger(uid,delta,reason,at,day) VALUES(?,?,?,?,?)').bind(uid, n, reason, Date.now(), bjDay()).run();
  return u.points + n;
}
let schemaOk = false;
export async function logCall(env, status, ms, model) {
  if (!schemaOk) { await ensureSchema(env); schemaOk = true; }
  await env.DB.prepare('INSERT INTO yqlog(day,at,status,ms,model) VALUES(?,?,?,?,?)').bind(bjDay(), Date.now(), status, ms, String(model).slice(0, 60)).run();
}
export async function handleAccount(req, env, p, h, json) {
  if (p === '/auth/login' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
    const phone = String(b.phone || '').replace(/\D/g, '');
    if (phone.length < 8 || phone.length > 11) return json({ error: '请输入 8–11 码手机号' }, 400, h);
    await ensureSchema(env);
    let u = await env.DB.prepare('SELECT * FROM users WHERE phone=?').bind(phone).first();
    const now = Date.now(), day = bjDay();
    if (!u) {
      let uid; for (let i = 0; i < 5; i++) { uid = 'TJ' + String(Math.floor(100000 + Math.random() * 900000)); if (!(await getUser(env, uid))) break; }
      await env.DB.prepare('INSERT INTO users(uid,phone,role,points,day,created,last_login) VALUES(?,?,?,?,?,?,?)').bind(uid, phone, 'free', NEW_BONUS, day, now, now).run();
      await env.DB.prepare('INSERT INTO ledger(uid,delta,reason,at,day) VALUES(?,?,?,?,?)').bind(uid, NEW_BONUS, '新号赠送', now, day).run();
      u = await getUser(env, uid);
    } else {
      await env.DB.prepare('UPDATE users SET last_login=? WHERE uid=?').bind(now, u.uid).run();
      u = await refill(env, u);
    }
    return json({ token: await makeToken(env, u.uid), user: pub(u) }, 200, h);
  }

  const uid = await readToken(env, req);
  if (p === '/me' || p.startsWith('/works')) {
    if (!uid) return json({ error: 'login required' }, 401, h);
    await ensureSchema(env);
    if (p === '/me') { const u = await getUser(env, uid); return u ? json({ user: pub(await refill(env, u)) }, 200, h) : json({ error: 'login required' }, 401, h); }
    if (p === '/works' && req.method === 'GET') {
      const r = await env.DB.prepare('SELECT id, data, updated FROM works WHERE uid=? ORDER BY updated DESC').bind(uid).all();
      return json({ works: r.results.map(x => ({ id: x.id, updated: x.updated, data: JSON.parse(x.data) })) }, 200, h);
    }
    const m = p.match(/^\/works\/([\w-]{1,40})$/);
    if (m && req.method === 'POST') {
      const text = await req.text(); if (text.length > 900000) return json({ error: 'too large' }, 413, h);
      let d; try { d = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400, h); }
      await env.DB.prepare('INSERT INTO works(uid,id,data,updated) VALUES(?,?,?,?) ON CONFLICT(uid,id) DO UPDATE SET data=excluded.data, updated=excluded.updated')
        .bind(uid, m[1], JSON.stringify(d), Date.now()).run();
      return json({ ok: true }, 200, h);
    }
    if (m && req.method === 'DELETE') { await env.DB.prepare('DELETE FROM works WHERE uid=? AND id=?').bind(uid, m[1]).run(); return json({ ok: true }, 200, h); }
    return json({ error: 'not found' }, 404, h);
  }

  if (p.startsWith('/admin/')) {
    if (!env.ADMIN_KEY || req.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return json({ error: 'forbidden' }, 403, h);
    await ensureSchema(env);
    if (p === '/admin/users' && req.method === 'GET') {
      const day = bjDay();
      const r = await env.DB.prepare(`SELECT u.*, (SELECT COUNT(*) FROM works w WHERE w.uid=u.uid) AS works,
        (SELECT -COALESCE(SUM(delta),0) FROM ledger l WHERE l.uid=u.uid AND l.day=? AND l.delta<0) AS used_today
        FROM users u ORDER BY last_login DESC LIMIT 500`).bind(day).all();
      return json({ day, users: r.results }, 200, h);
    }
    if (p === '/admin/stats' && req.method === 'GET') {
      const day = bjDay();
      const t = await env.DB.prepare(`SELECT COUNT(*) n, SUM(status=200) ok, SUM(status=429) busy, SUM(status=504) timeout, SUM(status NOT IN (200,429,504)) other, CAST(AVG(CASE WHEN status=200 THEN ms END) AS INTEGER) avg_ms, MAX(ms) max_ms FROM yqlog WHERE day=?`).bind(day).first();
      const m = await env.DB.prepare(`SELECT model, COUNT(*) n, SUM(status=200) ok, CAST(AVG(CASE WHEN status=200 THEN ms END) AS INTEGER) avg_ms FROM yqlog WHERE day=? GROUP BY model ORDER BY n DESC`).bind(day).all();
      const hr = await env.DB.prepare(`SELECT COUNT(*) n, SUM(status=200) ok FROM yqlog WHERE at>?`).bind(Date.now() - 3600e3).first();
      return json({ day, today: t, lastHour: hr, models: m.results }, 200, h);
    }
    if (p === '/admin/ledger' && req.method === 'GET') {
      const uid2 = new URL(req.url).searchParams.get('uid');
      const r = await env.DB.prepare('SELECT * FROM ledger WHERE uid=? ORDER BY id DESC LIMIT 100').bind(uid2).all();
      return json({ ledger: r.results }, 200, h);
    }
    let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
    if (p === '/admin/points' && req.method === 'POST') {
      const n = parseInt(b.delta, 10); if (!b.uid || !n) return json({ error: 'uid and delta required' }, 400, h);
      const r = await env.DB.prepare('UPDATE users SET points=MAX(0,points+?) WHERE uid=?').bind(n, b.uid).run();
      if (!r.meta.changes) return json({ error: 'no user' }, 404, h);
      await env.DB.prepare('INSERT INTO ledger(uid,delta,reason,at,day) VALUES(?,?,?,?,?)').bind(b.uid, n, '后台加点' + (b.note ? '：' + String(b.note).slice(0, 60) : ''), Date.now(), bjDay()).run();
      return json({ user: await getUser(env, b.uid) }, 200, h);
    }
    if (p === '/admin/role' && req.method === 'POST') {
      if (!['free', 'member', 'tester'].includes(b.role)) return json({ error: 'bad role' }, 400, h);
      await env.DB.prepare('UPDATE users SET role=?, day=NULL WHERE uid=?').bind(b.role, b.uid).run();
      return json({ user: await getUser(env, b.uid) }, 200, h);
    }
    return json({ error: 'not found' }, 404, h);
  }
  return null;
}
