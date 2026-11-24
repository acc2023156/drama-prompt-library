import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { assemble } from '../../src/domain/assembler'
import { loadData } from './data'

/** 组装结果与 build.py video 同源：同画风、同条款下文本逐字相等。 */
const BUILD_PY = fileURLToPath(new URL('../../../web/build.py', import.meta.url))
const data = loadData()
const STYLES: string[] = Object.keys(data.core.styles)
const OPTS: string[] = Object.keys(data.core.options)

function video(style: string, opts: string[]): string {
  const args = ['-I', '-B', BUILD_PY, 'video', '--style', style, ...opts.flatMap((o) => ['--option', o])]
  return execFileSync(process.env.TJ_PYTHON || 'python3', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}
const subsets = <T,>(xs: T[]): T[][] => xs.reduce<T[][]>((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]])

describe('assemble 与 build.py video 相等', () => {
  for (const style of STYLES) {
    for (const opts of subsets(OPTS)) {
      it(`画风 ${style}，条款 ${opts.join('、') || '无'}`, () => {
        const text = assemble(data.core, { style, custom: '', opts: Object.fromEntries(opts.map((o) => [o, true])) }, '')
        expect(text).toBe(video(style, opts))
      })
    }
  }

  it('至少覆盖一个画风与“成人内容”开与关两种情况', () => {
    expect(STYLES.length).toBeGreaterThan(0)
    expect(OPTS).toContain('成人内容')
    expect(video(STYLES[0], ['成人内容']).length).toBeGreaterThan(video(STYLES[0], []).length)
  })

  it('条款开关只增删对应的占位行，不影响其余文本', () => {
    const off = assemble(data.core, { style: STYLES[0], custom: '', opts: {} }, '')
    const on = assemble(data.core, { style: STYLES[0], custom: '', opts: { 成人内容: true } }, '')
    expect(on).toContain(data.core.options['成人内容'])
    expect(off).not.toContain(data.core.options['成人内容'])
    expect(off).not.toContain('{{OPT:')
    expect(on).not.toContain('{{OPT:')
  })
})
