/* 长剧本任务：整剧生成（qwen38-script 要 3–10 分钟）交给 GitHub Actions 跑，网页拿单号轮询 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, type Deps, JSON_TYPE, HttpError, accessCodeGuard, jobSecretGuard, json, originGuard } from '../lib/http.js';
import { createJob, getJobBody, getJobState, setJobState } from '../lib/store.js';
import { readJson, zParam } from '../lib/validate.js';

const MAX_JOB_BODY = 60_000;
const JobId = z.object({ id: z.string().regex(/^[a-f0-9]{16}$/) });
const NewJob = z.custom<Record<string, unknown>>((v) => v !== null && typeof v === 'object' && !Array.isArray(v), 'job must be a JSON object');

const prevState = (raw: string | null): Record<string, unknown> => JSON.parse(raw || '{}') as Record<string, unknown>;

export function jobRoutes({ cfg, prisma }: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const secret = jobSecretGuard(cfg);

  // ---- 网页：建任务、查状态（来源 + 通行码） ----
  app.post('/jobs', originGuard(cfg), accessCodeGuard(cfg), async (c) => {
    const body = { ...(await readJson(c, NewJob)), model: 'qwen38-script', stream: false };
    const raw = JSON.stringify(body);
    if (raw.length > MAX_JOB_BODY) throw new HttpError(413, 'too large');
    const id = randomUUID().replace(/-/g, '').slice(0, 16);
    await createJob(prisma, id, { status: 'queued', created: Date.now() }, raw); // 公开纪录里只出现单号，请求体只给 Actions 取用
    let r: Response | undefined, msg = '';
    try {
      r = await fetch(`https://api.github.com/repos/${cfg.ghRepo}/actions/workflows/${cfg.ghWorkflow}/dispatches`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + cfg.ghToken, Accept: 'application/vnd.github+json', 'User-Agent': 'tianji-api', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main', inputs: { job_id: id } }),
      });
      if (!r.ok) msg = (await r.text()).slice(0, 300);
    } catch (e) {
      msg = String(e instanceof Error ? e.message : e).slice(0, 300);
    }
    if (!r?.ok) {
      await setJobState(prisma, id, { status: 'error', error: 'dispatch ' + (r ? r.status : 0) + ' ' + msg });
      return json(c, { id, status: 'error', error: 'dispatch failed' }, 502);
    }
    return json(c, { id, status: 'queued' }, 202);
  });

  app.get('/jobs/:id', originGuard(cfg), accessCodeGuard(cfg), zParam(JobId), async (c) => {
    const v = await getJobState(prisma, c.req.valid('param').id);
    if (!v) return json(c, { error: 'not found' }, 404);
    return c.body(v, 200, { 'Content-Type': JSON_TYPE, 'Cache-Control': 'no-store' });
  });

  // ---- GitHub Actions 回报（不经过浏览器，用 X-Job-Secret） ----
  app.get('/jobs/:id/body', zParam(JobId), secret, async (c) => {
    const b = await getJobBody(prisma, c.req.valid('param').id);
    if (!b) return json(c, { error: 'not found' }, 404);
    return c.body(b, 200, { 'Content-Type': JSON_TYPE });
  });

  app.post('/jobs/:id/running', zParam(JobId), secret, async (c) => {
    const { id } = c.req.valid('param');
    await setJobState(prisma, id, { ...prevState(await getJobState(prisma, id)), status: 'running', started: Date.now() });
    return json(c, { ok: true });
  });

  // 结果是任意文本（失败时 Actions 用 --data 发纯文本），不按 JSON 校验
  app.post('/jobs/:id/done', zParam(JobId), secret, async (c) => {
    const { id } = c.req.valid('param');
    const prev = prevState(await getJobState(prisma, id));
    const status = c.req.header('X-Job-Status') || 'done';
    const text = await c.req.text();
    let result: unknown = null, error: string | null = null;
    if (status === 'done') {
      try {
        result = JSON.parse(text);
        const err = (result as { error?: unknown }).error;
        if (err) { error = (JSON.stringify(err) ?? '').slice(0, 500); result = null; }
      } catch {
        error = text.slice(0, 500);
      }
    } else error = text.slice(0, 500);
    await setJobState(prisma, id, { ...prev, status: error ? 'error' : status, finished: Date.now(), result, error });
    return json(c, { ok: true });
  });

  return app;
}
