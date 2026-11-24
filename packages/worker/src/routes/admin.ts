/* 会员管理后台（X-Admin-Key 共享口令）：用户列表、调用统计、积分流水、加点、改身份 */
import { Hono } from 'hono';
import { z } from 'zod';
import { plainRow } from '../lib/db.js';
import { type AppEnv, type Deps, HttpError, json, originGuard } from '../lib/http.js';
import { bjDay, getUser, userRow } from '../lib/points.js';
import { safeEqual } from '../lib/token.js';
import { looseObject, readJson, zQuery } from '../lib/validate.js';

// 重复的 ?uid= 取第一个，与 URLSearchParams.get 一致
const LedgerQuery = z.object({ uid: z.preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().optional()) });
const PointsBody = looseObject({
  uid: z.union([z.string().min(1), z.number().refine((n) => n !== 0)]).transform(String),
  delta: z.unknown().optional().transform((v) => parseInt(String(v), 10)).refine((n) => !!n),
  note: z.unknown().optional(),
});
const RoleBody = looseObject({
  role: z.enum(['free', 'member', 'tester']),
  uid: z.unknown().optional().transform((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : null)),
});

export function adminRoutes({ cfg, prisma }: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('/admin/*', originGuard(cfg), async (c, next) => {
    if (!cfg.adminKey || !safeEqual(c.req.header('X-Admin-Key') ?? '', cfg.adminKey)) throw new HttpError(403, 'forbidden');
    await next();
  });

  app.get('/admin/users', async (c) => {
    const day = bjDay();
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT u.*, (SELECT COUNT(*) FROM works w WHERE w.uid = u.uid)::int AS works,
        (SELECT -COALESCE(SUM(delta), 0) FROM ledger l WHERE l.uid = u.uid AND l.day = ${day} AND l.delta < 0)::int AS used_today
      FROM users u ORDER BY last_login DESC NULLS LAST LIMIT 500`;
    return json(c, { day, users: rows.map(plainRow) });
  });

  app.get('/admin/stats', async (c) => {
    const day = bjDay(), hourAgo = BigInt(Date.now() - 3600e3);
    const [today] = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COUNT(*)::int n, COUNT(*) FILTER (WHERE status = 200)::int ok, COUNT(*) FILTER (WHERE status = 429)::int busy,
        COUNT(*) FILTER (WHERE status = 504)::int timeout, COUNT(*) FILTER (WHERE status NOT IN (200, 429, 504))::int other,
        ROUND(AVG(ms) FILTER (WHERE status = 200))::int avg_ms, MAX(ms) max_ms
      FROM yqlog WHERE day = ${day}`;
    const models = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT model, COUNT(*)::int n, COUNT(*) FILTER (WHERE status = 200)::int ok, ROUND(AVG(ms) FILTER (WHERE status = 200))::int avg_ms
      FROM yqlog WHERE day = ${day} GROUP BY model ORDER BY n DESC`;
    const [lastHour] = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COUNT(*)::int n, COUNT(*) FILTER (WHERE status = 200)::int ok FROM yqlog WHERE at > ${hourAgo}`;
    return json(c, { day, today, lastHour, models });
  });

  app.get('/admin/ledger', zQuery(LedgerQuery), async (c) => {
    const { uid } = c.req.valid('query');
    // 没给 uid 时旧版查 uid = NULL，结果恒为空
    const rows = uid === undefined ? [] : await prisma.ledger.findMany({ where: { uid }, orderBy: { id: 'desc' }, take: 100 });
    return json(c, { ledger: rows.map(plainRow) });
  });

  app.post('/admin/points', async (c) => {
    const b = await readJson(c, PointsBody, 'uid and delta required');
    const n = await prisma.$executeRaw`UPDATE users SET points = GREATEST(0, points + ${b.delta}) WHERE uid = ${b.uid}`;
    if (!n) throw new HttpError(404, 'no user');
    await prisma.ledger.create({
      data: { uid: b.uid, delta: b.delta, reason: '后台加点' + (b.note ? '：' + String(b.note).slice(0, 60) : ''), at: BigInt(Date.now()), day: bjDay() },
    });
    const u = await getUser(prisma, b.uid);
    return json(c, { user: u && userRow(u) });
  });

  app.post('/admin/role', async (c) => {
    const b = await readJson(c, RoleBody, 'bad role');
    if (b.uid === null) return json(c, { user: null }); // 没给 uid：旧版的 UPDATE 不命中任何行
    await prisma.user.updateMany({ where: { uid: b.uid }, data: { role: b.role, day: null } });
    const u = await getUser(prisma, b.uid);
    return json(c, { user: u && userRow(u) });
  });

  return app;
}
