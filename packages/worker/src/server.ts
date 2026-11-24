/* 启动入口：载入 .env → 读配置 → 连库并检查迁移 → 起 HTTP 服务 */
import { serve } from '@hono/node-server';
import { config as loadEnv } from 'dotenv';
import { createApp } from './app.js';
import { type Config, checkConfig, loadConfig } from './config.js';
import { createPrisma } from './lib/db.js';
import { migrationStatus } from './lib/migrations.js';
import { purgeExpired } from './lib/store.js';

loadEnv({ quiet: true }); // 已存在的环境变量优先，.env 只补缺的

let cfg: Config;
try {
  cfg = loadConfig();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
const { missing, warn } = checkConfig(cfg);
if (missing.length) {
  console.error('缺少必填环境变量：' + missing.join(', '));
  process.exit(1);
}
warn.forEach((w) => console.warn('[warn] ' + w));

const prisma = createPrisma(cfg.databaseUrl, cfg.poolMax);
// 表结构由 Prisma Migrate 管理，这里只检查：有未执行的迁移就拒绝启动
const { pending } = await migrationStatus(prisma);
if (pending.length) {
  console.error('数据库有未执行的迁移：\n  ' + pending.join('\n  ') + '\n请先执行迁移：本地 npm run migrate:worker；镜像 docker run <镜像> migrate');
  await prisma.$disconnect();
  process.exit(1);
}

const purge = setInterval(() => purgeExpired(prisma).catch((e: unknown) => console.error('[purge]', e instanceof Error ? e.message : e)), 3600e3);
purge.unref();

const server = serve({ fetch: createApp({ cfg, prisma }).fetch, port: cfg.port }, () => console.log(`tianji-api listening on :${cfg.port}`));

const stop = () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
