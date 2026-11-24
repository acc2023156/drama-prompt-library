import { useSyncExternalStore } from 'react'

/** 正在生成上架资料的作品（旧 LST_BUSY）：模块级，离开作品页再回来仍显示“正在生成…”。 */
const busy = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

export function setListingBusy(wid: string, on: boolean): void {
  if (on) busy.add(wid)
  else busy.delete(wid)
  version++
  listeners.forEach((fn) => fn())
}
export const isListingBusy = (wid: string): boolean => busy.has(wid)

/** 订阅忙碌状态的变化；返回值随每次变化递增，供组件在生成结束时重读作品。 */
export function useListingBusy(): number {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    () => version,
    () => version,
  )
}
