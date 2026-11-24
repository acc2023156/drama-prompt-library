import { useSyncExternalStore } from 'react'
import { getPublic } from '../../../lib/api'
import type { HotFeed } from './orbit-data'

/**
 * GET /hot 的页面级缓存（旧 window._hotLive / window._hotLoading，site-template.html 第 2465 行）。
 * 成功且 topics 非空才缓存，之后不再请求；失败或为空时清掉加载标记，下次切换模式再请求。
 */
let live: HotFeed | null = null
let loading = false
const listeners = new Set<() => void>()

export const getHot = (): HotFeed | null => live

export function loadHot(): void {
  if (live || loading) return
  loading = true
  getPublic<HotFeed>('/hot').then((j) => {
    loading = false
    if (j && j.topics && j.topics.length) {
      live = j
      listeners.forEach((fn) => fn())
    }
  })
}

export function subscribeHot(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const useHot = (): HotFeed | null => useSyncExternalStore(subscribeHot, getHot, getHot)

/** 测试用：清空缓存与加载标记。 */
export function resetHot(): void {
  live = null
  loading = false
}
