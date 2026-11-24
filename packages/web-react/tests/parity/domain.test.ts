import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const DOMAIN_DIR = new URL('../../src/domain/', import.meta.url)
const TEST_DIR = new URL('./', import.meta.url)

const domainFiles = readdirSync(DOMAIN_DIR).filter((f) => f.endsWith('.ts') && f !== 'types.ts')
const domainSrc = (f: string) => readFileSync(new URL(f, DOMAIN_DIR), 'utf8')

/** 去掉块注释与整行注释，避免文档里提到的 localStorage 等词干扰检查。 */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** 只在新实现里存在、旧页面没有对应物的导出（不做新旧对照）。 */
const NEW_ONLY = new Set(['DEFAULT_FILTER'])
/** 导出名与对照用例里标注名不同的别名。 */
const ALIAS: Record<string, string> = { makeLib: 'lib' }

describe('领域层纯度', () => {
  it('不依赖 DOM、存储、网络和全局状态，不读时间与随机数（随机源只作默认参数）', () => {
    for (const f of domainFiles) {
      const code = stripComments(domainSrc(f))
      expect(code, f).not.toMatch(/\b(document|window|localStorage|sessionStorage|location|navigator|history|fetch|XMLHttpRequest)\b/)
      expect(code, f).not.toMatch(/\bDate\.now\b|\bnew Date\(\s*\)/)
      expect([...code.matchAll(/Math\.random/g)].length, f).toBe([...code.matchAll(/=\s*Math\.random/g)].length)
      expect(code, f).not.toMatch(/from '(?!\.\/)/)
    }
  })
})

describe('对照覆盖清单', () => {
  const testSrc = readdirSync(TEST_DIR)
    .filter((f) => /^domain-.*\.test\.ts$/.test(f))
    .map((f) => readFileSync(new URL(f, TEST_DIR), 'utf8'))
    .join('\n')

  it('领域层每个导出的函数与常量至少有一条新旧对照用例', () => {
    const missing: string[] = []
    let total = 0
    for (const f of domainFiles) {
      for (const m of domainSrc(f).matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)) {
        const name = m[1]
        if (NEW_ONLY.has(name)) continue
        total++
        const label = ALIAS[name] ?? name
        if (!new RegExp(`(?:same|sameAll)\\(\\s*'${label}[('\\w]`).test(testSrc)) missing.push(`${f}:${name}`)
      }
    }
    expect(missing).toEqual([])
    expect(total).toBeGreaterThan(90)
  })
})
