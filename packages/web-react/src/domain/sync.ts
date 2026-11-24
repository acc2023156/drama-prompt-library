import type { Work } from './types'

/** 作品内容指纹：JSON 串的 31 进制滚动哈希 + 长度；云同步用它判断是否需要推送。 */
export const workHash = (w: unknown): string => {
  const t = JSON.stringify(w)
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0
  return h + ':' + t.length
}

export interface CloudWork {
  id: string
  data: Work
}

/**
 * 云端拉取后的合并（旧 cloudPull 的纯逻辑）：本地没有或云端 time 更新则取云端；
 * 结果按 time 倒序；cloudHash 记录云端每个作品的指纹。
 * 旧实现里的读 localStorage、写回、触发推送与刷新由调用方负责。
 */
export function mergeCloudWorks(local: Work[], remote: CloudWork[]): { merged: Work[]; cloudHash: Record<string, string> } {
  const byId: Record<string, Work> = Object.fromEntries(local.map((w) => [w.id, w]))
  for (const r of remote) {
    const l = byId[r.id]
    if (!l || (r.data.time || 0) > (l.time || 0)) byId[r.id] = r.data
  }
  const merged = Object.values(byId).sort((a, b) => (b.time || 0) - (a.time || 0))
  const cloudHash = Object.fromEntries(remote.map((r) => [r.id, workHash(r.data)]))
  return { merged, cloudHash }
}

/** 旧 cloudPush 的筛选：指纹与云端记录不同的作品才需要推送（顺序保持，推送失败即停由调用方处理）。 */
export function pendingPush(list: Work[], cloudHash: Record<string, string>): { work: Work; hash: string }[] {
  const out: { work: Work; hash: string }[] = []
  for (const w of list) {
    const hash = workHash(w)
    if (cloudHash[w.id] === hash) continue
    out.push({ work: w, hash })
  }
  return out
}
