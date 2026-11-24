/* 热点快照与长剧本任务（原先放在键值储存里，现在落 PostgreSQL） */

export const JOB_STATE_TTL = 7 * 24 * 3600e3;   // 任务结果保留 7 天
export const JOB_BODY_TTL = 2 * 3600e3;         // 请求体只给 Actions 取用，2 小时

/* ---- 热点 / 热词：每个 key 只留最新一批 ---- */
export async function putSnapshot(db, key, value) {
  await db.query(
    `INSERT INTO snapshots(key, value, updated) VALUES($1,$2,$3)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated=excluded.updated`,
    [key, JSON.stringify(value), Date.now()]);
}
export async function getSnapshot(db, key) {
  const r = await db.query('SELECT value FROM snapshots WHERE key=$1', [key]);
  return r.rows[0] ? r.rows[0].value : null;
}

/* ---- 长剧本任务 ---- */
export async function createJob(db, id, state, body) {
  const now = Date.now();
  await db.query(
    'INSERT INTO jobs(id, state, state_expires, body, body_expires) VALUES($1,$2,$3,$4,$5)',
    [id, JSON.stringify(state), now + JOB_STATE_TTL, body, now + JOB_BODY_TTL]);
}
/* 只改 state，不动 body；任务已过期被清掉时按新建处理 */
export async function setJobState(db, id, state) {
  await db.query(
    `INSERT INTO jobs(id, state, state_expires) VALUES($1,$2,$3)
     ON CONFLICT(id) DO UPDATE SET state=excluded.state, state_expires=excluded.state_expires`,
    [id, JSON.stringify(state), Date.now() + JOB_STATE_TTL]);
}
export async function getJobState(db, id) {
  const r = await db.query('SELECT state FROM jobs WHERE id=$1 AND state_expires>$2', [id, Date.now()]);
  return r.rows[0] ? r.rows[0].state : null;
}
export async function getJobBody(db, id) {
  const r = await db.query('SELECT body FROM jobs WHERE id=$1 AND body IS NOT NULL AND body_expires>$2', [id, Date.now()]);
  return r.rows[0] ? r.rows[0].body : null;
}

/* 清理过期数据：先清请求体，再删整条任务 */
export async function purgeExpired(db) {
  const now = Date.now();
  await db.query('UPDATE jobs SET body=NULL, body_expires=NULL WHERE body IS NOT NULL AND body_expires<=$1', [now]);
  await db.query('DELETE FROM jobs WHERE state_expires<=$1', [now]);
}
