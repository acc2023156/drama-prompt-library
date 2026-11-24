import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeLib } from '../../src/domain/library'
import { oppOf, pick, SX, SX_ALLY, SX_COLORS, SX_LOC, SX_NAMES, SX_OPP, SX_TITLES, sxBuildWork, sxHL, sxOutline, sxPrompt, sxRng, sxScript, sxScriptText } from '../../src/domain/sx'
import type { Gender, SxState } from '../../src/domain/types'
import { loadData } from './data'
import type { Legacy } from './legacy'
import { callLegacy, fixLegacyNow, legacyOutcome, legacyWith, lit, norm, outcome, printStats, same, sameAll, seedLegacyRandom, seqRng, setLegacyStore } from './domain-helpers'
import { RNG_SEQS, workList } from './domain-fixtures'

let L: Legacy
const data = loadData()
const lib = makeLib(data.entries)
beforeAll(() => {
  L = legacyWith()
})
afterAll(() => printStats('sx'))

const NAMES = ['陆沉', '苏晚', 'A', '', '《名》', '含&<>"符号']
const SEEDS = [undefined, 0, 1, 42, 7777, 123456789, 999999999, 2 ** 31, 2 ** 32 + 5]

/** 角色模板 × 主角名 × 种子组成的标准版作品；大纲取自旧页面 sxOutline，保证输入同源。 */
function states(): SxState[] {
  const out: SxState[] = []
  for (const g of ['male', 'female'] as Gender[]) {
    ;(data.roles[g] as any[]).forEach((role, ri) => {
      const name = NAMES[ri % NAMES.length]
      const outline = callLegacy<[string, string][]>(L, 'sxOutline', role, name, g)
      out.push({ id: `s${g}${ri}`, g, role, name, title: `标题${ri}`, idea: ri % 3 === 0 ? '' : '我想加的点子', outline, seed: SEEDS[ri % SEEDS.length] })
    })
  }
  return out
}

describe('标准版常量与小函数', () => {
  it('SX、SX_NAMES、SX_TITLES、SX_COLORS、SX_OPP、SX_ALLY、SX_LOC 逐字段相等', () => {
    same('SX', SX, L.run('SX'))
    same('SX_NAMES', SX_NAMES, L.run('SX_NAMES'))
    same('SX_TITLES', SX_TITLES, L.run('SX_TITLES'))
    same('SX_COLORS', SX_COLORS, L.run('SX_COLORS'))
    same('SX_OPP', SX_OPP, L.run('SX_OPP'))
    same('SX_ALLY', SX_ALLY, L.run('SX_ALLY'))
    same('SX_LOC', SX_LOC, L.run('SX_LOC'))
  })
  it('oppOf：关系串各种写法', () => {
    const rels = ['被轻视男主-势利前亲友', 'A-B-C', 'A-B；C-D', 'A;B-C', '无连字符', '', undefined, null, '；-前缀', 'x-', '-y', '甲-乙、丙；丁-戊']
    for (const r of rels) same('oppOf', oppOf(r as any), callLegacy(L, 'oppOf', r))
  })
  it('pick：固定随机序列', () => {
    const arrs: unknown[][] = [SX_NAMES.male, SX_NAMES.female, ['唯一'], [], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]
    for (const a of arrs) {
      const expr = `(()=>{const out=[];for(const seq of ${JSON.stringify(RNG_SEQS)}){let i=0;Math.random=()=>seq[i++%seq.length];out.push(pick(${lit(a)}),pick(${lit(a)}))}return out})()`
      const old = L.run<unknown[]>(expr)
      const fresh: unknown[] = []
      for (const seq of RNG_SEQS) {
        const rng = seqRng(seq)
        fresh.push(pick(a as unknown[], rng), pick(a as unknown[], rng))
      }
      sameAll('pick', fresh, old)
    }
  })
})

describe('sxOutline / sxPrompt', () => {
  it('每个角色模板、两种性别、各种主角名', () => {
    for (const g of ['male', 'female'] as Gender[]) {
      for (const role of data.roles[g] as any[]) {
        for (const name of NAMES) same('sxOutline', sxOutline(role, name, g), callLegacy(L, 'sxOutline', role, name, g))
      }
    }
  })
  it('sxOutline 异常结构：缺字段', () => {
    const t = data.roles.male[0]
    for (const bad of [{}, { ...t, gold: undefined }, { ...t, genres: null }, { ...t, hook: 5 }, { ...t, rel: undefined }]) {
      same('sxOutline(异常)', outcome(() => sxOutline(bad as any, 'N', 'male')), legacyOutcome(L, `sxOutline(${lit(bad)},'N','male')`))
    }
  })
  it('sxPrompt：含固定规格、角色字段、点子与分集大纲', () => {
    for (const s of states()) {
      same('sxPrompt', sxPrompt(s, lib), callLegacy(L, 'sxPrompt', s))
      same('sxPrompt', sxPrompt({ ...s, idea: '' }, lib), callLegacy(L, 'sxPrompt', { ...s, idea: '' }))
    }
    const s0 = states()[0]
    expect(sxPrompt(s0, lib)).toContain(lib('2.5'))
  })
  it('sxPrompt 异常结构：缺 role / outline', () => {
    const s = states()[0]
    for (const bad of [{ ...s, role: undefined }, { ...s, outline: undefined }, { ...s, outline: [] }, { ...s, name: undefined }]) {
      same('sxPrompt(异常)', outcome(() => sxPrompt(bad as any, lib)), legacyOutcome(L, `sxPrompt(${lit(bad)})`))
    }
  })
})

describe('sxRng / sxScript / sxScriptText / sxHL', () => {
  it('sxRng：各种种子的前 60 个输出', () => {
    for (const seed of [...SEEDS, -1, 1.5, NaN, '7', null, 4294967296, 0xffffffff, 0x6d2b79f5]) {
      const old = L.run<number[]>(`(()=>{const r=sxRng(${lit(seed)});return Array.from({length:60},()=>r())})()`)
      const r = sxRng(seed as any)
      sameAll('sxRng', Array.from({ length: 60 }, () => r()), old)
    }
  })
  it('sxScript：20 个角色 × 种子，10 集台词逐字相等', () => {
    for (const s of states()) {
      const old = callLegacy<string[]>(L, 'sxScript', s)
      same('sxScript', sxScript(s), old)
      expect(old).toHaveLength(10)
    }
  })
  it('sxScript：同一角色换种子结果不同；同种子结果固定', () => {
    const s = states()[0]
    for (const seed of [undefined, 0, 1, 2, 3, 99, 12345, 2 ** 31, 2 ** 32 - 1, 2 ** 32, 2 ** 32 + 1]) {
      const v = { ...s, seed }
      same('sxScript(种子)', sxScript(v), callLegacy(L, 'sxScript', v))
      same('sxScript(种子)', sxScript(v), sxScript(v))
    }
    expect(sxScript({ ...s, seed: 1 }).join()).not.toBe(sxScript({ ...s, seed: 2 }).join())
  })
  it('sxScript 异常结构：大纲不足 / 过长、缺 role', () => {
    const s = states()[0]
    const bad = [
      { ...s, outline: [] }, { ...s, outline: s.outline.slice(0, 9) }, { ...s, outline: [...s.outline, ['第十一', 'x']] }, { ...s, outline: s.outline.slice(0, 3) },
      { ...s, role: undefined }, { ...s, role: { ...s.role, gold: undefined } }, { ...s, g: 'other' }, { ...s, outline: undefined },
    ]
    for (const b of bad) same('sxScript(异常)', outcome(() => sxScript(b as any)), legacyOutcome(L, `sxScript(${lit(b)})`))
  })
  it('sxScriptText 与 sxHL', () => {
    for (const s of states()) {
      same('sxScriptText', sxScriptText(s), callLegacy(L, 'sxScriptText', s))
      for (const ep of callLegacy<string[]>(L, 'sxScript', s).slice(0, 3)) same('sxHL', sxHL(ep), callLegacy(L, 'sxHL', ep))
    }
    const lines = [
      '', '1-1 夜／地点（内）／人物甲', '△ 动作', '[画面] 画面', '【标题】', '音乐提示：低沉', '> 引用', '# 标题 一', '## 场次一', '### 三级', '人物甲（语气）：台词', '人物甲：“话”', '名字：「话」',
      '普通行', 'A&B <b>"q"</b>', '一二三四五六七八九：越过八字', '12-3 场头', '△', 'x\ny\n△ z\n\n# h',
    ]
    for (const t of lines) same('sxHL', sxHL(t), callLegacy(L, 'sxHL', t))
  })
})

describe('sxBuildWork（旧 sxSaveWork）', () => {
  const NOW = 1_764_000_000_456
  it('新建、覆盖同 id、列表为空', () => {
    for (const s of states()) {
      for (const list of [[], workList(), [{ id: s.id, title: '旧', W: {}, time: 1 }, ...workList()]]) {
        setLegacyStore(L, 'works', list)
        fixLegacyNow(L, NOW)
        const old = L.run(`(()=>{sxSaveWork(${lit(s)});return store('works')})()`)
        const { list: next } = sxBuildWork(norm(list) as any, s, NOW)
        same('sxBuildWork', next, old)
      }
    }
  })
  it('不改入参', () => {
    const s = states()[0]
    const list = norm(workList()) as any[]
    const before = JSON.stringify([s, list])
    sxBuildWork(list, s, NOW)
    expect(JSON.stringify([s, list])).toBe(before)
  })
  it('随机序列未被消费：sxScript 与 sxBuildWork 不依赖 Math.random', () => {
    seedLegacyRandom(L, [0.1])
    const s = states()[1]
    same('sxScript(无随机)', sxScript(s), callLegacy(L, 'sxScript', s))
  })
})
