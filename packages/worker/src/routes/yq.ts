/* 云桥写作代理 /yq/v1/*：对天玑网页开放（不需通行码），只认白名单来源；登录后每次写作扣 1 点，失败退点 */
import { Hono, type Context } from 'hono';
import { type AppEnv, type Deps, HttpError, accessCodeOk, json } from '../lib/http.js';
import { charge, logCall, refund } from '../lib/points.js';
import { readToken } from '../lib/token.js';

const CHAT = '/v1/chat/completions';
// 串流结尾标记：OpenAI 兼容格式的 [DONE] 或带 finish_reason 的最后一帧
const END_MARK = /"finish_reason":"[a-z_]+"/;

export function yqRoutes({ cfg, prisma }: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('/yq/v1/*', async (c, next) => {
    const trusted = accessCodeOk(cfg, c.req.header('X-Tianji-Code'));
    // 与其他接口不同：没有 Origin 头也拒绝（除非带通行码）
    if (!trusted && !cfg.corsOrigins.includes(c.req.header('Origin') ?? '')) throw new HttpError(403, 'origin not allowed');
    if (!cfg.yqBase || !cfg.yqKey) throw new HttpError(503, 'upstream not configured');
    c.set('trusted', trusted);
    await next();
  });

  /** 转发到上游。chargedUid 为已扣点的用户：失败一律退点并记录，让网页自动重试 */
  async function proxy(c: Context<AppEnv>, sub: string, chargedUid: string | null, charged: number | null): Promise<Response> {
    const method = c.req.method;
    const bodyText = method === 'POST' ? await c.req.text() : undefined;
    let model = '';
    try { model = String((JSON.parse(bodyText || '{}') as { model?: unknown }).model || ''); } catch { /* 不是 JSON 也照样转发 */ }

    let left = charged;
    const t0 = Date.now(), ac = new AbortController();
    const timer = cfg.upstreamTimeoutMs ? setTimeout(() => ac.abort('timeout'), cfg.upstreamTimeoutMs) : null;
    let r: Response | undefined, status = 0, rd: ReadableStreamDefaultReader<Uint8Array> | null = null, ended = false, settled = false;

    // 只结算一次：成功就记录；失败、超时、浏览器断线一律退点并记录
    const settle = async (ok: boolean, st: number): Promise<number | null> => {
      if (settled) return null;
      settled = true;
      let back: number | null = null;
      if (!ok && chargedUid) back = await refund(prisma, chargedUid, 1, '写作失败退点').catch(() => null);
      if (sub === CHAT) logCall(prisma, ok ? 200 : st, Date.now() - t0, model).catch(() => {});
      return back;
    };

    // 浏览器断线（等上游或串流中）：立刻中止上游请求；已收到结尾标记算成功，否则退点
    c.req.raw.signal.addEventListener('abort', () => {
      ac.abort('client');
      if (rd) rd.cancel('client gone').catch(() => {});
      void settle(ended, ended ? 200 : 499);
    }, { once: true });

    try {
      r = await fetch(cfg.yqBase + sub, {
        method, body: bodyText, signal: ac.signal,
        headers: { Authorization: 'Bearer ' + cfg.yqKey, 'Content-Type': 'application/json' },
      });
      status = r.status;
    } catch {
      status = ac.signal.reason === 'client' ? 499 : ac.signal.aborted ? 504 : 502;
    }
    if (timer) clearTimeout(timer);
    const points = (): Record<string, string> => (left === null ? {} : { 'X-Points': String(left) });

    // 串流：边收边转发，等串流结束才判断成败（没收到结尾标记就退点）
    if (r && r.body && status === 200 && /event-stream/.test(r.headers.get('Content-Type') || '')) {
      const reader = r.body.getReader(), dec = new TextDecoder();
      rd = reader;
      let tail = '';
      const stream = new ReadableStream<Uint8Array>({
        async pull(ctrl) {
          try {
            const { done, value } = await reader.read();
            if (done) { ctrl.close(); await settle(ended, 502); return; }
            tail = (tail + dec.decode(value, { stream: true })).slice(-400);
            if (!ended && (tail.includes('[DONE]') || END_MARK.test(tail))) ended = true;
            ctrl.enqueue(value);
          } catch (e) {
            ctrl.error(e);
            await settle(false, ac.signal.aborted ? 504 : 502);
          }
        },
        cancel(reason) {
          reader.cancel(reason).catch(() => {});
          return settle(ended, ended ? 200 : 499).then(() => undefined);
        },
      });
      return new Response(stream, { status: 200, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/event-stream; charset=utf-8', ...points() } });
    }

    const back = await settle(status === 200, status);
    if (back !== null) left = back;
    if (!r) return json(c, { error: status === 504 ? 'upstream timeout' : 'upstream unreachable', retry: true }, status, points());
    return new Response(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store', 'Content-Type': r.headers.get('Content-Type') || 'application/json', ...points() } });
  }

  app.post('/yq/v1/chat/completions', async (c) => {
    if (c.get('trusted')) return proxy(c, CHAT, null, null);
    const uid = readToken(cfg.authSecret, c.req.header('Authorization'));
    if (!uid) throw new HttpError(401, 'login required');
    const ch = await charge(prisma, uid, 1, '写作');
    if (ch.short) return json(c, { error: 'no points', points: ch.points }, 402, { 'X-Points': String(ch.points) });
    if (ch.error) throw new HttpError(401, 'login required');
    return proxy(c, CHAT, uid, ch.points);
  });
  app.get('/yq/v1/models', (c) => proxy(c, '/v1/models', null, null));
  app.post('/yq/v1/embeddings', (c) => proxy(c, '/v1/embeddings', null, null));

  return app;
}
