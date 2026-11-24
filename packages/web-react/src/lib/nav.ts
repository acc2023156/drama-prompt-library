import { useSyncExternalStore } from 'react'

/**
 * hash 导航状态与页面间的导航动作。
 * rev 只在 hashchange 事件时递增（含旧页面派发的合成 hashchange），history.replaceState 不触发重画，与旧 route() 一致。
 */

export interface HashState {
  hash: string
  rev: number
}

const readHash = () => (typeof location === 'undefined' ? '' : location.hash)
let state: HashState = { hash: readHash(), rev: 0 }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

function onHashChange() {
  state = { hash: readHash(), rev: state.rev + 1 }
  emit()
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('hashchange', onHashChange)
}

export function getHashState(): HashState {
  return state
}
export function subscribeHash(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
export function useHashState(): HashState {
  return useSyncExternalStore(subscribeHash, getHashState, getHashState)
}

/** 重新渲染当前路由：同旧 dispatchEvent(new HashChangeEvent('hashchange'))（PRO 开关、云同步拉取后）。 */
export function refreshRoute(): void {
  dispatchEvent(new HashChangeEvent('hashchange'))
}

/** 跳转且不留历史（旧 location.replace，如 #/storyboard 跳最近作品分镜页）。 */
export function replaceHash(hash: string): void {
  location.replace(hash)
}

/** 改地址栏 hash 但不触发路由重画、不新增历史（旧作品页切分页的 history.replaceState）。 */
export function replaceStateHash(hash: string): void {
  if (location.hash !== hash) history.replaceState(null, '', hash)
}

/**
 * 导航栏的路由覆盖：旧作品页等会用自带 vibe 上下文的路由对象调用 drawNav。
 * 页面调用 setNavRoute(r) 后，Layout 用 r 画顶栏与侧栏，直到下一次 hashchange。
 */
export interface NavRoute {
  view: string
  tool?: string
  sub?: string
  wid?: string
  sid?: string
  fn?: string
  idx?: number | null
  id?: string
  folder?: string
  vibe?: { id: string; title?: string; tab: string }
}

let override: { rev: number; route: NavRoute } | null = null
const navListeners = new Set<() => void>()

export function setNavRoute(route: NavRoute | null): void {
  override = route ? { rev: state.rev, route } : null
  navListeners.forEach((fn) => fn())
}
export function getNavOverride(): NavRoute | null {
  return override && override.rev === state.rev ? override.route : null
}
function subscribeNav(fn: () => void): () => void {
  navListeners.add(fn)
  const off = subscribeHash(fn)
  return () => {
    navListeners.delete(fn)
    off()
  }
}
export function useNavOverride(): NavRoute | null {
  return useSyncExternalStore(subscribeNav, getNavOverride, getNavOverride)
}

/** 请求重新对齐右上“返回”与左上“目录”按钮（旧 alignBack），由 Layout 执行。 */
const alignListeners = new Set<() => void>()
export function requestAlign(): void {
  alignListeners.forEach((fn) => fn())
}
export function onAlignRequest(fn: () => void): () => void {
  alignListeners.add(fn)
  return () => {
    alignListeners.delete(fn)
  }
}
