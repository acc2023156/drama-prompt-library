import type { Work } from '../../domain/types'
import type { Auth } from '../../lib/storage'

/**
 * 写作引擎的外部依赖。引擎本身不读全局（fetch、定时器、Date.now、localStorage、界面），全部经这里注入；
 * 默认实现在 index.ts 里接到 lib 层（lib/storage、lib/api、lib/ui、lib/toast），测试里换成桩。
 * 引擎不使用随机数，所以没有 rng。
 */
export interface WritingStorage {
  get(k: 'works'): Work[] | null
  get(k: 'auth'): Auth | null
  get(k: 'tjCode'): string | null
  /** 同旧 store(k, v)：写 JSON 原文；写 works 时由存储层触发云端推送。 */
  set(k: 'works', v: Work[]): void
  set(k: 'auth', v: Auth): void
  /** 同旧 authSet(null)：删除 pl.auth。 */
  remove(k: 'auth'): void
}

export type TimerHandle = unknown

export interface WritingDeps {
  /** 只会以 fetch(url) 或 fetch(url, init) 两种形式调用。 */
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  setTimeout: (fn: () => void, ms: number) => TimerHandle
  clearTimeout: (h: TimerHandle) => void
  /** 毫秒时间戳，同 Date.now()。 */
  now: () => number
  storage: WritingStorage
  /** 后端地址，同旧 TJ_API（空串 = 同源）。 */
  apiBase: () => string
  /** 401 时打开登录面板（旧 openLogin）。 */
  openLogin: () => void
  /** 402 时的提示条（旧 toast）。 */
  toast: (text: string) => void
}
