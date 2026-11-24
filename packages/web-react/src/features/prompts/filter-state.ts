import { useSyncExternalStore } from 'react'
import { DEFAULT_FILTER, type PromptFilterState } from '../../domain/prompts-filter'

/**
 * 提示词搜索条件：对应旧页面的全局 state（site-template.html 第 3447 行）。
 * 页面每次换路由都会重新挂载，条件要像旧页面一样跨路由保留（首页搜过再进目录页，搜索框仍是原来的词）。
 */
let current: PromptFilterState = { ...DEFAULT_FILTER }
const listeners = new Set<() => void>()

export const getPromptFilter = (): PromptFilterState => current

export function setPromptFilter(patch: Partial<PromptFilterState>): void {
  current = { ...current, ...patch }
  listeners.forEach((fn) => fn())
}

/** 回到初始条件（测试用；旧页面只有刷新才会重置）。 */
export function resetPromptFilter(): void {
  setPromptFilter({ ...DEFAULT_FILTER })
}

export function usePromptFilter(): PromptFilterState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    getPromptFilter,
    getPromptFilter,
  )
}
