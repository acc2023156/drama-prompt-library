/* npm run migrate:status：列出已执行和待执行的迁移 */
import { config as loadEnv } from 'dotenv';
import { createDb } from '../src/db.js';
import { migrationStatus } from '../src/migrations.js';

loadEnv({ quiet: true });
if (!process.env.DATABASE_URL) { console.error('缺少环境变量 DATABASE_URL'); process.exit(1); }

const db = createDb(process.env.DATABASE_URL, 1);
try {
  const { applied, pending } = await migrationStatus(db);
  console.log(`已执行 ${applied.length} 个：`); applied.forEach(n => console.log('  ✔ ' + n));
  console.log(`待执行 ${pending.length} 个：`); pending.forEach(n => console.log('  · ' + n));
  process.exitCode = pending.length ? 2 : 0;   // 有待执行迁移时退出码为 2，方便脚本判断
} finally { await db.end(); }
