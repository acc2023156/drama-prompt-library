/* 公司模型代理 /v1/*（对话、审稿）：需要来源与内部通行码，原样转发。上游网址与 key 只在服务端环境变量里 */
import { Hono, type Context } from 'hono';
import { type AppEnv, type Deps, HttpError, accessCodeGuard, originGuard } from '../lib/http.js';

export function modelRoutes({ cfg }: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('/v1/*', originGuard(cfg), accessCodeGuard(cfg));

  const forward = async (c: Context<AppEnv>, path: string) => {
    if (!cfg.qwenBase || !cfg.qwenKey) throw new HttpError(503, 'upstream not configured');
    const body = c.req.method === 'POST' ? await c.req.text() : undefined;
    try {
      // 整剧模型太慢，必须走 /jobs
      if ((JSON.parse(body || '{}') as { model?: unknown }).model === 'qwen38-script') throw new HttpError(400, 'use /jobs for qwen38-script');
    } catch (e) {
      if (e instanceof HttpError) throw e;
    }
    const r = await fetch(cfg.qwenBase + path, {
      method: c.req.method, body, signal: c.req.raw.signal,
      headers: { Authorization: 'Bearer ' + cfg.qwenKey, 'Content-Type': 'application/json' },
    });
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' } });
  };

  app.get('/v1/models', (c) => forward(c, '/v1/models'));
  app.post('/v1/chat/completions', (c) => forward(c, '/v1/chat/completions'));

  return app;
}
