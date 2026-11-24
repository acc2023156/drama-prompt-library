/* 登录 token：uid.过期毫秒.签名（HMAC-SHA256，base64url）。算法不能变，否则已登录的人会掉线 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_DAYS = 30;
const hmac = (secret: string, msg: string): string => createHmac('sha256', secret).update(msg).digest('base64url');

/** 常量时间比较，用于口令、密码、签名 */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function makeToken(secret: string, uid: string): string {
  const exp = Date.now() + TOKEN_DAYS * 864e5;
  const body = `${uid}.${exp}`;
  return `${body}.${hmac(secret, body)}`;
}

/** 校验通过返回 uid，否则 null */
export function readToken(secret: string, authorization: string | undefined): string | null {
  const m = (authorization ?? '').match(/^Bearer\s+(\S+)$/);
  if (!m?.[1]) return null;
  const [uid, exp, sig] = m[1].split('.');
  if (!uid || !exp || !sig || +exp < Date.now()) return null;
  return safeEqual(hmac(secret, `${uid}.${exp}`), sig) ? uid : null;
}
