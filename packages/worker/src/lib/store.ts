/* 热点快照与长剧本任务（原先放在键值储存里，现在落 PostgreSQL） */
import { type Db, nowMs } from './db.js';

export const JOB_STATE_TTL = 7 * 24 * 3600e3; // 任务结果保留 7 天
export const JOB_BODY_TTL = 2 * 3600e3; // 请求体只给 Actions 取用，2 小时

const later = (ms: number): bigint => BigInt(Date.now() + ms);

/* ---- 热点 / 热词：每个 key 只留最新一批 ---- */
export async function putSnapshot(db: Db, key: string, value: unknown): Promise<void> {
  const data = { value: JSON.stringify(value), updated: nowMs() };
  await db.snapshot.upsert({ where: { key }, create: { key, ...data }, update: data });
}

export async function getSnapshot(db: Db, key: string): Promise<string | null> {
  return (await db.snapshot.findUnique({ where: { key }, select: { value: true } }))?.value ?? null;
}

/* ---- 长剧本任务 ---- */
export async function createJob(db: Db, id: string, state: unknown, body: string): Promise<void> {
  await db.job.create({ data: { id, state: JSON.stringify(state), stateExpires: later(JOB_STATE_TTL), body, bodyExpires: later(JOB_BODY_TTL) } });
}

/** 只改 state，不动 body；任务已过期被清掉时按新建处理 */
export async function setJobState(db: Db, id: string, state: unknown): Promise<void> {
  const data = { state: JSON.stringify(state), stateExpires: later(JOB_STATE_TTL) };
  await db.job.upsert({ where: { id }, create: { id, ...data }, update: data });
}

export async function getJobState(db: Db, id: string): Promise<string | null> {
  return (await db.job.findFirst({ where: { id, stateExpires: { gt: nowMs() } }, select: { state: true } }))?.state ?? null;
}

export async function getJobBody(db: Db, id: string): Promise<string | null> {
  const r = await db.job.findFirst({ where: { id, body: { not: null }, bodyExpires: { gt: nowMs() } }, select: { body: true } });
  return r?.body ?? null;
}

/** 清理过期数据：先清请求体，再删整条任务 */
export async function purgeExpired(db: Db): Promise<void> {
  const now = nowMs();
  await db.job.updateMany({ where: { body: { not: null }, bodyExpires: { lte: now } }, data: { body: null, bodyExpires: null } });
  await db.job.deleteMany({ where: { stateExpires: { lte: now } } });
}
