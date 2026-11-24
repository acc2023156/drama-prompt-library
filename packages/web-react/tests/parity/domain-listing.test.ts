import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KW_BLOCK, KW_RAW, KW_STOP, kwOk, listingClean, listingPrompt, listingText, lstDay } from '../../src/domain/listing'
import type { GenData, WzSettings } from '../../src/domain/types'
import { WZ_DEF } from '../../src/domain/wz'
import { loadData } from './data'
import type { Legacy } from './legacy'
import { callLegacy, legacyOutcome, legacyWith, lit, norm, outcome, printStats, same } from './domain-helpers'

let L: Legacy
beforeAll(() => {
  loadData()
  L = legacyWith()
})
afterAll(() => printStats('listing'))

const SRCS = [
  { words: ['词一（热度 10，up）', '词二'], topics: ['事件（社会，up）'], at: '2026-11-24' },
  { words: [], topics: [], at: '' },
  { words: ['只有词'], topics: [], at: '2026-11-01 08:00' },
  { words: [], topics: ['只有事件'], at: undefined },
]

const d = (over: Partial<GenData> = {}): GenData => ({
  title: '剧名', logline: '梗概', outline: [{ title: '一', event: '事件一', hook: '钩一' }, { title: '二', event: '事件二' }, { title: '三' }],
  eps: [], cast: [{ name: '甲', role: '女主' }, { name: '乙', role: '男主' }], ...over,
}) as GenData

const Ws = (): Partial<WzSettings>[] => [
  {}, { aud: '男性向', pair: '男男（BL）', genre: '霸总', mins: 5, heat: '高尺度' }, { genre: '', heat: '正常', mins: '自定义', minsCustom: '4' },
  { heat: '点到为止', pitch: '卖点句' }, { heat: 'x', mins: 1 }, { heat: undefined, genre: undefined as any },
]

describe('关键词常量与 kwOk', () => {
  it('KW_STOP、KW_BLOCK、KW_RAW 与旧页面相等', () => {
    same('KW_STOP', [...KW_STOP], L.run('Array.from(KW_STOP)'))
    same('KW_BLOCK', { s: KW_BLOCK.source, f: KW_BLOCK.flags }, L.run('({s:KW_BLOCK.source,f:KW_BLOCK.flags})'))
    same('KW_RAW', { s: KW_RAW.source, f: KW_RAW.flags }, L.run('({s:KW_RAW.source,f:KW_RAW.flags})'))
  })
  it('kwOk：红线词、站名、普通词、空值', () => {
    const ts: unknown[] = ['', undefined, null, 0, '普通词', '学生', '校园恋爱', 'JAV', 'av', 'bavx', 'a av b', '七猫', '番茄小说', '抖音', '母女', '继父', '兄妹', '堂哥', '乱伦', '下药', '偷拍', '自闭症', '精神病',
      '儿子', '孩子', '幼儿', '童话', '高中生', '初中', '少女', '萝莉', '未成年', '强奸', '岳母', '公公', '儿媳', '契约婚姻', '女总裁', ...[...KW_STOP]]
    for (const t of ts) same('kwOk', kwOk(t), callLegacy(L, 'kwOk', t))
  })
})

describe('listingPrompt', () => {
  it('作品设定 × 尺度 × 热词来源', () => {
    for (const W of Ws()) for (const src of SRCS) for (const gen of [d(), d({ title: '', logline: '', cast: [] }), d({ outline: [] })]) {
      const w = { title: '作品名', W }
      same('listingPrompt', outcome(() => listingPrompt(norm(w) as any, norm(gen), norm(src) as any)), legacyOutcome(L, `listingPrompt(${lit(w)},${lit(gen)},${lit(src)})`))
    }
  })
  it('异常结构：缺 cast、缺 W、缺 outline', () => {
    const cases: [unknown, unknown, unknown][] = [
      [{ title: 't', W: {} }, { title: '', outline: [] }, SRCS[0]], [{ title: 't' }, d(), SRCS[0]], [{ title: 't', W: {} }, { title: 'x' }, SRCS[0]], [{ title: 't', W: {} }, d(), { words: [] }], [{ title: 't', W: {} }, d(), undefined],
    ]
    for (const [w, gen, src] of cases) same('listingPrompt(异常)', outcome(() => listingPrompt(norm(w) as any, norm(gen) as any, norm(src) as any)), legacyOutcome(L, `listingPrompt(${lit(w)},${lit(gen)},${lit(src)})`))
  })
  it('高尺度、正常、点到为止三档用词各不相同', () => {
    const p = (heat: string) => listingPrompt({ title: 't', W: { ...WZ_DEF, heat } }, d(), SRCS[0] as any)
    expect(new Set([p('高尺度'), p('正常'), p('点到为止')]).size).toBe(3)
  })
})

describe('listingClean', () => {
  const many = (n: number, f: (i: number) => unknown) => Array.from({ length: n }, (_, i) => f(i))
  it('标题、标签、关键词的过滤与截断', () => {
    const xs: unknown[] = [
      {}, { titles: [], tags: {}, keywords: {} },
      { titles: ['甲', { t: '乙', kw: 'k' }, { t: '学生剧' }, null, { t: '' }, '', '丙', '丁'], oneLine: '  一句话  ', intro: ' 介绍 ', tags: { evergreen: many(9, (i) => ` 常青${i} `), timely: many(7, (i) => `时效${i}`) }, keywords: { short: many(14, (i) => `短${i}`), long: many(14, (i) => `长${i}`) } },
      { titles: [{ t: '甲' }, { t: '乙' }, { t: '丙' }, { t: '丁' }], tags: { evergreen: ['校园', '学生', '好词', 5, null, undefined, '  '], timely: 'notarray' }, keywords: { short: [' ', '七猫', '正常'], long: null } },
      { titles: 'str', oneLine: 5, intro: null, tags: null, keywords: undefined },
      { titles: [{ t: 'ok' }], oneLine: undefined, intro: undefined, tags: { evergreen: [0, false, 'x'] } },
      { titles: [{ t: '儿子' }, { t: '妈妈' }, { t: '正常标题' }], keywords: { short: ['av', 'AV', 'bav'], long: ['一 二 三', '兄妹情'] } },
    ]
    for (const x of xs) same('listingClean', outcome(() => listingClean(x)), legacyOutcome(L, `listingClean(${lit(x)})`))
    for (const x of [undefined, null]) same('listingClean(异常)', outcome(() => listingClean(x)), legacyOutcome(L, `listingClean(${lit(x)})`))
  })
})

describe('lstDay / listingText', () => {
  it('lstDay：wordsAt 优先，否则取抓取时间', () => {
    const at = Date.UTC(2026, 10, 24, 12, 30)
    for (const Lg of [{ wordsAt: '2026-11-24' }, { wordsAt: '' , at }, { at }, { at: 0 }, { wordsAt: '11月', at }, {}, { at: 'bad' }, { at: 8.64e15 + 1 }]) {
      same('lstDay', outcome(() => lstDay(Lg as any)), legacyOutcome(L, `lstDay(${lit(Lg)})`))
    }
  })
  it('listingText：上架资料文本', () => {
    const data = { titles: [{ t: '片名一' }, { t: '片名二', kw: 'k' }], oneLine: '一句话简介', intro: '介绍\n多行', tags: { evergreen: ['常青甲', '常青乙'], timely: ['时效甲'] }, keywords: { short: ['短甲', '短乙'], long: ['长甲 长乙'] } }
    const ws: unknown[] = [
      { title: '剧', listing: { at: Date.UTC(2026, 10, 24), wordsAt: '2026-11-20', data } },
      { title: '剧', listing: { at: Date.UTC(2026, 10, 24), data } },
      { title: '剧', listing: { wordsAt: '2026-11-20', data: { ...data, tags: { evergreen: [], timely: [] }, keywords: { short: [], long: [] }, titles: [] } } },
      { title: '剧' }, { title: '剧', listing: null }, { title: '', listing: { wordsAt: 'x', data: { ...data, oneLine: '' } } },
      { title: '剧', listing: { wordsAt: 'x', data: {} } }, { title: '剧', listing: { wordsAt: 'x' } },
    ]
    for (const w of ws) same('listingText', outcome(() => listingText(w as any)), legacyOutcome(L, `listingText(${lit(w)})`))
    expect(listingText({ title: 'x' } as any)).toBe('')
    expect(norm(listingText(ws[0] as any))).toContain('时效标签（11-20 热词，上架前换新）')
  })
})
