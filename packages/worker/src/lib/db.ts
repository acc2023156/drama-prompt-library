/* Prisma 客户端（PostgreSQL，经 @prisma/adapter-pg 连接）。表结构见 prisma/schema.prisma */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';

export { PrismaClient, Prisma };
/** 连接池或事务里的 client，都能执行查询 */
export type Db = PrismaClient | Prisma.TransactionClient;

export function createPrisma(databaseUrl: string, max = 10): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max }) });
}

/** 毫秒时间戳在库里是 BIGINT，Prisma 返回 bigint；对外一律转成 number（远小于 2^53） */
export const toNum = (v: bigint | number | null): number | null => (v === null ? null : Number(v));
export const nowMs = (): bigint => BigInt(Date.now());

type Plain<T> = { [K in keyof T]: T[K] extends bigint ? number : T[K] extends bigint | null ? number | null : T[K] };
/** $queryRaw 结果里的 bigint 列转成 number，其余原样 */
export function plainRow<T extends Record<string, unknown>>(row: T): Plain<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'bigint' ? Number(v) : v;
  return out as Plain<T>;
}
