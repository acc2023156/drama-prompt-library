/* 天玑帐号：手机号登录（不验证）、作品上云、每日积分 */
import { randomInt } from 'node:crypto';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { Prisma, nowMs } from '../lib/db.js';
import { type AppEnv, type Deps, HttpError, json, originGuard } from '../lib/http.js';
import { NEW_BONUS, bjDay, getUser, pub, refill } from '../lib/points.js';
import { makeToken, readToken } from '../lib/token.js';
import { looseObject, readJson, zParam } from '../lib/validate.js';

const MAX_WORK_CHARS = 900_000;

const LoginBody = looseObject({
  phone: z.unknown().optional().transform((v) => String(v || '').replace(/\D/g, '')).pipe(z.string().min(8).max(11)),
});
const WorkId = z.object({ id: z.string().regex(/^[\w-]{1,40}$/) });
// 作品是前端的 JSON 对象，原样存下；校验只看形状，不改内容
const WorkBody = z.custom<Record<string, unknown>>((v) => v !== null && typeof v === 'object' && !Array.isArray(v), 'work must be a JSON object');

export function accountRoutes({ cfg, prisma }: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const guard = originGuard(cfg);

  const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
    const uid = readToken(cfg.authSecret, c.req.header('Authorization'));
    if (!uid) throw new HttpError(401, 'login required');
    c.set('uid', uid);
    await next();
  };

  app.post('/auth/login', guard, async (c) => {
    const { phone } = await readJson(c, LoginBody, '请输入 8–11 码手机号');
    let u = await prisma.user.findUnique({ where: { phone } });
    if (!u) {
      const now = nowMs(), day = bjDay();
      let uid = '';
      for (let i = 0; i < 5; i++) {
        uid = 'TJ' + randomInt(100000, 1000000);
        if (!(await getUser(prisma, uid))) break;
      }
      try {
        u = await prisma.$transaction(async (tx) => {
          const created = await tx.user.create({ data: { uid, phone, role: 'free', points: NEW_BONUS, day, created: now, lastLogin: now } });
          await tx.ledger.create({ data: { uid, delta: NEW_BONUS, reason: '新号赠送', at: now, day } });
          return created;
        });
      } catch (e) {
        // 同一手机号并发注册，别人先建好了
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        u = await prisma.user.findUnique({ where: { phone } });
        if (!u) throw e;
      }
    } else {
      await prisma.user.updateMany({ where: { uid: u.uid }, data: { lastLogin: nowMs() } });
      u = await refill(prisma, u);
    }
    return json(c, { token: makeToken(cfg.authSecret, u.uid), user: pub(u) });
  });

  // /me 不限方法（与旧版一致）
  app.all('/me', guard, requireUser, async (c) => {
    const u = await getUser(prisma, c.get('uid'));
    if (!u) throw new HttpError(401, 'login required');
    return json(c, { user: pub(await refill(prisma, u)) });
  });

  // /works 下的任何路径都先要求登录，再匹配路由
  app.use('/works/*', guard, requireUser);

  app.get('/works', async (c) => {
    const rows = await prisma.work.findMany({ where: { uid: c.get('uid') }, orderBy: { updated: 'desc' }, select: { id: true, data: true, updated: true } });
    return json(c, { works: rows.map((x) => ({ id: x.id, updated: Number(x.updated), data: JSON.parse(x.data) as unknown })) });
  });

  app.post('/works/:id', zParam(WorkId), async (c) => {
    // c.req.text() 有缓存，readJson 里再读不会重复消费请求体
    if ((await c.req.text()).length > MAX_WORK_CHARS) throw new HttpError(413, 'too large');
    const d = await readJson(c, WorkBody);
    const uid = c.get('uid'), { id } = c.req.valid('param');
    const data = { data: JSON.stringify(d), updated: nowMs() };
    await prisma.work.upsert({ where: { uid_id: { uid, id } }, create: { uid, id, ...data }, update: data });
    return json(c, { ok: true });
  });

  app.delete('/works/:id', zParam(WorkId), async (c) => {
    await prisma.work.deleteMany({ where: { uid: c.get('uid'), id: c.req.valid('param').id } });
    return json(c, { ok: true });
  });

  return app;
}
