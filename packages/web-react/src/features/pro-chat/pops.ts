import { useEffect, useSyncExternalStore } from 'react'

/**
 * PRO 首页的弹层（.cpop）开关。旧页面用 document.querySelectorAll('.cpop') 一次关掉全部弹层，
 * 对话框底栏的风格、比例、思考强度与作品卡的 9 个下拉共用这一个状态：同一时间最多一个打开。
 */
let open: string | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

/** 关掉全部弹层（旧 closePops）。 */
export function closePops(): void {
  if (open === null) return
  open = null
  emit()
}

/** 点按钮：先关掉全部，原本没开的再打开（旧 cStyle / cRatio / cThink / data-dd 的 onclick）。 */
export function togglePop(id: string): void {
  open = open === id ? null : id
  emit()
}

/** 只关某一个（旧作品卡选项点下后 m.classList.remove('open')）。 */
export function closePop(id: string): void {
  if (open === id) closePops()
}

const getOpen = () => open
export function usePopOpen(id: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    getOpen,
    getOpen,
  ) === id
}

/** 点页面任意处关掉弹层（旧 document.addEventListener('click', closePops)）；页面卸载时一并清掉。 */
export function useClosePopsOnDocumentClick(): void {
  useEffect(() => {
    document.addEventListener('click', closePops)
    return () => {
      document.removeEventListener('click', closePops)
      closePops()
    }
  }, [])
}
