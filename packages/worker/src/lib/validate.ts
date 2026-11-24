/* 请求校验：Zod schema + 统一的错误文本 */
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HttpError, json } from './http.js';

const firstIssue = (e: { issues: readonly { message: string }[] }): string => e.issues[0]?.message ?? 'bad request';

/**
 * 读 JSON 请求体并校验。不看 Content-Type（旧版就不看，GitHub Actions 的部分回报不带该头）；
 * 解析失败回 400 bad json，校验失败回 400 + message（不给则用第一条 issue 的文本）
 */
export async function readJson<T extends z.ZodType>(c: Context, schema: T, message?: string): Promise<z.output<T>> {
  let raw: unknown;
  try {
    raw = JSON.parse(await c.req.text());
  } catch {
    throw new HttpError(400, 'bad json');
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, message ?? firstIssue(r.error));
  return r.data;
}

/** 不是对象（数组、null、字符串等）时按空对象处理，字段再各自给默认值 */
export const looseObject = <T extends z.ZodRawShape>(shape: T) =>
  z.preprocess((v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {}), z.object(shape));

/** 路径参数不合规时当作路径不存在 */
export const zParam = <T extends z.ZodType>(schema: T) =>
  zValidator('param', schema, (r, c) => {
    if (!r.success) return json(c, { error: 'not found' }, 404);
  });

export const zQuery = <T extends z.ZodType>(schema: T) =>
  zValidator('query', schema, (r, c) => {
    if (!r.success) return json(c, { error: firstIssue(r.error) }, 400);
  });
