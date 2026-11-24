import type { Entry, Lib } from './types'

/** 条目编号比较：按 “章.节” 数值排序（旧页面 cmpId）。 */
export function cmpId(a: string, b: string): number {
  const x = a.split('.').map(Number),
    y = b.split('.').map(Number)
  return x[0] - y[0] || x[1] - y[1]
}

/** 旧页面 ENTRIES：按编号排序的副本。 */
export function sortEntries<E extends { id: string }>(entries: E[]): E[] {
  return entries.slice().sort((a, b) => cmpId(a.id, b.id))
}

/** 旧页面 byId：编号到条目的映射（先按编号排序，与旧实现一致）。 */
export function makeById<E extends { id: string }>(entries: E[]): Record<string, E> {
  return Object.fromEntries(sortEntries(entries).map((e) => [e.id, e]))
}

/** 取 markdown 里第一个代码块的正文。 */
export function firstCode(md: string): string {
  const m = md.match(/```[^\n]*\n([\s\S]*?)\n```/)
  return m ? m[1] : ''
}

/** 取 “**用法**：…” 一行（去掉 * 和反引号）。 */
export function usage(md: string): string {
  const m = md.match(/\*\*用法\*\*[:：]\s*([^\n]+)/)
  return m ? m[1].replace(/[*`]/g, '') : ''
}

export function licClass(l: string): string {
  return l.startsWith('内部') ? 'int' : l.includes('仅参考') ? 'ref' : ''
}

/** 旧页面 lib(id)：按条目编号取代码块正文，编号不存在返回空串。读全局 byId 改成显式传入条目。 */
export function makeLib(entries: Entry[]): Lib {
  const byId = makeById(entries)
  return (id) => {
    const e = byId[id]
    return e ? firstCode(e.body) : ''
  }
}
