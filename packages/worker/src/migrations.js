/* 迁移状态：对照 migrations/ 目录和库里的 pgmigrations 表（由 node-pg-migrate 维护） */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/* 目录里所有迁移的名字（去掉 .sql），按文件名排序 */
export const migrationFiles = (dir = DIR) =>
  readdirSync(dir).filter(f => f.endsWith('.sql')).map(f => f.slice(0, -4)).sort();

/* 返回 { applied, pending }；库里还没有迁移表时全部算待执行 */
export async function migrationStatus(db, dir = DIR) {
  const files = migrationFiles(dir);
  const exists = (await db.query(`SELECT to_regclass('public.pgmigrations') AS t`)).rows[0].t;
  const done = new Set(exists ? (await db.query('SELECT name FROM pgmigrations')).rows.map(r => r.name) : []);
  return { applied: files.filter(n => done.has(n)), pending: files.filter(n => !done.has(n)) };
}
