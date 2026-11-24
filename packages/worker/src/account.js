/* 天玑帐号：手机号登录（不验证）、作品上云、每日积分、管理后台 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const FREE_DAILY = 40;     // 免费用户每天补到
export const MEMBER_DAILY = 200;  // 会员每天补到
export const NEW_BONUS = 50;      // 新号首日
const TOKEN_DAYS = 30;

// token 格式 uid.过期毫秒.签名（HMAC-SHA256，base64url）；算法不能变，否则已登录的人会掉线
const hmac = (secret, msg) => createHmac('sha256', secret).update(msg).digest('base64url');
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
export function makeToken(cfg, uid) {
  const exp = Date.now() + TOKEN_DAYS * 864e5, body = `${uid}.${exp}`;
  return `${body}.${hmac(cfg.authSecret, body)}`;
}
export function readToken(cfg, req) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/); if (!m) return null;
  const [uid, exp, sig] = m[1].split('.'); if (!uid || !exp || !sig || +exp < Date.now()) return null;
  return safeEqual(hmac(cfg.authSecret, `${uid}.${exp}`), sig) ? uid : null;
}

export const bjDay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const capOf = role => role === 'member' ? MEMBER_DAILY : FREE_DAILY;
const pub = u => ({ uid: u.uid, phone: u.phone, role: u.role, points: u.role === 'tester' ? null : u.points, cap: u.role === 'tester' ? null : capOf(u.role) });

const getUser = async (q, uid) => (await q.query('SELECT * FROM users WHERE uid=$1', [uid])).rows[0] || null;

/* 换日补点：补到上限，不累加。q 可以是连接池，也可以是事务里的 client */
export async function refill(q, u) {
  const day = bjDay(); if (u.day === day) return u;
  const cap = capOf(u.role), pts = Math.max(u.points || 0, cap);
  await q.query('UPDATE users SET points=$1, day=$2 WHERE uid=$3', [pts, day, u.uid]);
  if (pts !== u.points) await q.query('INSERT INTO ledger(uid,delta,reason,at,day) VALUES($1,$2,$3,$4,$5)', [u.uid, pts - (u.points || 0), '每日补满', Date.now(), day]);
  return { ...u, points: pts, day };
}

/* 扣点：成功回传剩余点数；测试身份不扣；不够回传 short。事务里锁住用户行，补点与扣点不会并发错位 */
export function charge(db, uid, n, reason) {
  return db.tx(async c => {
    let u = (await c.query('SELECT * FROM users WHERE uid=$1 FOR UPDATE', [uid])).rows[0];
    if (!u) return { error: 'no user' };
    u = await refill(c, u);
    if (u.role === 'tester') { await c.query('UPDATE users SET used_total=used_total+$1 WHERE uid=$2', [n, uid]); return { points: null }; }
    if (u.points < n) return { points: u.points, short: true };
    await c.query('UPDATE users SET points=points-$1, used_total=used_total+$1 WHERE uid=$2', [n, uid]);
    await c.query('INSERT INTO ledger(uid,delta,reason,at,day) VALUES($1,$2,$3,$4,$5)', [uid, -n, reason, Date.now(), bjDay()]);
    return { points: u.points - n };
  });
}

/* 上游失败时退回刚扣的点（测试身份本来就没扣） */
export function refund(db, uid, n, reason) {
  return db.tx(async c => {
    const r = await c.query(
      `UPDATE users SET points=points+$1, used_total=GREATEST(0, used_total-$1) WHERE uid=$2 AND role<>'tester' RETURNING points`, [n, uid]);
    if (!r.rowCount) return null;
    await c.query('INSERT INTO ledger(uid,delta,reason,at,day) VALUES($1,$2,$3,$4,$5)', [uid, n, reason, Date.now(), bjDay()]);
    return r.rows[0].points;
  });
}

export async function logCall(db, status, ms, model) {
  await db.query('INSERT INTO yqlog(day,at,status,ms,model) VALUES($1,$2,$3,$4,$5)', [bjDay(), Date.now(), status, ms, String(model).slice(0, 60)]);
}

export async function handleAccount(req, ctx, p, h, json) {
  const { cfg, db } = ctx;
  if (p === '/auth/login' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
    const phone = String(b.phone || '').replace(/\D/g, '');
    if (phone.length < 8 || phone.length > 11) return json({ error: '请输入 8–11 码手机号' }, 400, h);
    let u = (await db.query('SELECT * FROM users WHERE phone=$1', [phone])).rows[0];
    const now = Date.now(), day = bjDay();
    if (!u) {
      let uid; for (let i = 0; i < 5; i++) { uid = 'TJ' + randomInt(100000, 1000000); if (!(await getUser(db, uid))) break; }
      try {
        u = await db.tx(async c => {
          await c.query('INSERT INTO users(uid,phone,role,points,day,created,last_login) VALUES($1,$2,$3,$4,$5,$6,$7)', [uid, phone, 'free', NEW_BONUS, day, now, now]);
          await c.query('INSERT INTO ledger(uid,delta,reason,at,day) VALUES($1,$2,$3,$4,$5)', [uid, NEW_BONUS, '新号赠送', now, day]);
          return getUser(c, uid);
        });
      } catch (e) {
        if (e.code !== '23505') throw e;   // 同一手机号并发注册，别人先建好了
        u = (await db.query('SELECT * FROM users WHERE phone=$1', [phone])).rows[0];
      }
    } else {
      await db.query('UPDATE users SET last_login=$1 WHERE uid=$2', [now, u.uid]);
      u = await refill(db, u);
    }
    return json({ token: makeToken(cfg, u.uid), user: pub(u) }, 200, h);
  }

  const uid = readToken(cfg, req);
  if (p === '/me' || p.startsWith('/works')) {
    if (!uid) return json({ error: 'login required' }, 401, h);
    if (p === '/me') { const u = await getUser(db, uid); return u ? json({ user: pub(await refill(db, u)) }, 200, h) : json({ error: 'login required' }, 401, h); }
    if (p === '/works' && req.method === 'GET') {
      const r = await db.query('SELECT id, data, updated FROM works WHERE uid=$1 ORDER BY updated DESC', [uid]);
      return json({ works: r.rows.map(x => ({ id: x.id, updated: x.updated, data: JSON.parse(x.data) })) }, 200, h);
    }
    const m = p.match(/^\/works\/([\w-]{1,40})$/);
    if (m && req.method === 'POST') {
      const text = await req.text(); if (text.length > 900000) return json({ error: 'too large' }, 413, h);
      let d; try { d = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400, h); }
      await db.query('INSERT INTO works(uid,id,data,updated) VALUES($1,$2,$3,$4) ON CONFLICT(uid,id) DO UPDATE SET data=excluded.data, updated=excluded.updated',
        [uid, m[1], JSON.stringify(d), Date.now()]);
      return json({ ok: true }, 200, h);
    }
    if (m && req.method === 'DELETE') { await db.query('DELETE FROM works WHERE uid=$1 AND id=$2', [uid, m[1]]); return json({ ok: true }, 200, h); }
    return json({ error: 'not found' }, 404, h);
  }

  if (p.startsWith('/admin/')) {
    if (!cfg.adminKey || !safeEqual(req.headers.get('X-Admin-Key') || '', cfg.adminKey)) return json({ error: 'forbidden' }, 403, h);
    if (p === '/admin/users' && req.method === 'GET') {
      const day = bjDay();
      const r = await db.query(`SELECT u.*, (SELECT COUNT(*) FROM works w WHERE w.uid=u.uid)::int AS works,
        (SELECT -COALESCE(SUM(delta),0) FROM ledger l WHERE l.uid=u.uid AND l.day=$1 AND l.delta<0)::int AS used_today
        FROM users u ORDER BY last_login DESC NULLS LAST LIMIT 500`, [day]);
      return json({ day, users: r.rows }, 200, h);
    }
    if (p === '/admin/stats' && req.method === 'GET') {
      const day = bjDay();
      const t = (await db.query(`SELECT COUNT(*)::int n, COUNT(*) FILTER (WHERE status=200)::int ok, COUNT(*) FILTER (WHERE status=429)::int busy,
        COUNT(*) FILTER (WHERE status=504)::int timeout, COUNT(*) FILTER (WHERE status NOT IN (200,429,504))::int other,
        ROUND(AVG(ms) FILTER (WHERE status=200))::int avg_ms, MAX(ms) max_ms FROM yqlog WHERE day=$1`, [day])).rows[0];
      const m = await db.query(`SELECT model, COUNT(*)::int n, COUNT(*) FILTER (WHERE status=200)::int ok, ROUND(AVG(ms) FILTER (WHERE status=200))::int avg_ms
        FROM yqlog WHERE day=$1 GROUP BY model ORDER BY n DESC`, [day]);
      const hr = (await db.query('SELECT COUNT(*)::int n, COUNT(*) FILTER (WHERE status=200)::int ok FROM yqlog WHERE at>$1', [Date.now() - 3600e3])).rows[0];
      return json({ day, today: t, lastHour: hr, models: m.rows }, 200, h);
    }
    if (p === '/admin/ledger' && req.method === 'GET') {
      const uid2 = new URL(req.url).searchParams.get('uid');
      const r = await db.query('SELECT * FROM ledger WHERE uid=$1 ORDER BY id DESC LIMIT 100', [uid2]);
      return json({ ledger: r.rows }, 200, h);
    }
    let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
    if (p === '/admin/points' && req.method === 'POST') {
      const n = parseInt(b.delta, 10); if (!b.uid || !n) return json({ error: 'uid and delta required' }, 400, h);
      const r = await db.query('UPDATE users SET points=GREATEST(0,points+$1) WHERE uid=$2', [n, b.uid]);
      if (!r.rowCount) return json({ error: 'no user' }, 404, h);
      await db.query('INSERT INTO ledger(uid,delta,reason,at,day) VALUES($1,$2,$3,$4,$5)', [b.uid, n, '后台加点' + (b.note ? '：' + String(b.note).slice(0, 60) : ''), Date.now(), bjDay()]);
      return json({ user: await getUser(db, b.uid) }, 200, h);
    }
    if (p === '/admin/role' && req.method === 'POST') {
      if (!['free', 'member', 'tester'].includes(b.role)) return json({ error: 'bad role' }, 400, h);
      await db.query('UPDATE users SET role=$1, day=NULL WHERE uid=$2', [b.role, b.uid]);
      return json({ user: await getUser(db, b.uid) }, 200, h);
    }
    return json({ error: 'not found' }, 404, h);
  }
  return null;
}
