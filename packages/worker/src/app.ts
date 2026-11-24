/* tianji-api 应用：中间件 + 各领域路由。createApp 不碰网络与进程，测试直接用 */
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { type AppEnv, type Deps, HttpError, json } from './lib/http.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { feedRoutes } from './routes/feeds.js';
import { jobRoutes } from './routes/jobs.js';
import { modelRoutes } from './routes/models.js';
import { yqRoutes } from './routes/yq.js';

export function createApp(deps: Deps): Hono<AppEnv> {
  const allow = deps.cfg.corsOrigins;
  const app = new Hono<AppEnv>();

  // 来源在白名单就回显，否则回第一个白名单项（浏览器会因不匹配而拦下）；预检直接 204
  app.use(cors({
    origin: (o) => (allow.includes(o) ? o : (allow[0] ?? '')),
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Tianji-Code', 'Authorization', 'X-Admin-Key'],
    exposeHeaders: ['X-Points'],
    maxAge: 86400,
  }));
  // 请求体上限。Content-Length 已超限时直接回 413、不碰请求体：hono 的 bodyLimit 会先取 c.req.raw.body，
  // 之后 node-server 排空剩余请求体时读不完，500ms 后强关这条 keep-alive 连接，客户端复用它就会 ECONNRESET
  const limit = deps.cfg.maxBodyBytes;
  const tooLarge = (c: Context) => json(c, { error: 'too large' }, 413);
  const streamLimit = bodyLimit({ maxSize: limit, onError: tooLarge });
  app.use(async (c, next) => {
    const len = c.req.header('Content-Length');
    if (len !== undefined && !c.req.header('Transfer-Encoding')) return Number(len) > limit ? tooLarge(c) : next();
    return streamLimit(c, next);
  });

  // hono 默认用 GET 路由应答 HEAD；旧版按方法精确匹配，只有 / 与 /me 不限方法，其余 HEAD 一律当作未知路径
  const anyMethod = new Set(['/', '/me']);
  app.use(async (c, next) => (c.req.method === 'HEAD' && !anyMethod.has(c.req.path) ? json(c, { error: 'not found' }, 404) : next()));

  app.all('/', (c) => json(c, { ok: true }));
  app.route('/', accountRoutes(deps));
  app.route('/', adminRoutes(deps));
  app.route('/', feedRoutes(deps));
  app.route('/', jobRoutes(deps));
  app.route('/', yqRoutes(deps));
  app.route('/', modelRoutes(deps));

  app.notFound((c) => json(c, { error: 'not found' }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) return json(c, { error: err.message }, err.status);
    if (err instanceof HTTPException) return json(c, { error: err.message || 'bad request' }, err.status);
    console.error('[error]', c.req.method, c.req.path, err);
    return json(c, { error: 'internal error' }, 500);
  });
  return app;
}
