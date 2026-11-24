/* 迁移状态：对照 prisma/migrations 目录和库里的 _prisma_migrations 表（由 Prisma Migrate 维护） */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from './db.js';

// src/lib 与编译后的 dist/lib 到 prisma/ 的相对位置相同
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../prisma/migrations/', import.meta.url));

/** 目录里所有迁移的名字（含 migration.sql 的子目录），按名字排序 */
export const migrationNames = (dir = MIGRATIONS_DIR): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'migration.sql')))
    .map((d) => d.name)
    .sort();

/** 返回 { applied, pending }；执行失败或已回滚的不算已执行；库里还没有迁移表时全部算待执行 */
export async function migrationStatus(prisma: PrismaClient, dir = MIGRATIONS_DIR): Promise<{ applied: string[]; pending: string[] }> {
  const names = migrationNames(dir);
  const [t] = await prisma.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('_prisma_migrations')::text AS t`;
  const done = new Set<string>();
  if (t?.t) {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    rows.forEach((r) => done.add(r.migration_name));
  }
  return { applied: names.filter((n) => done.has(n)), pending: names.filter((n) => !done.has(n)) };
}
