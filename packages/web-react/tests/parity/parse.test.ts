import { beforeAll, describe, expect, it } from 'vitest'
import { loadData } from './data'
import { type Legacy, loadLegacy } from './legacy'

describe('旧页面抽取器：parse()', () => {
  let legacy: Legacy
  beforeAll(() => {
    legacy = loadLegacy({ data: loadData() })
  })

  it('内嵌数据已注入旧页面作用域', () => {
    expect(legacy.run<number>('DATA.entries.length')).toBe(loadData().entries.length)
    expect(legacy.run<number>('filtered(DATA.entries).length')).toBeGreaterThan(0)
  })

  const cases: [string, unknown][] = [
    ['', { view: 'start' }],
    ['#/help', { view: 'start' }],
    ['#/prompts', { view: 'home' }],
    ['#/membership', { view: 'membership' }],
    ['#/changelog', { view: 'changelog' }],
    ['#/e/2.5', { view: 'entry', id: '2.5', folder: '02-adaptation' }],
    ['#/f/03-revision/dialogue', { view: 'list', folder: '03-revision/dialogue' }],
    ['#/assets/role-board?i=2', { view: 'tool', tool: 'assets', fn: 'role-board', idx: 2 }],
    ['#/script/s/sabc?new=1', { view: 'tool', tool: 'script', sub: 'result', sid: 'sabc', fresh: true }],
    ['#/script/new', { view: 'tool', tool: 'script', sub: 'new' }],
    ['#/script/v/wabc/board', { view: 'tool', tool: 'script', sub: 'vibe', wid: 'wabc', vtab: 'board' }],
    ['#/assembler?ep=wabc.3', { view: 'assembler' }],
  ]
  it.each(cases)('parse(%j)', (hash, expected) => {
    expect(legacy.parse(hash)).toEqual(expected)
  })

  it('assembler?ep= 命中本地作品时带出 ep 与 vibe', () => {
    const l = loadLegacy({
      data: loadData(),
      storage: { 'pl.works': JSON.stringify([{ id: 'wabc', title: '测试剧' }]) },
    })
    expect(l.parse('#/assembler?ep=wabc.3')).toEqual({
      view: 'assembler',
      ep: { wid: 'wabc', i: 3 },
      vibe: { id: 'wabc', title: '测试剧', tab: 'board' },
    })
  })
})
