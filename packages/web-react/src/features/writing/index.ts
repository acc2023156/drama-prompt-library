import { apiBase } from '../../lib/api'
import { get, remove, set } from '../../lib/storage'
import { toast } from '../../lib/toast'
import { openLogin } from '../../lib/ui'
import type { WritingDeps, WritingStorage } from './deps'
import { createWritingEngine } from './engine'

/*
 * 写作引擎的模块级单例：整个页面只有这一个实例，作品页组件挂载几次（含开发模式 StrictMode 的重复挂载）都共用它，
 * 同一作品同时只会有一个写作任务。默认依赖接到 lib 层；测试用 createWritingEngine 自建实例并注入桩。
 */

export function defaultDeps(): WritingDeps {
  return {
    fetch: (url, init) => (init === undefined ? globalThis.fetch(url) : globalThis.fetch(url, init)),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
    storage: { get, set, remove } as WritingStorage,
    apiBase,
    openLogin,
    toast,
  }
}

export const writing = createWritingEngine(defaultDeps())

export const {
  startYq, driveYq, enterWork, redoEpisode, resumeWriting, retryWork, showDraft, stopYq, stopAll, isRunning, getState, subscribe, listingSources, yqChat,
} = writing

export { createWritingEngine } from './engine'
export type { WorkPhase, WritingEngine, WritingState } from './engine'
export type { WritingDeps, WritingStorage } from './deps'
export { BATCH_SIZE, BATCH_WORKERS } from './episode'
export { isStopped, WritingStopped, YQ_CAP_MS, YQ_IDLE_MS, YQ_PATH, YQ_STREAM, YQ_WAIT, type ChatOptions, type YqError } from './request'
