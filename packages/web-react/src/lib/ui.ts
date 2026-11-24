import { useSyncExternalStore } from 'react'
import { requestAlign } from './nav'
import { set } from './storage'

/** 手机宽度判定（旧 matchMedia('(max-width:760px)')）。 */
export const isMobile = (): boolean => typeof matchMedia === 'function' && matchMedia('(max-width:760px)').matches

/** 侧栏开关：同旧 setPanel，切 body.ps-off；桌面端记入 pl.panel。 */
export function setPanel(open: boolean): void {
  document.body.classList.toggle('ps-off', !open)
  setTimeout(requestAlign, 30)
  setTimeout(requestAlign, 260)
  if (!isMobile()) set('panel', open)
}

/** 右上账户面板开关（旧 setAccount）。 */
let accountOpen = false
const listeners = new Set<() => void>()
export function setAccount(open: boolean): void {
  if (accountOpen === open) return
  accountOpen = open
  listeners.forEach((fn) => fn())
}
export const isAccountOpen = (): boolean => accountOpen
export function useAccountOpen(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    isAccountOpen,
    isAccountOpen,
  )
}

/** 打开账户面板并聚焦手机号输入框（旧 openLogin）。 */
export function openLogin(): void {
  setAccount(true)
  setTimeout(() => document.getElementById('accPhone')?.focus(), 50)
}
