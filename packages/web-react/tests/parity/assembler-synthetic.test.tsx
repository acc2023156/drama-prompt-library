import { beforeAll, describe, expect, it } from 'vitest'
import { A, type Action, installData, installNewSideStubs, mountPair, prepareLegacy, stats } from './assembler-harness'
import { loadContentData } from './assembler-legacy-dom'

/**
 * 真实内容只有 1 个画风、1 个可选条款，覆盖不到多项并存时的排版与顺序。
 * 这里把内容数据换成合成的：3 个画风、3 个可选条款（占位行在开头、中间、末尾且末尾无换行）、
 * 补丁条目跨多个章节、编号 9.12 / 10.1 检验按数值排序，再与旧页面逐节点比较。
 */
const real = loadContentData()
const data = structuredClone(real)
data.core.styles = { 末日废土写实: real.core.styles['末日废土写实'], 古风写实: '古风画风正文\n第二行', '赛博 <朋克>&"': '含特殊字符的画风' }
data.core.options = { 成人内容: real.core.options['成人内容'], 第二条: '第二条正文，\n两行', 第三条: '第三条' }
data.core.parts = ['{{OPT:第二条}}\n头部 {{STYLE}} 尾', '中间\n{{OPT:成人内容}}\n再一段', '末尾 {{STYLE}}\n{{OPT:第三条}}', '{{OPT:不存在的条款}}\n最后一行']
const proto = data.entries[0]
data.entries.push(
  { ...proto, id: '10.1', title: '十章一节 <标题>&"', patches: ['三', '一'], folder: '06-video/patches' },
  { ...proto, id: '9.12', title: '九章十二节', patches: ['三'], folder: '06-video/patches' },
  { ...proto, id: '9.2', title: '九章二节', patches: ['三', '七', '八'], folder: '06-video/patches' },
  { ...proto, id: '9.3', title: '没有补丁', patches: undefined, folder: '06-video/patches' },
)
const STYLES = Object.keys(data.core.styles)
const OPTS = Object.keys(data.core.options)

let AssemblerPage: typeof import('../../src/features/assembler/AssemblerPage').AssemblerPage
beforeAll(async () => {
  installData(data)
  installNewSideStubs()
  prepareLegacy(data)
  ;({ AssemblerPage } = await import('../../src/features/assembler/AssemblerPage'))
})

const work = { id: 'w1', title: '合成剧', kind: 'vibe', vname: '林凡', vname2: '苏晴', seed: 2, W: { genre: '都市', pitch: '丧尸末日' } }
const works = (extra: Record<string, unknown> = {}) => ({ 'pl.works': JSON.stringify([{ ...work, ...extra }]) })

describe('合成内容数据（3 画风、3 条款）', () => {
  it('补丁条目分组：章节顺序、同章节按编号数值排序', () => {
    const p = mountPair(AssemblerPage, { data, storage: {} })
    p.compare('初始')
    const rows = [...p.box.querySelectorAll('.plist a')].map((a) => a.textContent)
    expect(rows.some((t) => t!.includes('10.1 十章一节 <标题>&"'))).toBe(true)
    const three = rows.filter((t) => t!.startsWith('【三】')).map((t) => t!.slice(3).split(' ')[0])
    expect(three.indexOf('9.2')).toBeLessThan(three.indexOf('9.12'))
    expect(three.indexOf('9.12')).toBeLessThan(three.indexOf('10.1'))
    p.unmount()
  })

  it.each(STYLES)('上次画风 %s', (s) => {
    const p = mountPair(AssemblerPage, { data, storage: { 'pl.asm': JSON.stringify({ style: s, custom: '' }) } })
    p.compare('初始')
    p.unmount()
  })

  it('依次点每个画风与自定义，各画风下开关条款（含开关先后顺序）', async () => {
    const p = mountPair(AssemblerPage, { data, storage: {} })
    const seq: Action[] = []
    for (const s of [...STYLES, '__custom']) seq.push(A.style(s), A.toggle(OPTS[1]), A.toggle(OPTS[0]), A.toggle(OPTS[2]), A.toggle(OPTS[1]), A.toggle(OPTS[0]), A.toggle(OPTS[2]))
    seq.push(A.custom('自定义画风\n两行'))
    await p.runCompare('合成', ...seq)
    p.unmount()
  })

  it('条款 8 种开关组合的组装结果（#out 与统计行）逐节点相等', async () => {
    for (let mask = 0; mask < 1 << OPTS.length; mask++) {
      const p = mountPair(AssemblerPage, { data, storage: {} })
      await p.runCompare(`组合 ${mask}`, ...OPTS.filter((_, i) => mask & (1 << i)).map((o) => A.toggle(o)))
      p.unmount()
    }
  })

  it('分镜编辑：每个画风作为作品保存的画风，加上条款后“储存并返回”', async () => {
    for (const s of [...STYLES, '__custom']) {
      const p = mountPair(AssemblerPage, {
        data,
        storage: { ...works(), 'pl.asmW': JSON.stringify({ w1: { style: s, custom: '作品自带画风' } }) },
        ep: { wid: 'w1', i: 1 },
      })
      p.compare('初始')
      await p.runCompare('保存', A.toggle(OPTS[2]), A.toggle(OPTS[0]), A.back())
      p.unmount()
    }
  })

  it('分镜编辑：题材命中“末日废土写实”时直接选内置画风，而不是自定义', () => {
    const p = mountPair(AssemblerPage, { data, storage: works(), ep: { wid: 'w1', i: 0 } })
    expect(p.box.querySelector('#sty button.on')!.getAttribute('data-v')).toBe('末日废土写实')
    expect((p.box.querySelector('#customStyle') as HTMLElement).style.display).toBe('none')
    p.compare('初始')
    p.unmount()
  })

  it('比较确实在比较：统计量', () => {
    expect(stats.compares).toBeGreaterThan(20)
    console.log(`[assembler 合成数据] ${stats.pairs} 组，比较 ${stats.compares} 次，累计 ${stats.nodes} 个节点`)
  })
})
