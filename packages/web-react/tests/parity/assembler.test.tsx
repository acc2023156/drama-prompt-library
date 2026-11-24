import { act } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getToast } from '../../src/lib/toast'
import { A, type Action, type Ep, installData, installNewSideStubs, mountPair, neu, prepareLegacy, readBlob, sleep, stats } from './assembler-harness'
import { loadData } from './data'

/**
 * P2-B 对照：旧 viewAssembler / viewTool('storyboard') 在 jsdom 沙箱里真跑，
 * 与新组件渲染出的 DOM 逐节点比较（含渲染后的 class、style、textarea 值），并在每次操作后比较 localStorage。
 */
const data = loadData()
const STYLES: string[] = Object.keys(data.core.styles)
const OPTS: string[] = Object.keys(data.core.options)
const ADULT = '成人内容'

let AssemblerPage: typeof import('../../src/features/assembler/AssemblerPage').AssemblerPage
let StoryboardEntry: typeof import('../../src/features/assembler/StoryboardEntry').StoryboardEntry

beforeAll(async () => {
  installData(data)
  installNewSideStubs()
  prepareLegacy(data)
  ;({ AssemblerPage } = await import('../../src/features/assembler/AssemblerPage'))
  ;({ StoryboardEntry } = await import('../../src/features/assembler/StoryboardEntry'))
})
afterAll(() => {
  console.log(`[assembler 对照] 旧新页面对 ${stats.pairs} 组，DOM 与存储比较 ${stats.compares} 次，累计比较 ${stats.nodes} 个节点`)
})

const mk = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: '剧' + id,
  kind: 'vibe',
  time: 1,
  vname: '林凡',
  vname2: '苏晴',
  seed: 5,
  W: { genre: '都市', pitch: '' },
  ...over,
})
const gen = (over: Record<string, unknown> = {}) => ({
  engine: 'yq',
  status: 'done',
  data: {
    title: '模型剧名',
    logline: '一句话',
    outline: [
      { title: '开局<b>&"', body: '第一集大纲' },
      { title: '反转', body: '第二集大纲' },
      { title: '终局', body: '第三集大纲' },
    ],
    eps: ['# 第1集：开局\n\n正文一<i>&"\n第二行', null, '### 第 3 集 终局\n正文三'],
    cast: [],
  },
  ...over,
})

/** 每个题材关键字都对应一种默认画风（asmGenreStyle 全部 7 个分支）。 */
const GENRE_PITCHES: [string, string][] = [
  ['wdoom', '丧尸围城，末日求生'],
  ['whosp', '急诊科医生的深夜手术'],
  ['wancient', '穿越成古代王妃，侯府翻盘'],
  ['wxian', '修仙宗门里的妖魔'],
  ['wsys', '被退婚的假千金，靠读心系统在豪门翻盘'],
  ['wboss', '总裁的契约宠妻，法务上位'],
  ['wdefault', '校园甜宠日常'],
]

const WORKS = [
  mk('wdraft', { W: { genre: '都市', pitch: '被退婚的假千金，靠读心系统在豪门翻盘' } }),
  ...GENRE_PITCHES.map(([id, pitch]) => mk(id, { W: { genre: '都市', pitch } })),
  mk('wgen', { title: '带<特殊>&"字符的剧', gen: gen() }),
  mk('wgenerr', { gen: gen({ status: 'error' }) }),
  mk('wgenwriting', { gen: gen({ status: 'writing' }) }),
  mk('wgenempty', { gen: gen({ data: { title: 't', logline: 'l', outline: [], eps: [], cast: [] } }) }),
  mk('wtrash', { trashed: 5, W: { genre: '古装', pitch: '' } }),
  mk('wsimple', { kind: 'simple', sx: { name: '林凡' } }),
  { id: 'wnoW', title: '无设定', kind: 'vibe', vname: '甲', vname2: '乙', seed: 3 },
  mk('wsaved', { W: { genre: '古装', pitch: '' } }),
  mk('wsaved2', { W: { genre: '都市', pitch: '' } }),
  mk('wsaved3', { W: { genre: '都市', pitch: '' } }),
]
const ASMW = {
  wsaved: { style: '__custom', custom: '我的分镜画风\n第二行<>&"' },
  wsaved2: { style: STYLES[0] },
  wsaved3: { style: '已不存在的画风', custom: 'x' },
}
const seed = (extra: Record<string, unknown> = {}): Record<string, string> => ({
  'pl.works': JSON.stringify(WORKS),
  'pl.asmW': JSON.stringify(ASMW),
  ...Object.fromEntries(Object.entries(extra).map(([k, v]) => ['pl.' + k, JSON.stringify(v)])),
})

interface Case {
  name: string
  storage: Record<string, string>
  ep?: Ep
}
const ep = (wid: string, i = 0): Ep => ({ wid, i })

/** 普通组装器：存储里不同的上次选择。 */
const plainCases: Case[] = [
  { name: '空存储', storage: {} },
  { name: '存储坏掉（非 JSON）', storage: { 'pl.asm': '{坏' } },
  { name: 'asm = null 字符串', storage: { 'pl.asm': 'null' } },
  ...STYLES.map((s) => ({ name: `上次画风 ${s}`, storage: { 'pl.asm': JSON.stringify({ style: s, custom: '' }) } })),
  { name: '上次是自定义（带文字）', storage: { 'pl.asm': JSON.stringify({ style: '__custom', custom: '第一行<b>\n第二行&"' }) } },
  { name: '上次是自定义（无文字）', storage: { 'pl.asm': JSON.stringify({ style: '__custom' }) } },
  { name: '上次画风已不存在，回落第一个', storage: { 'pl.asm': JSON.stringify({ style: '被删掉的画风', custom: 'c' }) } },
  { name: '只有 custom 没有 style', storage: { 'pl.asm': JSON.stringify({ custom: '孤儿文字' }) } },
  { name: '有作品但不带 ep（作品被忽略）', storage: seed() },
  { name: 'ep 指向不存在的作品（退回普通模式）', storage: seed(), ep: ep('wnone', 0) },
]

/** 分镜编辑：每个题材分支、作品自己保存的画风、集序边界、各种作品形态。 */
const epCases: Case[] = [
  { name: '草稿剧本第 1 集（读心系统 → 自定义）', storage: seed(), ep: ep('wdraft', 0) },
  { name: '草稿剧本第 2 集', storage: seed(), ep: ep('wdraft', 1) },
  { name: '草稿剧本最后一集', storage: seed(), ep: ep('wdraft', 9) },
  { name: '集序远超范围（取最后一集）', storage: seed(), ep: ep('wdraft', 9999) },
  ...GENRE_PITCHES.map(([id, pitch]): Case => ({ name: `默认画风：${pitch}`, storage: seed(), ep: ep(id, 0) })),
  { name: '模型结果第 1 集（正文带标题行，被剥掉）', storage: seed(), ep: ep('wgen', 0) },
  { name: '模型结果第 2 集（未写，用大纲）', storage: seed(), ep: ep('wgen', 1) },
  { name: '模型结果第 3 集（### 标题行）', storage: seed(), ep: ep('wgen', 2) },
  { name: '模型结果越界取最后一集', storage: seed(), ep: ep('wgen', 50) },
  { name: '模型出错但引擎是 yq，仍用模型结果', storage: seed(), ep: ep('wgenerr', 0) },
  { name: '模型写作中', storage: seed(), ep: ep('wgenwriting', 1) },
  { name: '模型结果无大纲，回落草稿', storage: seed(), ep: ep('wgenempty', 0) },
  { name: '回收站里的作品也能分镜', storage: seed(), ep: ep('wtrash', 0) },
  { name: '标准版作品', storage: seed(), ep: ep('wsimple', 0) },
  { name: '作品没有设定 W', storage: seed(), ep: ep('wnoW', 0) },
  { name: '作品保存过自定义画风', storage: seed(), ep: ep('wsaved', 0) },
  { name: '作品保存过内置画风（custom 缺省）', storage: seed(), ep: ep('wsaved2', 0) },
  { name: '作品保存的画风已不存在', storage: seed(), ep: ep('wsaved3', 0) },
  { name: 'pl.asm 对分镜编辑无影响', storage: seed({ asm: { style: '__custom', custom: '别的' } }), ep: ep('wdraft', 0) },
  { name: 'asmW 为 null 字符串', storage: { ...seed(), 'pl.asmW': 'null' }, ep: ep('wdraft', 0) },
]

/** 旧 viewAssembler 拼标题时抛异常的集序。 */
const throwCases: Case[] = [
  { name: '集序为负', storage: seed(), ep: ep('wdraft', -1) },
  { name: '集序为 NaN（?ep=wdraft.x）', storage: seed(), ep: ep('wdraft', Number.NaN) },
  { name: '集序为 -0.5 之类的小数', storage: seed(), ep: ep('wdraft', -0.5) },
]

describe('初始渲染：旧页面 vs 新组件逐节点相等', () => {
  it.each([...plainCases, ...epCases])('$name', ({ storage, ep }) => {
    const p = mountPair(AssemblerPage, { data, storage, ep })
    expect(p.legacyThrew).toBe(false)
    expect(p.box.querySelectorAll('*').length).toBeGreaterThan(40)
    p.compare('初始')
    p.unmount()
  })

  it.each(throwCases)('旧页面抛异常、保持空白时，新页面也不渲染且不写存储：$name', async ({ storage, ep }) => {
    const p = mountPair(AssemblerPage, { data, storage, ep })
    expect(p.legacyThrew).toBe(true)
    expect(p.box.childNodes.length).toBe(0)
    p.compare('初始')
    expect(localStorage.getItem('pl.asm')).toBeNull()
    p.unmount()
  })

  it('普通模式初始渲染即写 pl.asm（与旧页面相同的内容）', () => {
    const p = mountPair(AssemblerPage, { data, storage: {} })
    expect(localStorage.getItem('pl.asm')).toBe(JSON.stringify({ style: STYLES[0], custom: '' }))
    p.compare('初始')
    p.unmount()
  })

  it('分镜编辑模式初始渲染不写 pl.asm 与 pl.asmW', () => {
    const p = mountPair(AssemblerPage, { data, storage: seed(), ep: ep('wdraft', 0) })
    expect(localStorage.getItem('pl.asm')).toBeNull()
    expect(localStorage.getItem('pl.asmW')).toBe(JSON.stringify(ASMW))
    p.unmount()
  })
})

describe('操作：每一步之后 DOM 与存储都和旧页面相等', () => {
  it('全部画风与自定义，来回切换', async () => {
    const p = mountPair(AssemblerPage, { data, storage: {} })
    await p.runCompare(
      '切画风',
      ...STYLES.map((s) => A.style(s)),
      A.style('__custom'),
      A.custom('第一行\n第二行 <b>&"'),
      A.custom(''),
      A.custom('只剩一行'),
      A.style(STYLES[0]),
      A.style(STYLES[0]),
      A.style('__custom'),
    )
    p.unmount()
  })

  it('每个可选条款的开关与全部组合顺序', async () => {
    const p = mountPair(AssemblerPage, { data, storage: {} })
    const seq: Action[] = []
    for (const o of OPTS) seq.push(A.toggle(o), A.toggle(o), A.toggle(o))
    // 条款数少时再加一轮反向，覆盖“后开先显示”的顺序
    for (const o of [...OPTS].reverse()) seq.push(A.toggle(o), A.toggle(o))
    await p.runCompare('条款', ...seq)
    expect(OPTS).toContain(ADULT)
    p.unmount()
  })

  it('成人内容条款警告与统计行', async () => {
    const p = mountPair(AssemblerPage, { data, storage: {} })
    await p.runCompare('成人', A.toggle(ADULT))
    expect((p.box.querySelector('#optWarn') as HTMLElement).style.display).toBe('block')
    expect(p.box.querySelector('#stat')!.textContent).toContain('可选条款：' + ADULT)
    await p.runCompare('成人关闭', A.toggle(ADULT))
    expect((p.box.querySelector('#optWarn') as HTMLElement).style.display).toBe('none')
    expect(p.box.querySelector('#stat')!.textContent).toContain('可选条款：无')
    p.unmount()
  })

  it('画风 × 条款 × 自定义文字混合', async () => {
    const p = mountPair(AssemblerPage, { data, storage: { 'pl.asm': JSON.stringify({ style: '__custom', custom: '初始自定义' }) } })
    await p.runCompare('混合', A.toggle(ADULT), A.style(STYLES[0]), A.custom('在隐藏的文本框里输入'), A.style('__custom'), A.custom('A{{STYLE}}B'), A.toggle(ADULT), A.style(STYLES[0]))
    p.unmount()
  })

  it('分镜编辑模式下的操作：不写 pl.asm，不存 pl.asmW，直到“储存并返回”', async () => {
    const p = mountPair(AssemblerPage, { data, storage: seed(), ep: ep('wdraft', 1) })
    await p.runCompare('分镜', A.style(STYLES[0]), A.toggle(ADULT), A.style('__custom'), A.custom('分镜自定义'))
    expect(localStorage.getItem('pl.asm')).toBeNull()
    expect(localStorage.getItem('pl.asmW')).toBe(JSON.stringify(ASMW))
    expect(p.box.querySelector('#pgBack')!.textContent).toBe('储存并返回')
    p.unmount()
  })

  it('储存并返回：普通模式与分镜编辑模式，存储与提示相同', async () => {
    for (const [storage, e] of [[{}, undefined], [seed(), ep('wdraft', 1)], [seed(), ep('wsaved', 0)]] as [Record<string, string>, Ep | undefined][]) {
      const p = mountPair(AssemblerPage, { data, storage, ep: e })
      await p.runCompare('保存', A.style('__custom'), A.custom('保存的画风'), A.toggle(ADULT), A.back())
      const tl = p.legacy.window.document.getElementById('toast')!
      expect(tl.textContent).toBe('已储存')
      expect(tl.classList.contains('show')).toBe(true)
      expect(getToast()).toStrictEqual({ text: '已储存', show: true })
      if (e) expect(JSON.parse(localStorage.getItem('pl.asmW')!)[e.wid]).toStrictEqual({ style: '__custom', custom: '保存的画风' })
      p.unmount()
    }
  })

  it('没有任何操作时点返回：不保存、不提示（按钮不是“储存并返回”）', async () => {
    const p = mountPair(AssemblerPage, { data, storage: seed(), ep: ep('wdraft', 0) })
    expect(p.box.querySelector('#pgBack')!.textContent).toBe('返回')
    expect(p.legacy.view.querySelector('#pgBack')!.textContent).toBe('返回')
    expect(p.box.querySelector('#pgBack')!.getAttribute('href')).toBe('#/script/v/wdraft/board')
    expect(p.box.querySelector('#pgBack')!.getAttribute('href')).toBe(p.legacy.view.querySelector('#pgBack')!.getAttribute('href'))
    p.unmount()
  })

  it('返回目标：普通模式 #/，分镜编辑回作品分镜页', () => {
    for (const [storage, e] of [[{}, undefined], [seed(), ep('wgen', 2)]] as [Record<string, string>, Ep | undefined][]) {
      const p = mountPair(AssemblerPage, { data, storage, ep: e })
      expect(p.box.querySelector('#pgBack')!.getAttribute('href')).toBe(p.legacy.view.querySelector('#pgBack')!.getAttribute('href'))
      p.unmount()
    }
  })

  it('复制全部：剪贴板文本、提示、按钮“已复制”状态及 1.3 秒后还原', async () => {
    const p = mountPair(AssemblerPage, { data, storage: seed(), ep: ep('wgen', 0) })
    await p.runCompare('复制前', A.toggle(ADULT), A.style('__custom'), A.custom('复制用画风'))
    await p.run(A.copy())
    expect(neu.copied).toHaveLength(1)
    expect(neu.copied).toStrictEqual(p.legacy.copied)
    expect(neu.copied[0]).toContain('复制用画风')
    expect(neu.copied[0]).toContain('# 第1集：开局')
    expect(neu.copied[0]).toBe(p.box.querySelector('#out')!.textContent)
    expect(getToast()).toStrictEqual({ text: '已复制到剪贴板', show: true })
    expect(p.legacy.window.document.getElementById('toast')!.textContent).toBe('已复制到剪贴板')
    expect(p.box.querySelector('#cpAll')!.className).toBe('copy done')
    p.compare('已复制')
    await act(async () => {
      await sleep(1400)
    })
    expect(p.box.querySelector('#cpAll')!.className).toBe('copy')
    p.compare('1.3 秒后还原')
    p.unmount()
  })

  it('下载 .txt：文件名、BOM、内容与旧页面相等', async () => {
    const p = mountPair(AssemblerPage, { data, storage: {} })
    await p.runCompare('下载前', A.toggle(ADULT), A.style('__custom'), A.custom('下载用画风'))
    await p.run(A.download())
    expect(neu.downloads).toHaveLength(1)
    expect(p.legacy.downloads).toHaveLength(1)
    expect(neu.downloads[0].name).toBe('6.0视频专用提示词.txt')
    expect(neu.downloads[0].name).toBe(p.legacy.downloads[0].name)
    const a = await readBlob(neu.downloads[0].blob, window)
    const b = await readBlob(p.legacy.downloads[0].blob, p.legacy.window as unknown as { FileReader: typeof FileReader })
    expect(a.startsWith('﻿')).toBe(true)
    expect(a).toBe(b)
    expect(a.slice(1)).toBe(p.box.querySelector('#out')!.textContent)
    p.unmount()
  })
})

describe('分镜入口（旧 viewTool storyboard）', () => {
  const vibes = [mk('v1', { time: 1 }), mk('v2', { time: 2 }), mk('v3', { time: 3, trashed: 9 })]
  const storyCases: [string, Record<string, unknown>][] = [
    ['没有作品', {}],
    ['只有标准版作品', { works: [{ id: 's1', title: 's', kind: 'simple' }] }],
    ['works 为空数组', { works: [] }],
    ['有氛围写作作品，无最近记录', { works: vibes }],
    ['最近记录指向第二个', { works: vibes, lastVibe: 'v2' }],
    ['最近记录指向回收站里的作品', { works: vibes, lastVibe: 'v3' }],
    ['最近记录已不存在，取第一个', { works: vibes, lastVibe: 'gone' }],
    ['标准版在前、氛围写作在后', { works: [{ id: 's1', kind: 'simple' }, ...vibes], lastVibe: 'v1' }],
    ['全部是回收站里的氛围写作', { works: [mk('t1', { trashed: 1 })] }],
  ]
  it.each(storyCases)('%s', (_n, kv) => {
    const storage = Object.fromEntries(Object.entries(kv).map(([k, v]) => ['pl.' + k, JSON.stringify(v)]))
    location.hash = ''
    const p = mountPair(StoryboardEntry, { data, storage }, "viewTool('storyboard')")
    expect(p.legacyThrew).toBe(false)
    p.compare('分镜入口')
    const target = p.legacy.window.location.hash
    // 旧页面 location.replace 的结果与新页面相同；没有作品时不跳转并显示占位页
    expect(location.hash).toBe(target)
    if (!target) expect(p.box.querySelector('section.soon')).not.toBeNull()
    else expect(p.box.childNodes.length).toBe(0)
    p.legacy.window.location.hash = ''
    p.unmount()
  })
})
