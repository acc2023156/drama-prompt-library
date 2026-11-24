import { useSyncExternalStore } from 'react'

/** 全局提示条：同旧 toast(t)，显示 1.4 秒，连续调用时以最后一次为准重新计时。 */
export interface ToastState {
  text: string
  show: boolean
}

let state: ToastState = { text: '已复制', show: false }
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export const TOAST_MS = 1400

export function toast(text: string): void {
  state = { text, show: true }
  emit()
  clearTimeout(timer)
  timer = setTimeout(() => {
    state = { ...state, show: false }
    emit()
  }, TOAST_MS)
}

export function getToast(): ToastState {
  return state
}

export function subscribeToast(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useToast(): ToastState {
  return useSyncExternalStore(subscribeToast, getToast, getToast)
}
