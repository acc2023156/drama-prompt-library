import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeLib } from '../../src/domain/library'
import { liveWorks } from '../../src/domain/works'
import {
  langOf, MODE, SUPP, WZ_DEF, WZ_OPT, wzBuildWork, wzDupCheck, wzEps, wzGuess, wzMins, wzNeeds, wzPrompt, wzRollTitle, wzScore, wzSeedAssets, wzSettings, wzTitle,
} from '../../src/domain/wz'
import type { WzSettings } from '../../src/domain/types'
import { loadData } from './data'
import type { Legacy } from './legacy'
import {
  callLegacy, fixLegacyNow, legacyOutcome, legacyWith, lit, norm, outcome, printStats, same, sameAll, seedLegacyRandom, seqRng, setLegacyStore,
} from './domain-helpers'
import { PITCHES, RNG_SEQS, workList, wzCases } from './domain-fixtures'

let L: Legacy
const lib = makeLib(loadData().entries)
beforeAll(() => {
  L = legacyWith()
})
afterAll(() => printStats('wz'))

describe('作品设定常量', () => {
  it('WZ_DEF / WZ_OPT / SUPP / MODE 与旧页面逐字段相等', () => {
    same('WZ_DEF', WZ_DEF, L.run('WZ_DEF'))
    same('WZ_OPT', WZ_OPT, L.run('WZ_OPT'))
    same('SUPP', SUPP, L.run('SUPP'))
    same('MODE', MODE, L.run('MODE'))
  })
})

describe('作品设定纯函数', () => {
  const cases = wzCases().map((c) => norm(c))
  it(`取值夹具 ${cases.length} 组`, () => {
    expect(cases.length).toBeGreaterThan(80)
  })

  it('langOf、wzEps、wzMins、wzScore、wzTitle、wzNeeds、wzSettings', () => {
    for (const W of cases) {
      same('langOf', langOf(W), callLegacy(L, 'langOf', W))
      same('wzEps', wzEps(W), callLegacy(L, 'wzEps', W))
      same('wzMins', wzMins(W), callLegacy(L, 'wzMins', W))
      same('wzScore', wzScore(W), callLegacy(L, 'wzScore', W))
      same('wzTitle', wzTitle(W), callLegacy(L, 'wzTitle', W))
      same('wzNeeds', wzNeeds(W), callLegacy(L, 'wzNeeds', W))
      same('wzSettings', wzSettings(W), callLegacy(L, 'wzSettings', W))
    }
  })

  it('wzPrompt（paste / auto / novel 三种模式，含撞题避开与补充设定）', () => {
    for (const W of cases) same('wzPrompt', wzPrompt(W, lib), callLegacy(L, 'wzPrompt', W))
    // 三种模式都出现过，且提示词库 2.5 / 1.1 / 2.12 的代码块确实被带进输出
    const out = (m: WzSettings['mode']) => wzPrompt({ ...WZ_DEF, mode: m, doc: 'D', pitch: 'P', novel: 'N' }, lib)
    expect(out('paste')).toContain('单集剧本格式（提示词库 2.5）')
    expect(lib('2.5').length).toBeGreaterThan(20)
    expect(out('paste')).toContain(lib('2.5'))
    expect(out('auto')).toContain(lib('1.1'))
    expect(out('novel')).toContain(lib('2.12'))
  })

  it('异常结构：缺字段、字段类型不对时新旧同样抛出同类异常或同样返回', () => {
    const bad: unknown[] = [
      {}, { mode: 'paste' }, { ...WZ_DEF, hooks: null }, { ...WZ_DEF, hooks: undefined }, { ...WZ_DEF, title: null }, { ...WZ_DEF, doc: null },
      { ...WZ_DEF, pitch: undefined }, { ...WZ_DEF, wpm: 'abc' }, { ...WZ_DEF, eps: '自定义', epsCustom: null }, { ...WZ_DEF, mode: 'weird' },
      { ...WZ_DEF, mode: 'auto', dup: { hits: null } }, { ...WZ_DEF, mode: 'auto', dup: {} }, { ...WZ_DEF, core: undefined },
    ]
    const fns: [string, (W: any) => unknown][] = [
      ['wzScore', (W) => wzScore(W)], ['wzTitle', (W) => wzTitle(W)], ['wzNeeds', (W) => wzNeeds(W)], ['wzSettings', (W) => wzSettings(W)],
      ['wzPrompt', (W) => wzPrompt(W, lib)], ['wzEps', (W) => wzEps(W)], ['wzMins', (W) => wzMins(W)], ['langOf', (W) => langOf(W)],
    ]
    for (const W of bad) for (const [name, f] of fns) same(name + '(异常)', outcome(() => f(W)), legacyOutcome(L, `${name}(${lit(W)})`))
  })
})

describe('wzDupCheck 撞题比对', () => {
  const lists: unknown[][] = [[], workList(), workList().slice(0, 2)]
  it('同一组设定、不同作品列表：命中、排序、截断 5 条、排除自己', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: 'm' + i, title: '重生嫡女' + i, W: { pitch: '重生嫡女打脸前夫', core: '读心', genre: '古装' }, time: i }))
    const all = [...lists, many, [...many, ...workList()]]
    const cs: WzSettings[] = [...wzCases().map((c) => norm(c)), norm({ ...WZ_DEF, id: 'w1', mode: 'auto' as const, pitch: '重生嫡女打脸', core: '系统', genre: '古装', adult: true }), norm({ ...WZ_DEF, mode: 'auto' as const, pitch: '重生嫡女打脸前夫', core: '读心', genre: '古装', adult: true })]
    for (const list of all) {
      setLegacyStore(L, 'works', list)
      for (const W of cs) same('wzDupCheck', wzDupCheck(W, liveWorks(norm(list) as any)), callLegacy(L, 'wzDupCheck', W))
    }
    // 命中确实存在，避免“全空相等”的假通过
    setLegacyStore(L, 'works', many)
    const r = wzDupCheck({ ...WZ_DEF, mode: 'auto', pitch: '重生嫡女打脸前夫', core: '读心', genre: '古装' }, liveWorks(many as any))
    expect(r.hits).toHaveLength(5)
    expect(r.n).toBe(9)
  })
  it('相似度阈值边界：3/20=0.15、3/19、5/20=0.25、6/20=0.3（同题材与异题材）', () => {
    const me = 'abcdefghijklmnopqrstu' // 21 个互不相同的字符 = 20 个二元组
    const mk = (id: string, shared: number, len: number, genre: string) => ({ id, title: '', W: { pitch: me.slice(0, shared + 1) + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, len - shared - 1), core: '', genre }, time: 1 })
    const list = [
      mk('t15s', 3, 21, '都市'), mk('t15d', 3, 21, '古装'), mk('t158s', 3, 20, '都市'), mk('t158d', 3, 20, '古装'),
      mk('t25s', 5, 21, '都市'), mk('t25d', 5, 21, '古装'), mk('t30s', 6, 21, '都市'), mk('t30d', 6, 21, '古装'), mk('t29d', 6, 22, '古装'),
    ]
    for (const genre of ['都市', '古装']) {
      const W = norm({ ...WZ_DEF, mode: 'auto' as const, pitch: me, genre })
      for (const sub of [list, list.slice(0, 4), list.slice(4)]) {
        setLegacyStore(L, 'works', sub)
        const fresh = wzDupCheck(W, liveWorks(norm(sub) as any))
        same('wzDupCheck(阈值)', fresh, callLegacy(L, 'wzDupCheck', W))
        expect(fresh.n).toBe(sub.length)
      }
    }
    // 同题材下 0.15 与 3/19 命中，异题材的同样相似度不命中
    const hit = wzDupCheck(norm({ ...WZ_DEF, mode: 'auto' as const, pitch: me, genre: '都市' }), list.slice(0, 4) as any)
    expect(hit.hits.map((h) => h.sim)).toEqual([3 / 19, 3 / 20])
    // 命中超过 5 条时只留相似度最高的 5 条
    expect(wzDupCheck(norm({ ...WZ_DEF, mode: 'auto' as const, pitch: me, genre: '都市' }), list as any).hits).toHaveLength(5)
  })
  it('作品列表为 null（旧 store 读不到）时 liveWorks 与旧页面一致', () => {
    setLegacyStore(L, 'works', undefined)
    same('liveWorks(无存储)', liveWorks(null), L.run('liveWorks()'))
    same('wzDupCheck(无存储)', wzDupCheck(WZ_DEF, liveWorks(null)), callLegacy(L, 'wzDupCheck', WZ_DEF))
  })
})

describe('wzRollTitle 取名（固定随机序列）', () => {
  it(`${PITCHES.length} 句卖点 × ${RNG_SEQS.length} 条随机序列 × 是否排除上一个`, () => {
    const expr = `(()=>{const out=[];for(const seq of ${JSON.stringify(RNG_SEQS)}){let i=0;Math.random=()=>seq[i++%seq.length];
      for(const p of ${JSON.stringify(PITCHES)}){const W={pitch:p};const a=wzRollTitle(W);out.push(a);out.push(wzRollTitle(W,a));out.push(wzRollTitle({}));}}return out})()`
    const old = L.run<unknown[]>(expr)
    const fresh: unknown[] = []
    for (const seq of RNG_SEQS) {
      const rng = seqRng(seq)
      for (const p of PITCHES) {
        const W = { pitch: p }
        const a = wzRollTitle(W, undefined, rng)
        fresh.push(a, wzRollTitle(W, a, rng), wzRollTitle({}, undefined, rng))
      }
    }
    sameAll('wzRollTitle', fresh, old)
  })
  it('随机序列的固定方式：旧页面 vm 内替换 Math.random，新实现传入同一循环序列的 rng', () => {
    seedLegacyRandom(L, [0.25, 0.75])
    const rng = seqRng([0.25, 0.75])
    same('wzRollTitle(固定序列)', wzRollTitle({ pitch: '她是千金' }, undefined, rng), callLegacy(L, 'wzRollTitle', { pitch: '她是千金' }))
    same('wzRollTitle(固定序列)', wzRollTitle({ pitch: '她是千金' }, undefined, rng), callLegacy(L, 'wzRollTitle', { pitch: '她是千金' }))
  })
  it('异常结构：缺 pitch / pitch 非字符串', () => {
    for (const W of [undefined, null, {}, { pitch: 5 }, { pitch: ['千金'] }, { pitch: null }]) {
      seedLegacyRandom(L, [0.4])
      same('wzRollTitle(异常)', outcome(() => wzRollTitle(W as any, undefined, seqRng([0.4]))), legacyOutcome(L, `wzRollTitle(${lit(W)})`))
    }
  })
})

describe('wzGuess 设定猜测', () => {
  it('卖点句：每个分支', () => {
    const texts = [...PITCHES, '男男', '耽美', 'bl', 'Gl', '百合', '婆婆', '闺蜜', '女主', '她', '他', '少年', '废柴', '老板', '假', '真', '身份', '身分', '翻盘', '嘲笑', '先婚', '契约', '闪婚', '前任', '宠']
    for (const t of texts) same('wzGuess', wzGuess(t), callLegacy(L, 'wzGuess', t))
  })
  it('异常输入：undefined、null、数字', () => {
    for (const t of [undefined, null, 123, '']) same('wzGuess(异常)', outcome(() => wzGuess(t as any)), legacyOutcome(L, `wzGuess(${lit(t)})`))
  })
})

describe('wzBuildWork（旧 wzSaveWork）与 wzSeedAssets', () => {
  const NOW = 1_764_000_000_123
  const base = (p: Partial<WzSettings>) => norm({ ...WZ_DEF, mode: 'auto', adult: true, ...p }) as WzSettings
  const Ws = [
    base({ title: '有标题', pitch: '一句话' }),
    base({ title: '', pitch: '她是千金，重生' }),
    base({ title: '  ', pitch: '' }),
    base({ title: '', pitch: '', mode: 'paste', doc: '《文档里的名》开头' }),
    base({ id: 'w1', title: '改名', pitch: '重生嫡女打脸' }),
    base({ id: 'w-new', title: '指定编号', pitch: 'x' }),
    base({ title: 'T', dup: { n: 1, hits: [] }, guessed: { a: 1 } as any, style: '真人写实', ratio: '9:16', heat: '高尺度', depth: '重度', qxRole: '逆袭者', qxMode: '甜宠' }),
  ]
  it('新旧对照：作品项、写回列表、旧实现回写的 W.id', () => {
    const lists = [[], workList()]
    for (const list of lists) {
      for (const W of Ws) {
        for (const kind of [undefined, 'simple', 'vibe'] as const) {
          for (const seq of [[0], [0.5], [0.97]]) {
            setLegacyStore(L, 'works', list)
            fixLegacyNow(L, NOW)
            seedLegacyRandom(L, seq)
            const old = L.run(`(()=>{const W=${lit(W)};const item=wzSaveWork(W,${lit(kind)});return {item,wid:W.id,works:store('works')}})()`)
            const { list: next, item } = wzBuildWork(norm(list) as any, W, kind, NOW, seqRng(seq))
            same('wzBuildWork', { item, wid: item.id, works: next }, old)
          }
        }
      }
    }
  })
  it('不改入参：原列表与设定对象保持不变', () => {
    const list = norm(workList()) as any[]
    const W = base({ id: 'w1', title: 'x' })
    const before = JSON.stringify([list, W])
    wzBuildWork(list, W, undefined, NOW)
    expect(JSON.stringify([list, W])).toBe(before)
  })
  it('wzSeedAssets：资产库种子与提示文案', () => {
    L.run('(toast=function(m){__toast=m},1)')
    const pairs = ['男女', '男男（BL）', '女女（GL）', '', undefined]
    const cs: WzSettings[] = []
    for (const pair of pairs) for (const aud of ['女性向', '男性向', '男同志向']) {
      cs.push(base({ pair: pair as any, aud, hero: '主角设定', rival: '对手设定', world: '世界观', pitch: '卖点', core: '核心' }))
      cs.push(base({ pair: pair as any, aud, hero: '', rival: '', world: '', pitch: '', core: '', genre: '职场' }))
      cs.push(base({ pair: pair as any, aud, hero: ' ', rival: ' ', world: ' ', pitch: ' ', core: '设定', genre: '' }))
    }
    for (const W of cs) {
      const item = { id: 'wX', title: '某剧' }
      const old = L.run<any>(`(()=>{__toast=null;wzSeedAssets(${lit(W)},${lit(item)});return {seed:store('assetSeed'),toast:__toast}})()`)
      const { seed, leads } = wzSeedAssets(W, item)
      same('wzSeedAssets', { seed, toast: `已配好${leads.join('、')}，从第 1 个开始` }, old)
    }
  })
})
