import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyGenPatch, genParse, genReq } from '../../src/domain/gen'
import type { GenData, WzSettings } from '../../src/domain/types'
import { WZ_DEF } from '../../src/domain/wz'
import {
  cardText, DEPTH, DEPTH_TIME, depthOf, HEAT, heatOf, parseJSON, YQ_CPM, YQ_HEAT, YQ_HOT, YQ_PLAN, YQ_RULES, YQ_SHOOT, YQ_TRAPS, YQ_WRITE, yqBatchPrompt, yqCardPrompt, yqCheckPrompt,
  yqEpPrompt, yqFixPrompt, yqFormat, yqNewNames, yqPlanPrompt, yqSceneCount, yqScenePrompt,
} from '../../src/domain/yq'
import { loadData } from './data'
import type { Legacy } from './legacy'
import { callLegacy, fixLegacyNow, legacyOutcome, legacyWith, lit, norm, outcome, printStats, same, setLegacyStore } from './domain-helpers'
import { wzCases, workList } from './domain-fixtures'

let L: Legacy
beforeAll(() => {
  loadData()
  L = legacyWith()
})
afterAll(() => printStats('yq'))

const W0 = (p: Partial<WzSettings> = {}): WzSettings =>
  norm({ ...WZ_DEF, mode: 'auto' as const, pitch: '  她是千金，重生  ', hooks: ['打脸', '逆袭'], core: ' 点子 ', title: ' 剧名 ', qxRole: '逆袭者', qxMode: '甜宠', adult: true, ...p })

const HEATS = [...HEAT, undefined, '', '其他', '正常 ']
const DEPTHS = [...DEPTH, undefined, '', '中度 ', '未知']
/** 尺度 × 思考深度 × 每集时长的设定组合。 */
function yqWs(): WzSettings[] {
  const out: WzSettings[] = []
  for (const heat of HEATS) for (const depth of DEPTHS) out.push(W0({ heat: heat as string, depth: depth as string }))
  for (const mins of [1, 2, 3, 5, 8, 10, '自定义'] as const) for (const minsCustom of ['', '0', '4', 'x']) out.push(W0({ mins, minsCustom, heat: '正常', depth: '重度' }))
  out.push(W0({ qxRole: '', qxMode: '', hooks: [], core: '', title: '', pitch: '' }), W0({ hooks: ['x'], depth: '中度', heat: '高尺度' }))
  return out
}

const CARDS: any[] = [
  undefined, null, {}, { rules: {} }, { cast: [] }, { mystery: '谜底' },
  { mystery: '谜底', rules: { power: 'p', stakes: 's', spaces: 'sp', evidence: 'e', limit: 'l', address: 'a' }, cast: [{ name: '甲', role: '女主', age: 25, look: 'lk', want: 'w', flaw: 'f', voice: 'v' }, { name: '乙', role: '男主' }], title: '牌名', logline: '梗概' },
  { cast: [{ name: '丙', role: '配角', age: 0 }, { name: '丁', role: '反派', age: '30' }] },
]

function datas(): GenData[] {
  const outline = [
    { title: '开场', event: '事件一', hook: '钩子一', body: 'b1' }, { title: '第二', event: '事件二', hook: '钩子二', body: 'b2' },
    { title: '第三', event: '事件三', hook: '', body: 'b3' }, { title: '第四', event: '事件四', hook: '钩子四' }, { title: '终', event: '收尾', hook: '无' },
  ]
  const cast = [{ name: '甲', role: '女主', bio: '25 岁，千金', look: 'l' }, { name: '乙', role: '男主', bio: '', look: '' }, { name: '丙', role: '反派', bio: '30 岁，对手' }]
  const long = '长'.repeat(2000) + '结尾甲'
  return [
    { title: '剧', logline: '一句话', outline, eps: [], cast },
    { title: '剧', logline: '一句话', outline, eps: ['第一集含甲和乙', long, '第三集', null, undefined], cast },
    { title: '', logline: '', outline: outline.slice(0, 1), eps: [], cast: [] },
    { title: '剧', logline: '一句话', outline, eps: ['甲'], cast, card: CARDS[6] },
    { title: '剧', logline: '一句话', outline, eps: ['甲乙丙', 'x'], cast, card: CARDS[3] },
  ].map((x) => norm(x)) as GenData[]
}

describe('常量与取值', () => {
  it('YQ_*、HEAT、DEPTH 等常量与旧页面逐字相等', () => {
    same('YQ_PLAN', YQ_PLAN, L.run('YQ_PLAN'))
    same('YQ_WRITE', YQ_WRITE, L.run('YQ_WRITE'))
    same('YQ_HOT', YQ_HOT, L.run('YQ_HOT'))
    same('YQ_RULES', YQ_RULES, L.run('YQ_RULES'))
    same('YQ_SHOOT', YQ_SHOOT, L.run('YQ_SHOOT'))
    same('YQ_TRAPS', YQ_TRAPS, L.run('YQ_TRAPS'))
    same('YQ_CPM', YQ_CPM, L.run('YQ_CPM'))
    same('HEAT', HEAT, L.run('HEAT'))
    same('YQ_HEAT', YQ_HEAT, L.run('YQ_HEAT'))
    same('DEPTH', DEPTH, L.run('DEPTH'))
    same('DEPTH_TIME', DEPTH_TIME, L.run('DEPTH_TIME'))
  })
  it('heatOf / depthOf', () => {
    for (const heat of [...HEATS, null, 0, 1, ['正常']]) same('heatOf', heatOf({ heat } as any), callLegacy(L, 'heatOf', { heat }))
    for (const depth of [...DEPTHS, null, 0, 1]) same('depthOf', depthOf({ depth } as any), callLegacy(L, 'depthOf', { depth }))
    same('heatOf(无)', heatOf({}), callLegacy(L, 'heatOf', {}))
    same('depthOf(无)', depthOf({}), callLegacy(L, 'depthOf', {}))
  })
  it('yqFormat、yqSceneCount', () => {
    for (let i = 0; i < 100; i += 7) same('yqFormat', yqFormat(i), callLegacy(L, 'yqFormat', i))
    for (const W of yqWs()) same('yqSceneCount', yqSceneCount(W), callLegacy(L, 'yqSceneCount', W))
  })
})

describe('cardText / yqCardPrompt / yqPlanPrompt', () => {
  it('cardText：策划卡各种缺省', () => {
    for (const c of CARDS) same('cardText', cardText(c), callLegacy(L, 'cardText', c))
  })
  it('yqCardPrompt', () => {
    for (const W of yqWs()) for (const n of [1, 2, 10, 80]) same('yqCardPrompt', outcome(() => yqCardPrompt(W, n)), legacyOutcome(L, `yqCardPrompt(${lit(W)},${n})`))
  })
  it('yqPlanPrompt（带 / 不带策划卡）', () => {
    for (const W of yqWs()) for (const card of CARDS) same('yqPlanPrompt', outcome(() => yqPlanPrompt(W, 10, card)), legacyOutcome(L, `yqPlanPrompt(${lit(W)},10,${lit(card)})`))
  })
  it('异常结构：缺字段', () => {
    for (const W of [{}, { hooks: null }, { ...W0(), hooks: undefined }, { ...W0(), pitch: undefined, core: undefined, title: undefined }]) {
      same('yqCardPrompt(异常)', outcome(() => yqCardPrompt(W as any, 3)), legacyOutcome(L, `yqCardPrompt(${lit(W)},3)`))
      same('yqPlanPrompt(异常)', outcome(() => yqPlanPrompt(W as any, 3, null)), legacyOutcome(L, `yqPlanPrompt(${lit(W)},3,null)`))
    }
  })
})

describe('分集提示词', () => {
  it('yqNewNames / yqEpPrompt / yqCheckPrompt / yqFixPrompt：各集 × 设定 × 策划卡', () => {
    const ws = yqWs().filter((_, k) => k % 3 === 0)
    for (const d of datas()) {
      for (let i = 0; i < d.outline.length; i++) {
        same('yqNewNames', yqNewNames(d, i), callLegacy(L, 'yqNewNames', d, i))
        for (const W of ws) {
          same('yqEpPrompt', outcome(() => yqEpPrompt(d, W, i)), legacyOutcome(L, `yqEpPrompt(${lit(d)},${lit(W)},${i})`))
          same('yqCheckPrompt', outcome(() => yqCheckPrompt(d, W, i, '剧本正文')), legacyOutcome(L, `yqCheckPrompt(${lit(d)},${lit(W)},${i},'剧本正文')`))
        }
      }
    }
    const d = datas()[3]
    for (const W of ws) {
      for (const issues of [[], [{ where: '场1', problem: 'p', fix: 'f' }], [{ problem: 'p' }, { where: 'w' }, {}]]) {
        same('yqFixPrompt', outcome(() => yqFixPrompt(d, W, 0, '原剧本', issues)), legacyOutcome(L, `yqFixPrompt(${lit(d)},${lit(W)},0,'原剧本',${lit(issues)})`))
      }
    }
  })
  it('yqEpPrompt：深度不同时附加可拍性与常识排雷；上一集结尾截取长度随深度变化', () => {
    const d = datas()[1]
    const light = yqEpPrompt(d, W0({ depth: '轻度' }), 2)
    const heavy = yqEpPrompt(d, W0({ depth: '重度' }), 2)
    expect(light).not.toContain(YQ_SHOOT)
    expect(heavy).toContain(YQ_SHOOT)
    expect(heavy.length).toBeGreaterThan(light.length)
  })
  it('yqScenePrompt / yqBatchPrompt', () => {
    const plan = [
      { time: '日', place: '客厅', io: '内', people: ['甲', '乙'], card: '', beat: '争吵' }, { time: '夜', place: '街头', io: '外', people: [], card: '次日夜', beat: '追逐' },
      { time: '黄昏', place: '天台', io: '外', beat: '对峙' }, { time: '凌晨', place: '医院', io: '内', people: ['丙'], card: '三天后', beat: '醒来' }, { time: '日', place: '客厅', io: '内', people: ['甲'], beat: '收尾' },
    ]
    const ws = yqWs().filter((_, k) => k % 4 === 1)
    for (const d of datas()) {
      for (const i of [0, 1, d.outline.length - 1]) {
        for (const W of ws) {
          for (const n of [3, 5, 15]) same('yqScenePrompt', outcome(() => yqScenePrompt(d, W, i, n)), legacyOutcome(L, `yqScenePrompt(${lit(d)},${lit(W)},${i},${n})`))
          for (const [from, to] of [[0, 2], [2, 4], [4, 5], [0, 5], [3, 3]]) for (const tail of ['', '（上一场 1-2：争吵）']) {
            same('yqBatchPrompt', outcome(() => yqBatchPrompt(d, W, i, plan, from, to, tail)), legacyOutcome(L, `yqBatchPrompt(${lit(d)},${lit(W)},${i},${lit(plan)},${from},${to},${lit(tail)})`))
          }
        }
      }
    }
  })
  it('异常结构：集序越界、缺大纲', () => {
    const d = datas()[0]
    for (const i of [-1, 5, 99]) {
      same('yqEpPrompt(异常)', outcome(() => yqEpPrompt(d, W0(), i)), legacyOutcome(L, `yqEpPrompt(${lit(d)},${lit(W0())},${i})`))
      same('yqScenePrompt(异常)', outcome(() => yqScenePrompt(d, W0(), i, 3)), legacyOutcome(L, `yqScenePrompt(${lit(d)},${lit(W0())},${i},3)`))
    }
    const bad = { title: 't', logline: 'l', cast: [] }
    same('yqEpPrompt(异常)', outcome(() => yqEpPrompt(bad as any, W0(), 0)), legacyOutcome(L, `yqEpPrompt(${lit(bad)},${lit(W0())},0)`))
    same('yqBatchPrompt(异常)', outcome(() => yqBatchPrompt(d, W0(), 0, [], 0, 1, '')), legacyOutcome(L, `yqBatchPrompt(${lit(d)},${lit(W0())},0,[],0,1,'')`))
  })
})

describe('parseJSON', () => {
  it('夹带说明文字、嵌套花括号、代码块、非法输入', () => {
    const texts = [
      '{"a":1}', '前言 {"a":{"b":[1,2,{"c":3}]}} 后记', '```json\n{"issues":[]}\n```', '{"a":"含 } 括号"}', '多个 {"a":1} 对象 {"b":2}', '没有括号', '', '{', '}', '}{', '{不是 json}',
      '{"a":1}}', '  \n{"episodes":[{"title":"一"}]}\n', '{"a":"中文","b":null,"c":true,"d":1.5e3}', 'x{"a":1',
    ]
    for (const t of texts) same('parseJSON', outcome(() => parseJSON(t)), legacyOutcome(L, `parseJSON(${lit(t)})`))
    for (const t of [undefined, null, 5]) same('parseJSON(异常)', outcome(() => parseJSON(t as any)), legacyOutcome(L, `parseJSON(${lit(t)})`))
  })
})

describe('genReq / genParse / applyGenPatch', () => {
  it('genReq：作品设定转写作请求', () => {
    const cs: unknown[] = [...wzCases(), ...yqWs(), {}, undefined, { hooks: null }, { eps: 200, mins: 20 }, { eps: '自定义', epsCustom: '1', mins: '自定义', minsCustom: '0.5' }, { eps: '自定义', epsCustom: '999', mins: '自定义', minsCustom: '999' }, { mins: 0 }, { qxRole: '角色', hooks: ['', null, 'x'] }]
    for (const W of cs) same('genReq', outcome(() => genReq(norm(W) as any)), legacyOutcome(L, `genReq(${lit(W)})`))
  })
  it('genParse：云端结果各种形状', () => {
    const rs: unknown[] = [
      {}, { x_gateway: {} }, { x_gateway: { framework: { title: 'F', logline: 'L', episodes: [{ title: '一', event: 'e', hook: 'h' }, { event: 'e2' }, {}] }, episodes: [{ ep: 2, text: 'B' }, { text: 'A' }, { ep: 5 }], cards: '**甲（女主）**\n人设一\n\n**乙(男主)**\n人设二\n**丙（反派）**\n末尾' } },
      { x_gateway: { title: 'X', cards: 5 } }, { x_gateway: { framework: { episodes: null }, episodes: null, cards: null } }, { x_gateway: { cards: '**无括号**\n文字' } },
      { x_gateway: { episodes: [{ ep: 3, text: 'c' }] } },
    ]
    for (const r of rs) same('genParse', outcome(() => genParse(r as any)), legacyOutcome(L, `genParse(${lit(r)})`))
    for (const r of [undefined, null]) same('genParse(异常)', outcome(() => genParse(r as any)), legacyOutcome(L, `genParse(${lit(r)})`))
  })
  it('applyGenPatch（旧 updateGen）：合并、清空、标题回填、作品不存在', () => {
    const NOW = 1_764_000_000_000
    fixLegacyNow(L, NOW)
    const base = workList().map((w, i) => (i === 0 ? { ...w, gen: { engine: 'yq', status: 'outline', at: 1, note: 'n' } } : w))
    const lists = [base, [], [{ id: 'dup', title: 'a', W: { title: '' } }, { id: 'dup', title: 'b', W: { title: '' } }], [{ id: 'nw', title: 'x', W: undefined }], [{ id: 'sp', title: '旧', W: { title: '   ' } }, { id: 'nm', title: '旧', W: { title: '有名' } }]]
    const patches: unknown[] = [null, {}, { status: 'writing' }, { note: null }, { data: { title: '模型剧名', outline: [], eps: [], cast: [] } }, { data: { title: '', outline: [] } }, { data: null }, { status: 'done', data: { title: ' 带空白 ' } }]
    for (const list of lists) for (const wid of ['w1', 'w3', 'dup', 'nw', 'sp', 'nm', 'none', '']) for (const patch of patches) {
      setLegacyStore(L, 'works', list)
      const old = L.run(`(()=>{const w=updateGen(${lit(wid)},${lit(patch)});return {w,works:store('works')}})()`) as { w: unknown; works: unknown }
      const r = applyGenPatch(norm(list) as any, wid, patch as any)
      same('applyGenPatch', { w: r ? r.work : null, works: r ? r.list : list }, { w: old.w ?? null, works: old.works })
    }
  })
  it('applyGenPatch 不改入参', () => {
    const list = norm(workList()) as any[]
    const before = JSON.stringify(list)
    applyGenPatch(list, 'w1', { status: 'writing', data: { title: 'T' } as any })
    expect(JSON.stringify(list)).toBe(before)
  })
})
