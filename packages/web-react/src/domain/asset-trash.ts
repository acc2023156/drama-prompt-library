import { TRASH_DAYS } from './works'

/**
 * 旧 purgeAssetTrash（site-template.html 第 1133 行）的纯逻辑：资产回收桶里超过 30 天的项。
 * 只有存在过期项时才需要写回（changed 为 true），写回 localStorage 由调用方负责；当前时间改成显式参数 now。
 * 比较照旧写：没有 trashed 的项两个比较都为假，只在有过期项、需要写回时随之被丢掉。
 */
export function purgeAssetTrash<T extends { trashed?: number }>(list: T[] | null | undefined, now: number): { kept: T[]; changed: boolean } {
  const all = list || []
  const cut = now - TRASH_DAYS * 864e5
  if (!all.some((a) => (a.trashed as number) < cut)) return { kept: all, changed: false }
  return { kept: all.filter((a) => (a.trashed as number) >= cut), changed: true }
}

