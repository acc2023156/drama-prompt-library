import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asmGenreStyle, assemble, OPT_INFO, type AsmCore, type AsmState } from '../../src/domain/assembler'
import { makeById } from '../../src/domain/library'
import { G, styleList } from '../../src/domain/styles'
import { sxScript } from '../../src/domain/sx'
import type { Entry, Gender } from '../../src/domain/types'
import { epMat, vibeData, vibeLeads, vibeSx } from '../../src/domain/vibe'
import { loadData } from './data'
import { LEGACY_TEMPLATE, type Legacy, loadLegacy } from './legacy'
import { callLegacy, legacyOutcome, legacyWith, lit, norm, outcome, printStats, same, seedLegacyRandom, seqRng, setLegacyStore } from './domain-helpers'
import { PITCHES } from './domain-fixtures'

let L: Legacy
const data = loadData()
beforeAll(() => {
  L = legacyWith()
})
afterAll(() => printStats('vibe'))

const WS: any[] = [
  undefined, {}, { pair: '男女', aud: '女性向' }, { pair: '女女（GL）' }, { pair: '男男（BL）', aud: '女性向' }, { aud: '男性向' }, { aud: '女性向', pair: '' },
  { genre: '古装', hooks: ['打脸'], qxMode: '甜宠', core: '核心\n第二行', rival: ' 对手 ' }, { genre: '霸总', hooks: [], core: '', rival: '' }, { hooks: ['a', 'b', 'c'], genre: '玄幻' },
]

function works(): any[] {
  const out: any[] = []
  PITCHES.forEach((pitch, i) => {
    const W = { ...(WS[i % WS.length] ?? {}), pitch }
    out.push({ id: 'w' + i, title: '剧' + i, W, vname: i % 4 === 0 ? '固定名' : undefined, vname2: i % 5 === 0 ? '名二' : undefined, seed: i % 3 === 0 ? undefined : i * 7 })
  })
  out.push({ id: 'wn', title: 't' }, { id: 'wx', title: 't', W: null }, { id: 'wy', title: 't', W: { hooks: undefined } })
  return out
}

describe('vibeLeads / vibeSx', () => {
  it('vibeLeads：配对与受众组合', () => {
    for (const pair of ['男女', '男男（BL）', '女女（GL）', '', undefined, '男男']) for (const aud of ['女性向', '男性向', '男同志向', undefined]) {
      same('vibeLeads', vibeLeads({ pair, aud } as any), callLegacy(L, 'vibeLeads', { pair, aud }))
    }
  })
  it('vibeSx：卖点取名与随机取名、vname / vname2 / seed 各种组合（固定随机序列）', () => {
    for (const w of works()) {
      for (const seq of [[0], [0.5], [0.999]]) {
        seedLegacyRandom(L, seq)
        same('vibeSx', outcome(() => vibeSx(norm(w), seqRng(seq))), legacyOutcome(L, `vibeSx(${lit(w)})`))
      }
    }
  })
  it('vibeSx 异常结构：hooks 不是数组', () => {
    for (const w of [{ id: 'a', title: 'b', W: { hooks: null } }, { id: 'a', title: 'b', W: { genre: null, pitch: null } }, { id: 'a', title: 'b', W: { pitch: 5 } }]) {
      seedLegacyRandom(L, [0.3])
      same('vibeSx(异常)', outcome(() => vibeSx(norm(w) as any, seqRng([0.3]))), legacyOutcome(L, `vibeSx(${lit(w)})`))
    }
  })
})

const EP_TEXTS: string[] = [
  '',
  '出场人物：甲、乙，丙\n场景：内景 · 宴会厅 · 夜\n甲（愤怒）：“话”\n乙：「话」',
  '## 场 1｜客厅（内）\n## 场2|走廊\n#### 场 3 ｜ 天台（外）',
  '1-1 夜／地点甲（内）／人物甲、人物乙\n2-3 日／地点乙（外）／丙，丁，戊己庚辛壬癸',
  '出场人物：甲、甲、乙\n出场人物：  ,、，丙',
  '场景：内景 · A · 日\n场景：内景·B·夜\n场景：外景 · A · 日',
  '1-1 夜／ 地点 （内）／ 甲 、乙\n2-2 日／ 另一处（外）／丙',
  '甲甲（x）：“a”\n乙乙乙乙乙乙：“b”\nabc：“c”\n丙（有（嵌套））：“d”',
  'no matches here',
]

describe('vibeData / epMat', () => {
  const gens = (): any[] => {
    const outline = [{ title: '一', event: 'e1', hook: 'h1', body: 'b1' }, { title: '二', event: 'e2', body: 'b2' }, { title: '三', body: 'b3' }]
    const cast = [{ name: '甲', role: '女主', bio: 'x' }]
    const d = (eps: any[], ol: any = outline) => ({ title: 'T', logline: 'L', outline: ol, eps, cast })
    return [
      undefined, null, {}, { status: 'outline' }, { status: 'off', data: d([]) },
      { status: 'done', data: d(['# 第 1 集：一\n正文一', '## 第2集 二\n\n正文二', '### 第三 集\n正文三']) },
      { status: 'writing', data: d(['正文一', null, undefined]) },
      { status: 'writing', data: d([]) },
      { status: 'error', engine: 'yq', data: d(['x']) },
      { status: 'error', engine: 'other', data: d(['x']) },
      { status: 'error', data: d(['x']) },
      { status: 'done', data: d(['x'], []) },
      { status: 'done', data: null },
      { status: 'done', data: { outline: [] } },
      { status: 'done', data: d(['#第1集\n  \n正文', '# 第 12 集 很多\n\n\n多行\n文本']) },
    ]
  }
  it('vibeData：无模型结果走 sxScript 草稿，有结果按进度拼接', () => {
    let k = 0
    for (const g of gens()) {
      for (const w of works().slice(0, 12)) {
        const v = { ...w, gen: g }
        seedLegacyRandom(L, [0.42])
        same('vibeData', outcome(() => vibeData(norm(v), seqRng([0.42]))), legacyOutcome(L, `vibeData(${lit(v)})`))
        k++
      }
    }
    expect(k).toBeGreaterThan(150)
  })
  it('vibeData：草稿分支的台词与 sxScript 一致', () => {
    const w = { id: 'w1', title: 't', W: { pitch: '林小满穿成王妃' }, seed: 3, vname: '林小满' }
    const { s, eps } = vibeData(w as any)
    expect(eps).toEqual(sxScript(s))
    same('vibeData(草稿)', { s, eps }, callLegacy(L, 'vibeData', w))
  })
  it('epMat：多种剧本格式', () => {
    const scripts = ([...Array(6).keys()] as number[]).flatMap((i) => callLegacy<string[]>(L, 'sxScript', { id: 'x', g: (i % 2 ? 'female' : 'male') as Gender, role: data.roles[i % 2 ? 'female' : 'male'][i], name: '甲乙', title: 't', idea: '', outline: callLegacy(L, 'sxOutline', data.roles[i % 2 ? 'female' : 'male'][i], '甲乙', i % 2 ? 'female' : 'male'), seed: i + 1 }))
    for (const t of [...EP_TEXTS, ...scripts]) same('epMat', epMat(t), callLegacy(L, 'epMat', t))
    for (const t of [undefined, null, 5]) same('epMat(异常)', outcome(() => epMat(t as any)), legacyOutcome(L, `epMat(${lit(t)})`))
  })
})

describe('styleList', () => {
  it('内置 + 项目画风 + 6.5 仙侠 + 自定义（读全局改成显式参数）', () => {
    const byId = makeById<Entry>(data.entries)
    for (const custom of [undefined, null, '', '  ', '  我的画风  ', '多行\n画风']) {
      setLegacyStore(L, 'asm', custom === undefined ? undefined : { custom })
      const old = L.run('styleList()')
      same('styleList', styleList(data.core.styles, byId, custom), old)
    }
    setLegacyStore(L, 'asm', undefined)
    same('styleList(无存储)', styleList(data.core.styles, byId, undefined), L.run('styleList()'))
    same('G', G, L.run('G'))
  })
  it('缺 6.5 条目、6.5 无代码块、无项目画风时同样回退', () => {
    const variants: [string, any][] = [
      ['无 6.5', { ...data, entries: data.entries.filter((e: any) => e.id !== '6.5') }],
      ['6.5 无代码块', { ...data, entries: data.entries.map((e: any) => (e.id === '6.5' ? { ...e, body: '没有代码块' } : e)) }],
      ['无项目画风', { ...data, core: { ...data.core, styles: {} } }],
      ['画风带空白', { ...data, core: { ...data.core, styles: { 甲: '  甲风  \n', 乙: '' } } }],
    ]
    for (const [, d] of variants) {
      const l = loadLegacy({ data: d, storage: { 'pl.asm': JSON.stringify({ custom: ' c ' }) } })
      same('styleList(变体)', styleList(d.core.styles, makeById<Entry>(d.entries), ' c '), l.run('styleList()'))
    }
  })
})

describe('asmGenreStyle', () => {
  it('每条规则的命中与默认画风', () => {
    const samples = ['末日', '废土', '丧尸', '核战', '灾变', '医院', '医生', '护士', '急诊', '手术', '古装', '古代', '宫廷', '王爷', '皇', '侯府', '穿越成嫡女', '穿越成千金', '穿越成abc王妃', '玄幻', '修仙', '仙', '宗门', '妖', '魔',
      '系统', '异能', '读心', '超能', '霸总', '总裁', '职场', '公司', '法务', '律师', '没有关键词', '']
    const ws: any[] = []
    for (const s of samples) {
      ws.push({ W: { genre: s } }, { W: { pitch: s } }, { W: { core: s } }, { W: { genre: '都市', pitch: s, core: '' } })
    }
    ws.push({ W: {} }, { W: undefined }, { W: null }, { W: { genre: '医院', pitch: '末日' } }, { W: { genre: '古装', pitch: '系统读心' } })
    for (const p of PITCHES) ws.push({ W: { pitch: p } })
    for (const w of ws) same('asmGenreStyle', asmGenreStyle(w), callLegacy(L, 'asmGenreStyle', w))
  })
})

describe('assemble（旧 viewAssembler 内的闭包）', () => {
  const src = readFileSync(LEGACY_TEMPLATE, 'utf8')
  const m = src.match(/function assemble\(\)\{[\s\S]*?\n  \}\n/)
  const legacyAssemble = (l: Legacy, st: AsmState, epTxt: string) => {
    if (!m) throw new Error('模板里没有找到 assemble 闭包，需要同步调整抽取方式')
    return l.run(`((st,epTxt)=>{${m[0]}\nreturn assemble()})(${lit(st)},${lit(epTxt)})`)
  }
  it('抽取到旧闭包源码', () => {
    expect(m).not.toBeNull()
    expect(m![0]).toContain('DATA.core')
  })
  const styles = Object.keys(data.core.styles)
  const opts = Object.keys(data.core.options)
  const stCases = (): AsmState[] => {
    const out: AsmState[] = []
    for (const style of [...styles, '__custom', '不存在的画风', '']) {
      for (const custom of ['', '自定义画风', '含 $& 与 $1 与 $$ 与 $` 与 $\' 的画风']) {
        for (const o of [{}, Object.fromEntries(opts.map((k) => [k, true])), Object.fromEntries(opts.map((k) => [k, false])), { 成人内容: true }, { 不存在: true }]) out.push({ style, custom, opts: o })
      }
    }
    return out
  }
  it('真实 6.0 主模板：画风 × 自定义 × 可选条款 × 单集追加', () => {
    for (const st of stCases()) for (const ep of ['', '第 1 集剧本\n多行']) same('assemble', assemble(data.core as AsmCore, st, ep), legacyAssemble(L, st, ep))
    expect(opts).toContain('成人内容')
    // 打开 / 关闭条款确实改变输出，避免两边都没处理可选条款
    const on = assemble(data.core as AsmCore, { style: styles[0], custom: '', opts: { 成人内容: true } }, '')
    const off = assemble(data.core as AsmCore, { style: styles[0], custom: '', opts: {} }, '')
    expect(on).not.toBe(off)
  })
  it('合成主模板：条款行在行首 / 行尾无换行 / 缺条款 / 多个 STYLE 占位', () => {
    const core: AsmCore = {
      parts: ['头\n', '{{OPT:甲}}\n条款后一行\n', '{{OPT:乙}}', '\n{{OPT:甲}}\n', '中间 {{OPT:丙}} 行内不处理\n', '风格：{{STYLE}}\n再来一次 {{STYLE}}\n', '{{OPT:缺}}\n尾'],
      styles: { 画风A: 'A$&A', 画风B: '' },
      options: { 甲: '【甲条款】', 乙: '【乙条款】', 丙: '【丙条款】' },
    }
    const l = loadLegacy({ data: { ...data, core }, storage: {} })
    const sts: AsmState[] = []
    for (const style of ['画风A', '画风B', '__custom', '无此画风']) for (const o of [{}, { 甲: true }, { 乙: true }, { 甲: true, 乙: true, 丙: true, 缺: true }] as Record<string, boolean>[]) sts.push({ style, custom: 'C$1', opts: o })
    for (const st of sts) for (const ep of ['', 'EP']) same('assemble(合成)', assemble(core, st, ep), legacyAssemble(l, st, ep))
  })
  it('OPT_INFO 与旧页面相等', () => {
    same('OPT_INFO', OPT_INFO, L.run('OPT_INFO'))
  })
})

describe('不改入参', () => {
  it('vibeData、assemble、styleList 不修改传入对象', () => {
    const w = norm(works()[2])
    const st: AsmState = { style: styles0(), custom: 'x', opts: { 成人内容: true } }
    const before = JSON.stringify([w, st, data.core])
    vibeData(w, seqRng([0.1]))
    assemble(data.core as AsmCore, st, 'e')
    styleList(data.core.styles, makeById<Entry>(data.entries), 'c')
    expect(JSON.stringify([w, st, data.core])).toBe(before)
  })
})
function styles0(): string {
  return Object.keys(data.core.styles)[0]
}
