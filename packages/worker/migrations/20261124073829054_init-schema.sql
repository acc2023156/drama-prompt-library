-- Up Migration

-- 初始表结构。全部用 IF NOT EXISTS，已被旧版“启动建表”创建过的库可以直接接管，不会报重复。

CREATE TABLE IF NOT EXISTS users(
  uid TEXT PRIMARY KEY, phone TEXT UNIQUE, role TEXT DEFAULT 'free', points INTEGER DEFAULT 0,
  day TEXT, created BIGINT, last_login BIGINT, used_total INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS works(
  uid TEXT, id TEXT, data TEXT, updated BIGINT,
  PRIMARY KEY(uid, id)
);

CREATE TABLE IF NOT EXISTS yqlog(
  id BIGSERIAL PRIMARY KEY, day TEXT, at BIGINT, status INTEGER, ms INTEGER, model TEXT
);

CREATE TABLE IF NOT EXISTS ledger(
  id BIGSERIAL PRIMARY KEY, uid TEXT, delta INTEGER, reason TEXT, at BIGINT, day TEXT
);

-- 热点、热词的最新一批快照（key 为 hot / words）
CREATE TABLE IF NOT EXISTS snapshots(
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated BIGINT
);

-- 长剧本任务：state 保留 7 天，body（只给 Actions 取用）保留 2 小时
CREATE TABLE IF NOT EXISTS jobs(
  id TEXT PRIMARY KEY, state TEXT NOT NULL, state_expires BIGINT NOT NULL, body TEXT, body_expires BIGINT
);

CREATE INDEX IF NOT EXISTS yqlog_day ON yqlog(day);
CREATE INDEX IF NOT EXISTS yqlog_at ON yqlog(at);
CREATE INDEX IF NOT EXISTS ledger_uid ON ledger(uid, id);

-- Down Migration

-- 会删除全部业务数据，只用于开发库回退，生产库不要执行。
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS snapshots;
DROP TABLE IF EXISTS ledger;
DROP TABLE IF EXISTS yqlog;
DROP TABLE IF EXISTS works;
DROP TABLE IF EXISTS users;
