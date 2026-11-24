/* 积分：每日补满、扣点、退点、调用日志 */
import type { User } from '../generated/prisma/client.js';
import { type Db, type PrismaClient, nowMs, toNum } from './db.js';

export const FREE_DAILY = 40; // 免费用户每天补到
export const MEMBER_DAILY = 200; // 会员每天补到
export const NEW_BONUS = 50; // 新号首日

// 扣点、退点会锁用户行；高并发时排队等锁，给足时间
const TX = { maxWait: 10_000, timeout: 15_000 };

export const bjDay = (): string => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const capOf = (role: string): number => (role === 'member' ? MEMBER_DAILY : FREE_DAILY);

/** 对外的用户信息；测试身份不限点，points 与 cap 为 null */
export const pub = (u: User) => ({
  uid: u.uid,
  phone: u.phone,
  role: u.role,
  points: u.role === 'tester' ? null : u.points,
  cap: u.role === 'tester' ? null : capOf(u.role),
});

/** 管理后台用的完整用户行：沿用表的列名与列顺序 */
export const userRow = (u: User) => ({
  uid: u.uid,
  phone: u.phone,
  role: u.role,
  points: u.points,
  day: u.day,
  created: Number(u.created),
  last_login: toNum(u.lastLogin),
  used_total: u.usedTotal,
});

export const getUser = (db: Db, uid: string): Promise<User | null> => db.user.findUnique({ where: { uid } });

async function addLedger(db: Db, uid: string, delta: number, reason: string, day = bjDay()): Promise<void> {
  await db.ledger.create({ data: { uid, delta, reason, at: nowMs(), day } });
}

/** 换日补点：补到上限，不累加。db 可以是连接池，也可以是事务里的 client */
export async function refill(db: Db, u: User): Promise<User> {
  const day = bjDay();
  if (u.day === day) return u;
  const pts = Math.max(u.points, capOf(u.role));
  await db.user.updateMany({ where: { uid: u.uid }, data: { points: pts, day } });
  if (pts !== u.points) await addLedger(db, u.uid, pts - u.points, '每日补满', day);
  return { ...u, points: pts, day };
}

export type ChargeResult = { points: number | null; short?: true; error?: 'no user' };

/** 扣点：成功回传剩余点数；测试身份不扣；不够回传 short。事务里锁住用户行，补点与扣点不会并发错位 */
export function charge(prisma: PrismaClient, uid: string, n: number, reason: string): Promise<ChargeResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM users WHERE uid = ${uid} FOR UPDATE`;
    const found = await tx.user.findUnique({ where: { uid } });
    if (!found) return { points: null, error: 'no user' };
    const u = await refill(tx, found);
    if (u.role === 'tester') {
      await tx.user.update({ where: { uid }, data: { usedTotal: { increment: n } } });
      return { points: null };
    }
    if (u.points < n) return { points: u.points, short: true };
    await tx.user.update({ where: { uid }, data: { points: { decrement: n }, usedTotal: { increment: n } } });
    await addLedger(tx, uid, -n, reason);
    return { points: u.points - n };
  }, TX);
}

/** 上游失败时退回刚扣的点（测试身份本来就没扣）；返回退点后的精确余额 */
export function refund(prisma: PrismaClient, uid: string, n: number, reason: string): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ points: number }[]>`
      UPDATE users SET points = points + ${n}, used_total = GREATEST(0, used_total - ${n})
      WHERE uid = ${uid} AND role <> 'tester' RETURNING points`;
    const row = rows[0];
    if (!row) return null;
    await addLedger(tx, uid, n, reason);
    return row.points;
  }, TX);
}

export async function logCall(db: Db, status: number, ms: number, model: string): Promise<void> {
  await db.yqLog.create({ data: { day: bjDay(), at: nowMs(), status, ms, model: model.slice(0, 60) } });
}
