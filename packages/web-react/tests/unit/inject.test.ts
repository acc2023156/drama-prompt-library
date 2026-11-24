import { describe, expect, it } from 'vitest'
import { injectHtml, normalizeApiBase } from '../../plugins/tj-inject'

const TEMPLATE = `<script id="tj-data" type="application/json">/*__DATA__*/null</script>
<script>window.TJ_API_BASE=/*__API_BASE__*/'';</script>`

function readBack(html: string) {
  const data = /<script id="tj-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]
  const base = /window\.TJ_API_BASE=([\s\S]*?);<\/script>/.exec(html)![1]
  return { data: JSON.parse(data), base: JSON.parse(base) as string }
}

describe('normalizeApiBase', () => {
  it.each([
    [undefined, ''],
    ['', ''],
    ['   ', ''],
    ['https://api.example.test', 'https://api.example.test'],
    ['https://api.example.test/', 'https://api.example.test'],
    [' https://api.example.test// ', 'https://api.example.test'],
  ])('%j -> %j', (raw, expected) => {
    expect(normalizeApiBase(raw)).toBe(expected)
  })
})

describe('injectHtml', () => {
  it('数据回读相等，$ 与 </script 不破坏页面', () => {
    const data = { a: '</script><script>alert(1)</script>', b: '$& $1 $$ <!-- x', c: '中文' }
    const html = injectHtml(TEMPLATE, JSON.stringify(data), 'https://api.example.test')
    expect(html).not.toContain('</script><script>alert')
    expect(readBack(html)).toEqual({ data, base: 'https://api.example.test' })
  })

  it('后端地址为空时注入空字符串', () => {
    expect(readBack(injectHtml(TEMPLATE, '{}', '')).base).toBe('')
  })

  it('占位符缺失或重复时报错', () => {
    expect(() => injectHtml('<p></p>', '{}', '')).toThrow()
    expect(() => injectHtml(TEMPLATE + TEMPLATE, '{}', '')).toThrow()
  })
})
