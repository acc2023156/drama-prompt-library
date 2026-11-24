/* 路由共用：应用上下文、JSON 响应、错误类型、来源与口令检查 */
import type { Context, MiddlewareHandler } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Config } from '../config.js';
import type { PrismaClient } from './db.js';
import { safeEqual } from './token.js';

export interface Deps {
  cfg: Config;
  prisma: PrismaClient;
}

export type AppEnv = {
  Bindings: HttpBindings;
  Variables: {
    uid: string; // requireUser 通过后的登录用户
    trusted: boolean; // /yq/v1/*：带了正确的内部通行码
  };
};

export const JSON_TYPE = 'application/json; charset=utf-8';

/** JSON 响应，默认不缓存；状态码可以是 499 这类非标准值 */
export function json(c: Context, obj: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return c.body(JSON.stringify(obj), status as ContentfulStatusCode, { 'Content-Type': JSON_TYPE, 'Cache-Control': 'no-store', ...headers });
}

/** 抛出后由 app.onError 统一输出 {error: message} */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** 请求头里的 Origin 不在白名单则 403；没有 Origin 头的请求（服务端调用）放行 */
export const originGuard = (cfg: Config): MiddlewareHandler<AppEnv> => async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin && !cfg.corsOrigins.includes(origin)) throw new HttpError(403, 'origin not allowed');
  await next();
};

/** 内部通行码 X-Tianji-Code */
export const accessCodeOk = (cfg: Config, code: string | undefined): boolean => !!cfg.accessCode && !!code && safeEqual(code, cfg.accessCode);

export const accessCodeGuard = (cfg: Config): MiddlewareHandler<AppEnv> => async (c, next) => {
  if (!accessCodeOk(cfg, c.req.header('X-Tianji-Code'))) throw new HttpError(401, 'bad access code');
  await next();
};

/** GitHub Actions 用的 X-Job-Secret */
export const jobSecretGuard = (cfg: Config): MiddlewareHandler<AppEnv> => async (c, next) => {
  if (!cfg.jobSecret || !safeEqual(c.req.header('X-Job-Secret') ?? '', cfg.jobSecret)) throw new HttpError(403, 'forbidden');
  await next();
};
