import { MODE } from './wz'
import type { Work } from './types'

export const TRASH_DAYS = 30

/** 旧 liveWorks：未进回收站的作品。读 localStorage 改成显式传入全部作品。 */
export const liveWorks = (list: Work[] | null | undefined): Work[] => (list || []).filter((w) => !w.trashed)

/**
 * 旧 purgeTrash 的纯逻辑：回收站里超过 30 天的作品。
 * 返回保留的列表 kept 与被清掉的 gone；gone 为空表示无需写回。
 * 旧实现里写回 localStorage、已登录时逐个 DELETE /works/:id 由调用方负责；当前时间改成显式参数 now。
 */
export function purgeTrash(list: Work[] | null | undefined, now: number): { kept: Work[]; gone: Work[] } {
  const all = list || []
  const cut = now - TRASH_DAYS * 864e5
  const gone = all.filter((w) => w.trashed && w.trashed < cut)
  return { kept: all.filter((w) => !(w.trashed && w.trashed < cut)), gone }
}

export const workHref = (w: Pick<Work, 'id' | 'kind'>): string =>
  w.kind === 'simple' ? '#/script/s/' + w.id : w.kind === 'vibe' ? '#/script/v/' + w.id : '#/script/w/' + w.id

export const workType = (w: Pick<Work, 'kind' | 'W'>): string =>
  w.kind === 'simple' ? '人物即剧本' : w.kind === 'vibe' ? '氛围写作' : w.W && MODE[w.W.mode as keyof typeof MODE] ? MODE[w.W.mode as keyof typeof MODE].tab : '作品'
