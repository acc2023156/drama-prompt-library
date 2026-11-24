import { type CloudWork, mergeCloudWorks, pendingPush } from '../domain/sync'
import { purgeTrash as expiredTrash } from '../domain/works'
import { api } from '../lib/api'
import { authGet } from '../lib/auth'
import { refreshRoute } from '../lib/nav'
import { get, readWorksRaw, set, setWorksPushHook, writeWorksRaw } from '../lib/storage'

/**
 * 作品云同步：旧 cloudPull / cloudPush（3310–3328）与 purgeTrash（1126）。
 * 拉取：云端与本地按 time 取较新者合并，按 time 倒序写回（绕过推送钩子），再立即推送本地较新的。
 * 推送：防抖 1.5 秒（拉取后 50 毫秒），只推哈希变化的作品，任一失败即停止本轮。
 * 合并、指纹、过期判定是 domain 的纯函数；这里只负责读写存储、请求与时序。
 */

let cloudHash: Record<string, string> = {}
let cloudTimer: ReturnType<typeof setTimeout> | undefined

export const PUSH_DELAY = 1500
export const PUSH_DELAY_NOW = 50

/** 登出时清空已推送指纹（旧 drawAccount 登出按钮）。 */
export function resetCloudHash(): void {
  cloudHash = {}
}

export function cloudPush(now?: boolean): void {
  if (!authGet()) return
  clearTimeout(cloudTimer)
  cloudTimer = setTimeout(async () => {
    for (const { work, hash } of pendingPush(readWorksRaw(), cloudHash)) {
      try {
        await api('/works/' + encodeURIComponent(work.id), { method: 'POST', body: JSON.stringify(work) })
        cloudHash[work.id] = hash
      } catch {
        break
      }
    }
  }, now ? PUSH_DELAY_NOW : PUSH_DELAY)
}

export async function cloudPull(): Promise<void> {
  if (!authGet()) return
  try {
    const j = await api<{ works: CloudWork[] }>('/works')
    const r = mergeCloudWorks(readWorksRaw(), j.works)
    cloudHash = r.cloudHash
    writeWorksRaw(r.merged)
    cloudPush(true)
    if (/^#\/(script|$)/.test(location.hash) || location.hash === '#/' || !location.hash) refreshRoute()
  } catch {
    // 同旧实现：静默
  }
}

/** 清除回收站里超过 30 天的作品，已登录时同步删除云端（忽略失败）。 */
export function purgeTrash(now: number = Date.now()): void {
  const { kept, gone } = expiredTrash(get('works'), now)
  if (!gone.length) return
  set('works', kept)
  if (authGet()) gone.forEach((w) => api('/works/' + encodeURIComponent(w.id), { method: 'DELETE' }).catch(() => {}))
}

/** works 写入即推送（旧 store 里的 window.cloudPush 调用）。 */
setWorksPushHook(() => cloudPush())
