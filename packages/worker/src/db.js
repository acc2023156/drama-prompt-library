/* PostgreSQL：连接池、事务、建表 */
import pg from 'pg';

// bigint（毫秒时间戳、COUNT）与 numeric（AVG）默认按字符串返回，前端要数字
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);

export function createDb(databaseUrl, max = 10) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max });
  return {
    pool,
    query: (text, params) => pool.query(text, params),
    /* 事务：回调里用传入的 client 查询，抛错自动回滚 */
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(c);
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally { c.release(); }
    },
    end: () => pool.end(),
  };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users(
    uid TEXT PRIMARY KEY, phone TEXT UNIQUE, role TEXT DEFAULT 'free', points INTEGER DEFAULT 0,
    day TEXT, created BIGINT, last_login BIGINT, used_total INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS works(uid TEXT, id TEXT, data TEXT, updated BIGINT, PRIMARY KEY(uid, id))`,
  `CREATE TABLE IF NOT EXISTS yqlog(id BIGSERIAL PRIMARY KEY, day TEXT, at BIGINT, status INTEGER, ms INTEGER, model TEXT)`,
  `CREATE TABLE IF NOT EXISTS ledger(id BIGSERIAL PRIMARY KEY, uid TEXT, delta INTEGER, reason TEXT, at BIGINT, day TEXT)`,
  // 热点、热词的最新一批快照（key 为 hot / words）
  `CREATE TABLE IF NOT EXISTS snapshots(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated BIGINT)`,
  // 长剧本任务：state 保留 7 天，body（只给 Actions 取用）保留 2 小时
  `CREATE TABLE IF NOT EXISTS jobs(
    id TEXT PRIMARY KEY, state TEXT NOT NULL, state_expires BIGINT NOT NULL, body TEXT, body_expires BIGINT)`,
  `CREATE INDEX IF NOT EXISTS yqlog_day ON yqlog(day)`,
  `CREATE INDEX IF NOT EXISTS yqlog_at ON yqlog(at)`,
  `CREATE INDEX IF NOT EXISTS ledger_uid ON ledger(uid, id)`,
];

export async function ensureSchema(db) {
  for (const sql of SCHEMA) await db.query(sql);
}
