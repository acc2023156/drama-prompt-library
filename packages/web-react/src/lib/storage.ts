import { useCallback, useSyncExternalStore } from 'react'
import type { Work } from '../domain/types'

/**
 * 本地存储层：旧页面 store()（site-template.html 第 1114 行）的移植，是唯一接触 localStorage 的地方。
 * 键名 = 'pl.' + k，值 = JSON.stringify(v)；读失败返回 null；写 null 存字符串 'null'，不删除键。
 * 新旧页面同源时读写同一份数据，所以键名与 JSON 结构不能改。
 */

export const PREFIX = 'pl.'

/** 作品（pl.works 的元素）用领域层的类型；只导入类型，lib 在运行时不依赖 domain。 */
export type { Work }

export type Role = 'free' | 'member' | 'tester'
export interface AuthUser {
  uid: string
  phone: string
  role: Role | string
  /** null = 不限（内部测试） */
  points: number | null
  cap?: number | null
  [k: string]: unknown
}
export interface Auth {
  token: string
  user: AuthUser
}

/** 18 个 pl.* 键的值类型。结构细节见方案文档 web-react-storage-api；归属各 feature 的键先用宽松对象类型。 */
export interface StorageSchema {
  works: Work[]
  auth: Auth
  chat: Record<string, unknown>
  vibeCard: Record<string, unknown>
  scriptDraft: Record<string, unknown>
  sxPick: { g: 'male' | 'female'; idx: number | null; name?: string; title?: string; q?: string; [k: string]: unknown }
  assets: { fn: string; name?: string; prompt?: string; state?: Record<string, unknown>; time?: number; [k: string]: unknown }[]
  assetSeed: { wid: string; title?: string; items: Record<string, unknown>[]; [k: string]: unknown }
  assetPick: { fn: string; name?: string; profile?: string; [k: string]: unknown }
  asm: { style: string; custom?: string; [k: string]: unknown }
  asmW: Record<string, { style: string; custom?: string; [k: string]: unknown }>
  lastVibe: string
  vibeTab: 'outline' | 'script' | 'assets' | 'board' | 'listing'
  pro: boolean
  homeMode: 'lib' | 'create'
  libNav: { lv: 'root' | 'g' | 'wip' | 'role'; g?: string; i?: number; [k: string]: unknown }
  tjCode: string
  panel: boolean
}
export type StoreKey = keyof StorageSchema

export const STORE_KEYS: readonly StoreKey[] = [
  'works', 'auth', 'chat', 'vibeCard', 'scriptDraft', 'sxPick', 'assets', 'assetSeed', 'assetPick',
  'asm', 'asmW', 'lastVibe', 'vibeTab', 'pro', 'homeMode', 'libNav', 'tjCode', 'panel',
]

type Listener = () => void
const listeners = new Map<StoreKey, Set<Listener>>()
let worksPushHook: (() => void) | null = null

function ls(): Storage {
  return globalThis.localStorage
}

function notify(k: StoreKey) {
  listeners.get(k)?.forEach((fn) => fn())
}

/** 读：同旧 store(k)。键不存在、JSON 损坏或 localStorage 不可用都返回 null。 */
export function get<K extends StoreKey>(k: K): StorageSchema[K] | null {
  try {
    return JSON.parse(ls().getItem(PREFIX + k) as string) as StorageSchema[K] | null
  } catch {
    return null
  }
}

/** 写：同旧 store(k, v)。v 为 null 时写入字符串 'null'；写 works 时触发云端推送钩子（同 window.cloudPush）。 */
export function set<K extends StoreKey>(k: K, v: StorageSchema[K] | null): void {
  try {
    ls().setItem(PREFIX + k, JSON.stringify(v))
    if (k === 'works' && worksPushHook) worksPushHook()
  } catch {
    // 旧实现吞掉写入失败（如配额满）与推送异常
  }
  notify(k)
}

/** 删除键。旧页面只有 authSet(null) 这样做（localStorage.removeItem('pl.auth')）。 */
export function remove(k: StoreKey): void {
  try {
    ls().removeItem(PREFIX + k)
  } catch {
    // 同旧实现：存储不可用时静默
  }
  notify(k)
}

/** 读写 pl.works 原文，不经推送钩子。只给云同步用（旧 cloudPull / cloudPush 直接读写 localStorage）。 */
export function readWorksRaw(): Work[] {
  return (JSON.parse(ls().getItem(PREFIX + 'works') as string) as Work[] | null) || []
}
export function writeWorksRaw(list: Work[]): void {
  ls().setItem(PREFIX + 'works', JSON.stringify(list))
  notify('works')
}

/** 注册 works 写入后的推送钩子；返回注销函数。 */
export function setWorksPushHook(fn: (() => void) | null): () => void {
  worksPushHook = fn
  return () => {
    if (worksPushHook === fn) worksPushHook = null
  }
}

/** 订阅某个键：同页写入与其他标签页的 storage 事件都会通知。 */
export function subscribe(k: StoreKey, fn: Listener): () => void {
  let set = listeners.get(k)
  if (!set) listeners.set(k, (set = new Set()))
  set.add(fn)
  return () => {
    set.delete(fn)
  }
}

/** 其他标签页改动 localStorage 时转发给订阅者；e.key 为 null 表示整个存储被清空。 */
export function handleStorageEvent(e: Pick<StorageEvent, 'key' | 'storageArea'>): void {
  if (e.storageArea && e.storageArea !== ls()) return
  if (e.key === null) {
    for (const k of listeners.keys()) notify(k)
    return
  }
  if (!e.key.startsWith(PREFIX)) return
  const k = e.key.slice(PREFIX.length) as StoreKey
  if (listeners.has(k)) notify(k)
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', handleStorageEvent)
}

/** 读快照：原文不变时返回同一个对象，供 useSyncExternalStore 判等。 */
const snapshots = new Map<StoreKey, { raw: string | null; value: unknown }>()
export function snapshot<K extends StoreKey>(k: K): StorageSchema[K] | null {
  let raw: string | null
  try {
    raw = ls().getItem(PREFIX + k)
  } catch {
    raw = null
  }
  const prev = snapshots.get(k)
  if (prev && prev.raw === raw) return prev.value as StorageSchema[K] | null
  const value = get(k)
  snapshots.set(k, { raw, value })
  return value
}

/** React 订阅：返回 [当前值, 写入函数]。 */
export function useStored<K extends StoreKey>(k: K): [StorageSchema[K] | null, (v: StorageSchema[K] | null) => void] {
  const value = useSyncExternalStore(
    useCallback((fn: Listener) => subscribe(k, fn), [k]),
    () => snapshot(k),
    () => snapshot(k),
  )
  const write = useCallback((v: StorageSchema[K] | null) => set(k, v), [k])
  return [value, write]
}

/** sessionStorage.tjAdmin：会员后台口令（X-Admin-Key）。 */
export const adminKey = {
  get(): string {
    try {
      return globalThis.sessionStorage.getItem('tjAdmin') || ''
    } catch {
      return ''
    }
  },
  set(v: string): void {
    globalThis.sessionStorage.setItem('tjAdmin', v)
  },
}

/** PRO 开关：缺省视为开（旧 isPro = store('pro') !== false）。 */
export const isPro = (): boolean => get('pro') !== false
