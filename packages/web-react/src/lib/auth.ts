import { type Auth, get, remove, set, useStored } from './storage'

/** 登录态：同旧 authGet / authSet。账户面板等界面订阅 pl.auth 自动重画，不再需要 drawAccount。 */
export const authGet = (): Auth | null => get('auth')

export function authSet(a: Auth | null): void {
  if (a) set('auth', a)
  else remove('auth')
}

export const useAuth = (): Auth | null => useStored('auth')[0]

export const maskPhone = (p: string | null | undefined): string => (p && p.length > 6 ? p.slice(0, 3) + '****' + p.slice(-3) : p || '')

export const ROLE_NAME: Record<string, string> = { free: '免费', member: '会员', tester: '内部测试' }
