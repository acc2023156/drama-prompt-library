import { api } from '../lib/api'
import { authGet, authSet } from '../lib/auth'
import type { Auth } from '../lib/storage'
import { toast } from '../lib/toast'
import { cloudPull, resetCloudHash } from './cloud'

/** 手机号登录（不验证）：同旧 doLogin，8–11 位数字，成功后拉取云端作品。 */
export async function doLogin(phone: string): Promise<boolean> {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length < 8 || d.length > 11) {
    toast('请输入 8–11 码手机号')
    return false
  }
  try {
    const j = await api<Auth>('/auth/login', { method: 'POST', body: JSON.stringify({ phone: d }) })
    authSet({ token: j.token, user: j.user })
    toast('已登录')
    await cloudPull()
    return true
  } catch (e) {
    toast((e as Error).message || '登录失败')
    return false
  }
}

/** 启动时刷新积分与身份（GET /me），失败静默。 */
export async function refreshMe(): Promise<void> {
  const A = authGet()
  if (!A) return
  try {
    const j = await api<{ user: Auth['user'] }>('/me')
    A.user = j.user
    authSet(A)
  } catch {
    // 同旧实现
  }
}

export function logout(): void {
  authSet(null)
  resetCloudHash()
  toast('已登出')
}
