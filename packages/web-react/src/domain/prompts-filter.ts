import type { Entry } from './types'

/** 提示词库筛选条件（旧页面全局 state）。 */
export interface PromptFilterState {
  q: string
  /** all / direct / ref / int */
  lic: string
  prod: boolean
}

export const DEFAULT_FILTER: PromptFilterState = { q: '', lic: 'all', prod: false }

/** 旧页面 filtered(list)：读全局 state 改成显式参数 state。 */
export function filtered<E extends Pick<Entry, 'id' | 'title' | 'body' | 'license' | 'status'>>(list: E[], state: PromptFilterState): E[] {
  const q = state.q.trim().toLowerCase()
  return list.filter((e) => {
    if (state.lic === 'direct' && !e.license.includes('可直接用')) return false
    if (state.lic === 'ref' && !e.license.includes('仅参考')) return false
    if (state.lic === 'int' && !e.license.startsWith('内部')) return false
    if (state.prod && !(e.status || '').includes('已用于生产')) return false
    if (q && !(e.id + ' ' + e.title + ' ' + e.body).toLowerCase().includes(q)) return false
    return true
  })
}
