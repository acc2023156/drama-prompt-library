import { authGet, authSet } from './auth'
import { get, set } from './storage'

/**
 * 通用请求层：旧 api()（3294）、tjApi()（2564）与 yqOnce（2652）的请求部分。
 * 写作引擎（重试、换模型、SSE 解析）归 features/writing，只用这里的 yqPost。
 */

declare global {
  interface Window {
    TJ_API_BASE?: string
  }
}

/** 后端地址：构建时由 TIANJI_API_BASE 注入 window.TJ_API_BASE（已去尾部斜杠）；空串 = 与网页同源。 */
export function apiBase(): string {
  return (typeof window !== 'undefined' && window.TJ_API_BASE) || ''
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** 可重试的错误（网络中断、429、5xx、空回应、流中断），同旧实现给 Error 挂 retry:true。 */
export class RetryableError extends Error {
  retry = true as const
}

export interface ApiOptions {
  method?: string
  headers?: Record<string, string>
  body?: BodyInit | null
  /** 401 时不登出（会员后台用）。 */
  noLogout?: boolean
}

/** 错误体的 error 字段：旧后端是字符串；Zod 校验等返回对象时取其 message，避免显示 [object Object]。 */
function errorText(j: unknown, status: number): string {
  const e = (j as { error?: unknown } | null)?.error
  if (typeof e === 'string' && e) return e
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') return (e as { message: string }).message
  return 'HTTP ' + status
}

/** 带 Bearer 的 JSON 请求。401 且已登录、未设 noLogout 时登出；非 2xx 抛 ApiError（status + 后端 error）。 */
export async function api<T = any>(path: string, opt?: ApiOptions): Promise<T> {
  const A = authGet()
  const o = opt || {}
  const r = await fetch(apiBase() + path, {
    method: o.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(A ? { Authorization: 'Bearer ' + A.token } : {}), ...(o.headers || {}) },
    body: o.body,
  })
  const j = await r.json().catch(() => ({}))
  if (r.status === 401 && A && !o.noLogout) authSet(null)
  if (!r.ok) throw new ApiError(errorText(j, r.status), r.status)
  return j as T
}

/** 会员后台请求：口令来自 sessionStorage.tjAdmin，作为 X-Admin-Key；不因 401 登出。同旧 viewAdmin 内 A()，调用方 headers 被覆盖。 */
export function adminApi<T = any>(path: string, key: string, opt?: ApiOptions): Promise<T> {
  return api<T>(path, { ...(opt || {}), noLogout: true, headers: { 'X-Admin-Key': key } })
}

/** 内部通行码（pl.tjCode）。 */
export const tjCode = (): string | null => get('tjCode')

/** 页面地址 ?k=<通行码> 存入 pl.tjCode 并从地址栏移除整段查询串（同旧 2562 行的自执行函数）。 */
export function captureCodeFromUrl(): void {
  try {
    const k = new URLSearchParams(location.search).get('k')
    if (k) {
      set('tjCode', k)
      history.replaceState(null, '', location.pathname + location.hash)
    }
  } catch {
    // 同旧实现：静默
  }
}

/** 只带通行码的请求（旧 /jobs 接口）。失败抛 Error（不带 status，同旧实现）。 */
export async function tjApi<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(apiBase() + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-Tianji-Code': tjCode() || '', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || 'HTTP ' + r.status)
  return j as T
}

/** 响应头 X-Points 回写积分（同旧 yqOnce）：A 是发请求前取到的登录态。 */
export function applyPoints(r: Response, A: ReturnType<typeof authGet>): void {
  const left = r.headers.get('X-Points')
  if (left !== null && A) {
    A.user.points = +left
    authSet(A)
  }
}

/**
 * 写作接口 POST /yq/v1/chat/completions 的请求部分：头 = X-Tianji-Code + JSON + Bearer（已登录时）。
 * 网络失败抛 RetryableError('网路中断')；拿到响应后先回写 X-Points。状态码处理（401 / 402 / 重试）由写作引擎负责。
 */
export async function yqPost(body: unknown, signal?: AbortSignal): Promise<Response> {
  const A = authGet()
  let r: Response
  try {
    r = await fetch(apiBase() + '/yq/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'X-Tianji-Code': tjCode() || '', 'Content-Type': 'application/json', ...(A ? { Authorization: 'Bearer ' + A.token } : {}) },
      body: JSON.stringify(body),
    })
  } catch {
    throw new RetryableError('网路中断')
  }
  applyPoints(r, A)
  return r
}

/** GET 无鉴权接口（/hot、/words）：失败返回 null。 */
export async function getPublic<T = any>(path: string): Promise<T | null> {
  try {
    const r = await fetch(apiBase() + path)
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}
