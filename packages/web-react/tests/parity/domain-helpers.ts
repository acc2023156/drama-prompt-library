import { expect } from 'vitest'
import { loadData } from './data'
import { type Legacy, loadLegacy } from './legacy'

/** 经 JSON 往返：丢掉 undefined、函数，与旧页面经 JSON 复制回来的结果同口径。 */
export const norm = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

/** 加载旧页面（含真实内嵌数据）；storage 为预置 localStorage（键带 pl. 前缀）。 */
export function legacyWith(storage: Record<string, unknown> = {}): Legacy {
  const raw: Record<string, string> = {}
  for (const [k, v] of Object.entries(storage)) raw['pl.' + k] = JSON.stringify(v)
  return loadLegacy({ data: loadData(), storage: raw })
}

/** 字面量：把参数序列化成可放进旧页面脚本的表达式。 */
export const lit = (v: unknown): string => (v === undefined ? 'undefined' : JSON.stringify(v))

/** 在旧页面里调用全局函数 fn(args...)。 */
export const callLegacy = <T = unknown>(l: Legacy, fn: string, ...args: unknown[]): T => l.run<T>(`${fn}(${args.map(lit).join(',')})`)

/** 旧页面 Math.random 换成循环序列。 */
export function seedLegacyRandom(l: Legacy, seq: number[]): void {
  l.run(`(()=>{const q=${JSON.stringify(seq)};let i=0;Math.random=()=>q[i++%q.length];return 1})()`)
}

/** 新实现用的同一循环序列。 */
export function seqRng(seq: number[]): () => number {
  let i = 0
  return () => seq[i++ % seq.length]
}

/** 旧页面 Date.now 固定。 */
export function fixLegacyNow(l: Legacy, ms: number): void {
  l.run(`(()=>{Date.now=()=>${ms};return 1})()`)
}

/** 取值或异常类型：用于异常输入时新旧同样失败。 */
export type Outcome = { ok?: unknown; err?: string }
export function outcome(fn: () => unknown): Outcome {
  try {
    return { ok: norm(fn()) }
  } catch (e) {
    return { err: (e as Error).name }
  }
}
export function legacyOutcome(l: Legacy, expr: string): Outcome {
  return l.run<Outcome>(`(()=>{try{return {ok:(${expr})}}catch(e){return {err:e.name}}})()`)
}

/** 对照计数：每个函数名累计新旧相等断言的次数，文件结束时打印。 */
export const stats = new Map<string, number>()

/** 断言新实现结果与旧实现结果深度相等，并计数。 */
export function same(name: string, fresh: unknown, old: unknown): void {
  stats.set(name, (stats.get(name) ?? 0) + 1)
  expect(norm(fresh)).toEqual(old)
}

export function printStats(file: string): void {
  const rows = [...stats.entries()].sort(([a], [b]) => a.localeCompare(b))
  const total = rows.reduce((n, [, c]) => n + c, 0)
  console.log(`[parity ${file}] ${rows.length} 个函数，${total} 次新旧对照\n` + rows.map(([k, c]) => `  ${k}: ${c}`).join('\n'))
}

/** 写旧页面的 localStorage（键不带 pl. 前缀）；v 为 undefined 时删除。 */
export function setLegacyStore(l: Legacy, k: string, v: unknown): void {
  if (v === undefined) l.storage.removeItem('pl.' + k)
  else l.storage.setItem('pl.' + k, JSON.stringify(v))
}

/** 批量对照：数组逐项相等，计数按元素个数。 */
export function sameAll(name: string, fresh: unknown[], old: unknown[]): void {
  expect(fresh.length).toBe(old.length)
  stats.set(name, (stats.get(name) ?? 0) + fresh.length)
  expect(norm(fresh)).toEqual(old)
}
