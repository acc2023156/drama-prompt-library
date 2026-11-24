/* 启动入口：载入 .env → 读配置 → 连库并检查迁移 → 起 HTTP 服务 */
import { config as loadEnv } from 'dotenv';
import { loadConfig, checkConfig } from './config.js';
import { createDb } from './db.js';
import { migrationStatus } from './migrations.js';
import { purgeExpired } from './store.js';
import { createApp } from './index.js';
import { createServer } from './http.js';

loadEnv({ quiet: true });   // 已存在的环境变量优先，.env 只补缺的

const cfg = loadConfig();
const { missing, warn } = checkConfig(cfg);
if (missing.length) { console.error('缺少必填环境变量：' + missing.join(', ')); process.exit(1); }
warn.forEach(w => console.warn('[warn] ' + w));

const db = createDb(cfg.databaseUrl, cfg.poolMax);
// 表结构由迁移管理（npm run migrate），这里只检查：有未执行的迁移就拒绝启动
const { pending } = await migrationStatus(db);
if (pending.length) {
  console.error('数据库有未执行的迁移：\n  ' + pending.join('\n  ') + '\n请先执行：npm run migrate -w @tianji/worker');
  await db.end(); process.exit(1);
}

const purge = setInterval(() => purgeExpired(db).catch(e => console.error('[purge]', e.message)), 3600e3);
purge.unref();

const server = createServer(createApp({ cfg, db }), { maxBodyBytes: cfg.maxBodyBytes });
server.listen(cfg.port, () => console.log(`tianji-api listening on :${cfg.port}`));

const stop = () => { server.close(async () => { await db.end(); process.exit(0); }); setTimeout(() => process.exit(1), 10000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
