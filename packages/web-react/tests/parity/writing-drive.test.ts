import { afterAll, describe, expect, it, vi } from 'vitest'
import { genReq } from '../../src/domain/gen'
import type { Work, WzSettings } from '../../src/domain/types'
import { vibeSx } from '../../src/domain/vibe'
import { get, set } from '../../src/lib/storage'
import {
  type FreshEngine, freshEngine, type LegacyEngine, legacyEngine, normTrace, type Reply, type Responder, type RecStorage, settle, type StoryOpt, storyServer, T0, type TraceEvent, watchRefresh,
} from './writing-harness'

/*
 * 逐集写作流程的新旧对照：旧 yqDrive（含 yqWriteEpisode）在 vm 里实跑，新 driveYq / enterWork 等入口在同样的初始存储、
 * 同一串桩回应、同样的虚拟时钟下运行；比较整串事件（每个 fetch 的 URL、头、请求体原文，每次 pl.works / pl.auth 写入的原文，
 * 引擎定时器，yqRefresh 重画、登录、提示、云端推送事件，均带时刻）与最终 localStorage。
 * pl.lastVibe 不比较写入次数（旧作品页每次重画都写一次同样的值），只比较最终值。
 */

const AUTH = { token: 'tok.1.sig', user: { uid: 'u1', phone: '13800138000', role: 'free', points: 30, cap: 40 } }
// 新旧两边都在 vm 与虚拟时钟里整段实跑，单个用例的比较次数多，放宽超时。
vi.setConfig({ testTimeout: 120000 })
let compared = 0
afterAll(() => console.log(`[parity writing-drive] ${compared} 个场景的整串事件新旧对照`))

const baseW = (p: Partial<WzSettings> = {}): Partial<WzSettings> => ({
  mode: 'auto', pitch: '沈星重生回到订婚宴', aud: '女性向', pair: '男女', genre: '都市', hooks: ['打脸', '逆袭'], title: '', eps: 2, mins: 1,
  depth: '轻度', heat: '正常', qxRole: '复仇者', qxMode: '爽文', core: '她能看见合同里的陷阱', ...p,
})
const outlineGen = (W: Partial<WzSettings>, extra: Record<string, unknown> = {}) => ({ engine: 'yq', status: 'outline', at: T0 - 5000, req: genReq(W), data: null, err: null, ...extra })
const work = (W: Partial<WzSettings>, gen: unknown, extra: Record<string, unknown> = {}): Work =>
  ({ id: 'w1', title: '旧作品名', kind: 'vibe', W, time: T0 - 9000, vname: '沈星', seed: 7, gen, ...extra }) as Work

interface Mutation {
  at: number
  fn: (s: RecStorage) => void
}
interface Scenario {
  storage: Record<string, unknown>
  server?: () => Responder
  mutate?: Mutation[]
}

const editWork = (fn: (w: any, list: any[]) => void) => (s: RecStorage) => {
  const list = JSON.parse(s.getItem('pl.works') as string)
  fn(list.find((x: any) => x.id === 'w1'), list)
  s.setItem('pl.works', JSON.stringify(list.filter(Boolean)))
}

function sides(sc: Scenario): [LegacyEngine, FreshEngine] {
  const L = legacyEngine({ storage: sc.storage, server: sc.server })
  for (const m of sc.mutate || []) L.clock.schedule(() => m.fn(L.storage), m.at)
  const F = freshEngine({ storage: sc.storage, server: sc.server })
  for (const m of sc.mutate || []) F.clock.schedule(() => m.fn(F.storage), m.at)
  watchRefresh(F, 'w1')
  return [L, F]
}

const noPhase = (ev: TraceEvent[]) => ev.filter((e) => !(e.k === 'ev' && e.name === 'phase'))
/** sameClock：结束时刻也相同（进入作品页的用例不比：旧等待页的界面计时器会把虚拟时钟多推一秒）。 */
function expectSame(L: LegacyEngine, F: FreshEngine, sameClock = true) {
  compared++
  expect(normTrace(noPhase(F.trace.events))).toEqual(normTrace(noPhase(L.trace.events)))
  expect(F.storage.dump()).toEqual(L.storage.dump())
  if (sameClock) expect(F.clock.now).toBe(L.clock.now)
}

/** 旧 yqDrive 与新 driveYq 从同一状态跑到结束。 */
async function compareDrive(sc: Scenario) {
  const [L, F] = sides(sc)
  expect(await settle(L, L.drive('w1') as Promise<unknown>)).toBe(true)
  expect(await settle(F, F.engine.driveYq('w1'))).toBe(true)
  expectSame(L, F)
  expect(F.engine.isRunning('w1')).toBe(false)
  expect(F.clock.pending()).toBe(0)
  F.dispose()
  return { L, F, work: () => (JSON.parse(F.storage.getItem('pl.works') as string) as Work[]).find((x) => x.id === 'w1') }
}

/** 新页面进入作品页前要做的事（旧 viewVibeScript 第 2966–2967 行），由作品页负责；这里照做以便与旧页面整段比较。 */
function prelude(F: FreshEngine, wid: string) {
  const list = get('works') || []
  const w = list.find((x) => x.id === wid)
  if (!w) return
  set('lastVibe', w.id)
  if (!w.vname || !w.seed) {
    const s0 = vibeSx(w, F.rng)
    w.vname = s0.name
    w.seed = w.seed || Math.floor(F.rng() * 1e9) + 1
    set('works', list)
  }
}

const gens = (s: RecStorage) => (JSON.parse(s.getItem('pl.works') as string) as Work[]).map((w) => w.gen)

describe('driveYq 与旧 yqDrive：设定矩阵（思考深度 × 尺度 × 每集时长）', () => {
  const DEPTH = ['轻度', '中度', '重度', undefined]
  const HEAT = ['点到为止', '正常', '高尺度']
  const MINS: Partial<WzSettings>[] = [{ mins: 1 }, { mins: 2 }, { mins: 3 }, { mins: 5 }, { mins: '自定义', minsCustom: '4' }]
  for (const depth of DEPTH) for (const heat of HEAT) {
    it(`${depth ?? '未设'} × ${heat}：5 种时长`, async () => {
      for (const m of MINS) {
        const W = baseW({ depth, heat, ...m })
        const got = await compareDrive({ storage: { auth: AUTH, tjCode: 'c', works: [work(W, outlineGen(W))] } })
        expect(got.work()!.gen!.status).toBe('done')
      }
    })
  }
})

describe('driveYq 与旧 yqDrive：流程分支', () => {
  const st = (W: Partial<WzSettings>, gen: unknown = outlineGen(W), extra: Record<string, unknown> = {}) => ({ auth: AUTH, works: [work(W, gen, extra)] })
  const srv = (o: StoryOpt) => () => storyServer(o)

  it('重度：自检有问题就修，修稿短于原稿 6 成弃用；短集与分场两种写法', async () => {
    for (const mins of [1, 5]) for (const fixRatio of [1, 0.5, 0.61, 0.6]) {
      const W = baseW({ depth: '重度', mins })
      const got = await compareDrive({ storage: st(W), server: srv({ issues: (c) => (c % 2 ? 2 : 0), fixRatio }) })
      expect(got.work()!.gen!.status).toBe('done')
      if (mins === 1) expect(got.work()!.gen!.data!.fixed).toEqual(fixRatio === 1 ? [2, 0] : [0, 0])
    }
  })
  it('非流式整段回应、大纲不带 cast、已有策划卡（不再写卡）', async () => {
    const W = baseW({ depth: '重度', mins: 3 })
    await compareDrive({ storage: st(W), server: srv({ plain: true }) })
    await compareDrive({ storage: st(W), server: srv({ noCast: true }) })
    await compareDrive({ storage: st(baseW({ noCast: true } as any)), server: srv({ noCast: true }) })
    const card = { title: '既定卡', logline: '既定梗概', cast: [{ name: '甲', role: '女主', age: 30, want: '钱', voice: '冷' }] }
    const { L } = await compareDrive({ storage: st(W, outlineGen(W, { card })) })
    expect(L.trace.of('fetch').some((f) => String((f.init as any).body).includes('总策划'))).toBe(false)
    await compareDrive({ storage: st(W, outlineGen(W, { card: { cast: [] } })) })
  })
  it('剧名：作品设定没有剧名时用模型的剧名（去空白），有就保留；集数夹在 2–80', async () => {
    const a = await compareDrive({ storage: st(baseW()) })
    expect(a.work()!.title).toBe('剧名甲')
    const b = await compareDrive({ storage: st(baseW({ title: '自己取的' })) })
    expect(b.work()!.title).toBe('旧作品名')
    for (const e of [{ eps: '自定义', epsCustom: '1' }, { eps: '自定义', epsCustom: 'x' }, { eps: 0 }, { eps: 3 }] as Partial<WzSettings>[]) {
      await compareDrive({ storage: st(baseW(e)) })
    }
    const c = await compareDrive({ storage: st(baseW({ eps: '自定义', epsCustom: '95' } as Partial<WzSettings>)) })
    expect(c.work()!.gen!.data!.outline).toHaveLength(80)
  }, 60000)
  it('续写：已写好的集跳过；已排好的分场与写好的批次保留，只补没写成的批次', async () => {
    const W = baseW({ mins: 5, depth: '中度' })
    const done = await compareDrive({ storage: st(W) })
    const data = done.work()!.gen!.data!
    const half = { ...data, eps: [data.eps[0], null] }
    await compareDrive({ storage: st(W, { ...outlineGen(W), status: 'writing', data: half }) })
    const plan = Array.from({ length: 9 }, (_, k) => ({ time: '夜', place: `P${k}`, io: '内', people: ['甲'], beat: `既定第${k + 1}场` }))
    for (const parts of [['批0', null, '批2'], [], ['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd', 'e'], [null, null, null, null, '末批']]) {
      const { L } = await compareDrive({ storage: st(W, { ...outlineGen(W), status: 'writing', data: { ...half, part: { 1: { plan, parts, fixed: 1 } } } }) })
      const batchCalls = L.trace.of('fetch').filter((f) => String((f.init as any).body).includes('集的第 '))
      expect(batchCalls).toHaveLength(5 - parts.filter(Boolean).length)
    }
    await compareDrive({ storage: st(W, { ...outlineGen(W), status: 'writing', data: { ...half, part: { 1: { plan: [], parts: ['x'] } } } }) })
    // 上一集很长：分场与第一批只带上一集最后 500 字，短集按思考深度带 600 / 1200 字
    const long = Array.from({ length: 1500 }, (_, k) => '甲乙丙丁戊己庚辛壬癸'[k % 10]).join('') + '结尾'
    for (const W2 of [W, baseW({ mins: 1 }), baseW({ mins: 1, depth: '中度' }), baseW({ mins: 3, depth: '重度' })]) {
      const { L } = await compareDrive({ storage: st(W2, { ...outlineGen(W2), status: 'writing', data: { ...half, eps: [long, null] } }) })
      const first = L.trace.of('fetch').map((f) => JSON.parse((f.init as any).body).messages[0].content as string).find((c) => c.includes('甲乙丙'))!
      expect(first).toContain(long.slice(-400))
    }
  })
  it('分场少于要求、多于要求、为空（scene plan empty）；大纲为空（outline empty）；回应不是 JSON', async () => {
    const W = baseW({ mins: 5 })
    for (const scenes of [1, 2, 3, 20, -1]) await compareDrive({ storage: st(W), server: srv({ scenes }) })
    const empty = await compareDrive({ storage: st(W), server: srv({ scenes: -1 }) })
    expect(empty.work()!.gen).toMatchObject({ status: 'error', err: 'scene plan empty' })
    const noEp = await compareDrive({ storage: st(W), server: srv({ episodes: 0 }) })
    expect(noEp.work()!.gen).toMatchObject({ status: 'error', err: 'outline empty' })
    const bad = (kind: string, text: string): Responder => {
      const base = storyServer()
      return (req) => ((req.prompt.startsWith(kind) ? { json: { choices: [{ message: { content: text } }] } } : base(req)) as Reply)
    }
    for (const t of ['没有大括号', '{坏的}', '{"a":1} 多余 }']) {
      await compareDrive({ storage: st(W), server: () => bad('你是短剧总编剧', t) })
      await compareDrive({ storage: st(baseW({ depth: '重度' })), server: () => bad('你是短剧总策划', t) })
      await compareDrive({ storage: st(W), server: () => bad('你是短剧编剧。为', t) })
    }
  })
})

/** 第 n 次（全局序号）某类调用改用指定回应。 */
function failAt(match: (kind: string, n: number) => boolean, reply: Reply | ((n: number) => Reply), base: StoryOpt = {}): () => Responder {
  return () => {
    const kinds: Record<string, number> = {}
    return storyServer({
      ...base,
      override: (_req, kind) => {
        const c = (kinds[kind] = (kinds[kind] ?? 0) + 1)
        return match(kind, c) ? (typeof reply === 'function' ? reply(c) : reply) : undefined
      },
    })
  }
}
const http = (status: number, error = `错误 ${status}`): Reply => ({ status, json: { error }, headers: { 'X-Points': '5' } })

describe('driveYq 与旧 yqDrive：失败、重试与积分', () => {
  const st = (W: Partial<WzSettings>, auth: unknown = AUTH) => ({ ...(auth ? { auth } : {}), works: [work(W, outlineGen(W))] })
  const W5 = baseW({ mins: 5 })
  const W1 = baseW({ mins: 1 })
  const WH = baseW({ mins: 5, depth: '重度' })

  it('忙线重试：大纲阶段写 note 不重画；写作阶段写 note 并重画；成功后 note 清空', async () => {
    for (const W of [W1, W5, WH]) for (const kind of ['plan', 'card', 'ep', 'batch', 'scene', 'check', 'fix']) for (const k of [1, 2, 3]) {
      const { L } = await compareDrive({ storage: st(W), server: failAt((kd, c) => kd === kind && c <= k, () => http(429), { issues: () => 1 }) })
      void L
    }
    const { L } = await compareDrive({ storage: st(W1), server: failAt((kd, c) => kd === 'ep' && c <= 2, () => http(503)) })
    const notes = L.trace.of('write').filter((w) => w.key === 'pl.works').map((w) => JSON.parse(w.raw)[0].gen.note).filter((n) => n !== undefined)
    expect(notes).toContain('云端忙线，5 秒后第 1 次重试…')
    expect(notes).toContain('云端忙线，15 秒后第 2 次重试…')
  }, 120000)
  it('重试用尽：status error，err 为最后一次的错误；已写好的集保留', async () => {
    for (const W of [W1, W5, WH]) for (const kind of ['plan', 'card', 'ep', 'batch', 'scene']) for (const nth of [1, 2]) {
      const r = await compareDrive({ storage: st(W), server: failAt((kd, c) => kd === kind && c >= nth && c < nth + 4, (c) => (c % 2 ? http(500) : { net: true })) })
      void r
    }
  }, 120000)
  it('不可重试错误、401（登出 + 弹登录）、402（提示）出现在各个阶段', async () => {
    for (const W of [W1, W5, WH]) for (const kind of ['plan', 'card', 'ep', 'batch', 'scene', 'check', 'fix']) for (const status of [400, 401, 402, 403]) for (const nth of [1, 3]) {
      await compareDrive({ storage: st(W), server: failAt((kd, c) => kd === kind && c === nth, () => http(status), { issues: () => 1 }) })
    }
    const a = await compareDrive({ storage: st(W5), server: failAt((kd, c) => kd === 'batch' && c === 2, () => http(401)) })
    expect(a.work()!.gen).toMatchObject({ status: 'error', err: '请先登录' })
    expect(a.F.storage.getItem('pl.auth')).toBeNull()
    expect(a.F.trace.of('ev').filter((e) => e.name === 'openLogin')).toHaveLength(1)
    const b = await compareDrive({ storage: st(W1), server: failAt((kd, c) => kd === 'ep' && c === 2, () => http(402)) })
    expect(b.work()!.gen).toMatchObject({ status: 'error', err: '积分不足' })
    expect(b.work()!.gen!.data!.eps).toHaveLength(1)
  }, 180000)
  it('自检失败被吞（只有登录、积分错误会中断）；修稿失败也被吞', async () => {
    for (const reply of [http(500), http(400), { net: true } as Reply, http(401), http(402), { json: { choices: [{ message: { content: '不是 JSON' } }] } } as Reply]) {
      for (const kind of ['check', 'fix']) await compareDrive({ storage: st(WH), server: failAt((kd) => kd === kind, reply, { issues: () => 1 }) })
    }
  }, 120000)
  it('3 路并行：调度顺序、一批失败后其他路不再取新批、在途的批照常保存', async () => {
    for (const nth of [1, 2, 3, 4, 5]) for (const reply of [http(400), http(402)]) {
      const r = await compareDrive({ storage: st(W5), server: failAt((kd, c) => kd === 'batch' && c === nth, reply) })
      const part = r.work()!.gen!.data!.part
      expect(part && Object.keys(part)).toEqual(['0'])
    }
    // 各批耗时不同：完成顺序与发起顺序不同
    const slow = (): Responder => storyServer({ override: (req, kind) => (kind === 'batch' ? { ...(storyServer({ step: [7000, 1000, 3000][req.n % 3] })(req) as object) } as Reply : undefined) })
    const r = await compareDrive({ storage: st(W5), server: slow })
    const batchStarts = r.L.trace.of('fetch').filter((f) => String((f.init as any).body).includes('集的第 ')).map((f) => [f.t, /第 (\d+)–(\d+) 场/.exec(String((f.init as any).body))![1]])
    expect(batchStarts.slice(0, 3).map((x) => x[1])).toEqual(['1', '3', '5'])
    expect(new Set(batchStarts.slice(0, 3).map((x) => x[0])).size).toBe(1)
  }, 120000)
  it('未登录也能跑（只带通行码）', async () => {
    await compareDrive({ storage: { tjCode: 'k', works: [work(W1, outlineGen(W1))] } })
  })
})

describe('driveYq 与旧 yqDrive：运行中作品被改', () => {
  const W = baseW({ mins: 5, eps: 3 })
  const st = () => ({ auth: AUTH, works: [work(W, outlineGen(W))] })
  it('中途改 status、删除作品、改设定、别处写入 eps', async () => {
    const muts: ((s: RecStorage) => void)[] = [
      editWork((w) => (w.gen.status = 'off')),
      editWork((w) => (w.gen.status = 'done')),
      editWork((w, list) => list.splice(list.indexOf(w), 1)),
      editWork((w) => (w.trashed = T0)),
      editWork((w) => (w.W.heat = '高尺度')),
      editWork((w) => (w.W.depth = '重度')),
      editWork((w) => w.gen.data && (w.gen.data.eps[2] = '别处写的第三集')),
      editWork((w) => (w.gen = null)),
      (s) => s.setItem('pl.works', '[]'),
    ]
    for (const fn of muts) for (const at of [500, 4500, 9000, 30000, 60000]) await compareDrive({ storage: st(), mutate: [{ at, fn }] })
  }, 120000)
  it('gen 为空、作品不存在、已完成、出错但有大纲、全部集已写：什么都不请求或直接收尾', async () => {
    const W1 = baseW()
    const data = { title: 't', logline: 'l', outline: [{ title: 'a', event: 'e', hook: 'h', body: 'b' }, { title: 'b', event: 'e', hook: 'h', body: 'b' }], eps: ['一', '二'], card: null, fixed: [0, 0], cast: [] }
    for (const works of [[work(W1, null)], [work(W1, undefined)], [], [work(W1, { ...outlineGen(W1), status: 'done', data })], [work(W1, { ...outlineGen(W1), status: 'error', data })], [work(W1, { ...outlineGen(W1), status: 'writing', data })]]) {
      const r = await compareDrive({ storage: { auth: AUTH, works } })
      expect(r.L.trace.of('fetch')).toHaveLength(0)
    }
  })
})

describe('单飞：同一作品重复调用只跑一次', () => {
  it('旧 yqDrive 连调两次 = 新 driveYq 连调两次：请求与写入只有一份', async () => {
    const W = baseW({ mins: 5 })
    const [L, F] = sides({ storage: { auth: AUTH, works: [work(W, outlineGen(W))] } })
    const pl = Promise.all([L.drive('w1'), L.drive('w1')])
    expect(await settle(L, pl)).toBe(true)
    const a = F.engine.driveYq('w1')
    const b = F.engine.driveYq('w1')
    expect(b).toBe(a)
    expect(await settle(F, Promise.all([a, b]))).toBe(true)
    expectSame(L, F)
    F.dispose()
  })
  it('enterWork 连调两次（StrictMode 重复挂载）与旧 viewVibeScript 连调两次相同', async () => {
    for (const status of ['outline', 'writing']) {
      const W = baseW({ mins: 3 })
      const data = status === 'writing' ? { title: 't', logline: 'l', outline: [{ title: 'a', event: 'e', hook: 'h' }, { title: 'b', event: 'e2', hook: 'h2' }], eps: [], card: null, fixed: [], cast: [{ name: '甲', role: '女主', bio: '' }] } : null
      const [L, F] = sides({ storage: { auth: AUTH, works: [work(W, { ...outlineGen(W), status, data })] } })
      L.view('w1')
      L.view('w1')
      await settle(L, new Promise(() => {}))
      prelude(F, 'w1')
      F.engine.enterWork('w1')
      prelude(F, 'w1')
      F.engine.enterWork('w1')
      await settle(F, new Promise(() => {}))
      expectSame(L, F, false)
      F.dispose()
    }
  })
})

/* ---------- 进入作品页与按钮 ---------- */

const PHASE_CASES = (): { name: string; storage: Record<string, unknown> }[] => {
  const W = baseW({ mins: 3 })
  const data = { title: '剧', logline: 'l', outline: [{ title: 'a', event: 'e', hook: 'h', body: 'b' }, { title: 'b', event: 'e2', hook: 'h2', body: 'b2' }], eps: ['已写'], card: null, fixed: [0], cast: [{ name: '甲', role: '女主', bio: '20 岁' }] }
  const g = (p: Record<string, unknown>) => ({ ...outlineGen(W), ...p })
  const out: { name: string; storage: Record<string, unknown> }[] = []
  const gensList: [string, unknown][] = [
    ['无 gen', undefined], ['gen null', null], ['outline', g({})], ['writing', g({ status: 'writing', data })], ['done', g({ status: 'done', data: { ...data, eps: ['一', '二'] } })],
    ['error 有大纲', g({ status: 'error', data, err: 'x' })], ['error 无大纲', g({ status: 'error', err: 'x' })], ['off', g({ status: 'off', req: { old: 1 } })],
    ['req 过期', g({ req: { logline: '旧' } })], ['req 过期 + writing', g({ status: 'writing', data, req: { a: 1 } })], ['无 req', g({ req: undefined, status: 'writing', data })],
    ['旧版 queued', { status: 'queued', at: T0, req: genReq(W), id: 'job1' }], ['旧版 running 带 yq', g({ status: 'running' })], ['starting', g({ status: 'starting', engine: undefined })],
    ['无 status', g({ status: undefined })], ['未知 status', g({ status: 'paused' })], ['保留卡片', g({ req: { x: 1 }, card: { title: '旧卡' }, note: '旧提示' })],
  ]
  for (const [name, gen] of gensList) for (const auth of [AUTH, undefined]) for (const extra of [{}, { vname: undefined, seed: undefined }]) {
    out.push({ name: `${name}${auth ? '' : '，未登录'}${'vname' in extra ? '，无主角名' : ''}`, storage: { ...(auth ? { auth } : {}), works: [work(W, gen, extra)] } })
  }
  out.push({ name: '找不到作品', storage: { auth: AUTH, works: [] } })
  return out
}

describe('enterWork 与旧 viewVibeScript 前半段：分支与副作用', () => {
  for (const c of PHASE_CASES()) {
    it(c.name, async () => {
      const [L, F] = sides({ storage: c.storage })
      const pl = L.view('w1')
      await settle(L, new Promise(() => {}))
      prelude(F, 'w1')
      const pf = F.engine.enterWork('w1')
      await settle(F, new Promise(() => {}))
      expect(pf).toBe(pl)
      expectSame(L, F, false)
      F.dispose()
    })
  }
})

describe('作品页按钮：再写一次、先看草稿、接着写、单集重写', () => {
  const W = baseW({ mins: 1, eps: 3 })
  const data = { title: '剧', logline: 'l', outline: [1, 2, 3].map((i) => ({ title: `集${i}`, event: `e${i}`, hook: `h${i}`, body: 'b' })), eps: ['一', '二'], card: null, fixed: [0, 0], cast: [{ name: '甲', role: '女主', bio: '' }] }
  const st = (gen: unknown) => ({ storage: { auth: AUTH, works: [work(W, gen)] } })

  it('失败页“再写一次”（旧 gRetry 处理函数）：有大纲接着写；没有大纲清空 gen 重来', async () => {
    for (const gen of [{ ...outlineGen(W), status: 'error', err: '失败' }, { ...outlineGen(W), status: 'error', engine: 'old', err: 'x', data }, { status: 'error', err: 'x', at: 1 }]) {
      const [L, F] = sides(st(gen))
      expect(L.view('w1')).toBe('fail')
      prelude(F, 'w1')
      expect(F.engine.enterWork('w1')).toBe('fail')
      const pl = L.act(`document.getElementById('gRetry').onclick()`)
      const pf = F.engine.retryWork('w1')
      expect(pf).toBe(pl)
      await settle(L, new Promise(() => {}))
      await settle(F, new Promise(() => {}))
      expectSame(L, F, false)
      F.dispose()
    }
  })
  it('失败页“先看草稿”（旧 gDraft 处理函数）：status 改 off', async () => {
    const [L, F] = sides(st({ ...outlineGen(W), status: 'error', err: '失败' }))
    L.view('w1')
    prelude(F, 'w1')
    F.engine.enterWork('w1')
    const pl = L.act(`document.getElementById('gDraft').onclick()`)
    const pf = F.engine.showDraft('w1')
    expect([pf, pl]).toEqual(['ready', 'ready'])
    expectSame(L, F, false)
    F.dispose()
  })
  // 下面两个按钮在旧页面里挂在 vibeData 之后渲染的 DOM 上，桩环境到不了；处理函数正文照快照第 2992、3014 行原样在旧页面作用域里执行。
  const RESUME = `(()=>{ const w=(store('works')||[]).find(x=>x.id==='w1'), tab='outline'; updateGen(w.id,{status:'writing',err:null}); viewVibeScript(w.id,tab); })()`
  const REDO = (k: number) => `(()=>{ const w=(store('works')||[]).find(x=>x.id==='w1'); const b={dataset:{redo:'${k}'}}; const k=+b.dataset.redo, d=w.gen.data; d.eps[k]=null; updateGen(w.id,{data:d, status:'writing', err:null}); viewVibeScript(w.id,'script'); })()`
  it('进度条“接着写”（旧第 2992 行）：出错后从第一个没写的集接着写', async () => {
    for (const gen of [{ ...outlineGen(W), status: 'error', err: '积分不足', data }, { ...outlineGen(W), status: 'error', err: 'x', data: { ...data, eps: [null, '二'], part: { 0: { plan: [], parts: [] } } } }]) {
      const [L, F] = sides(st(gen))
      const pl = L.act(RESUME)
      prelude(F, 'w1')
      const pf = F.engine.resumeWriting('w1')
      expect(pf).toBe(pl)
      await settle(L, new Promise(() => {}))
      await settle(F, new Promise(() => {}))
      expectSame(L, F, false)
      F.dispose()
    }
  })
  it('单集重写（旧第 3014 行）：清掉该集、status 改 writing、只重写这一集', async () => {
    for (const k of [0, 1, 2]) for (const W2 of [W, baseW({ mins: 5, eps: 3, depth: '重度' })]) {
      const full = { ...data, eps: ['一', '二', '三'], fixed: [0, 1, 0] }
      const [L, F] = sides({ storage: { auth: AUTH, works: [work(W2, { ...outlineGen(W2), status: k === 1 ? 'error' : 'done', err: k === 1 ? '上次的错误' : null, data: full })] } })
      L.view('w1')
      prelude(F, 'w1')
      F.engine.enterWork('w1')
      const pl = L.act(REDO(k))
      const pf = F.engine.redoEpisode('w1', k)
      expect(pf).toBe(pl)
      await settle(L, new Promise(() => {}))
      await settle(F, new Promise(() => {}))
      expectSame(L, F, false)
      const eps = (gens(F.storage)[0]!.data!.eps as string[])
      expect(eps.filter((x, i) => x !== full.eps[i])).toHaveLength(1)
      expect(gens(F.storage)[0]!.status).toBe('done')
      F.dispose()
    }
  })
})

/* ---------- 离开页面后停止、回来续写 ---------- */

describe('停止与续写：stopYq 等同旧页面关闭，回来后接着写', () => {
  const W = baseW({ mins: 5, eps: 2, depth: '重度' })
  const storage = { auth: AUTH, works: [work(W, outlineGen(W))] }
  // 停止时刻覆盖：写策划卡途中、大纲途中、分场、3 路批次在途、自检、修稿、重试等待、第二集
  const STOPS = [0, 500, 2500, 4000, 6500, 9000, 12000, 15500, 20000, 26000, 33000, 40000, 47000]

  it.each(STOPS)('在第 %i 毫秒停止，再进入作品页', async (at) => {
    const server = () => storyServer({ issues: (c) => (c === 2 ? 1 : 0), override: (req, kind) => (kind === 'batch' && req.n === 9 ? { status: 503, json: { error: '忙' } } : undefined) })
    // 旧页面：跑到 at，然后整页丢弃（关闭）；用当时的 localStorage 开一个新页面，进入作品页
    const L1 = legacyEngine({ storage, server })
    L1.drive('w1')
    await L1.clock.advance(at)
    const snap = L1.storage.dump()
    const F = freshEngine({ storage, server })
    watchRefresh(F, 'w1')
    void F.engine.driveYq('w1')
    await F.clock.advance(at)
    compared++
    expect(normTrace(F.trace.events)).toEqual(normTrace(L1.trace.events))
    expect(F.storage.dump()).toEqual(snap)

    expect(F.engine.isRunning('w1')).toBe(true)
    expect(F.engine.stopYq('w1')).toBe(true)
    expect(F.engine.isRunning('w1')).toBe(false)
    const n0 = F.trace.events.length
    await F.clock.run(() => false, 3600e3)
    // 停止后：不再请求、不再写存储、没有提示，引擎定时器全部清掉
    expect(F.trace.events.slice(n0).filter((e) => e.k === 'fetch' || e.k === 'write' || e.k === 'remove' || e.k === 'ev')).toEqual([])
    expect(F.clock.pending()).toBe(0)
    expect(F.storage.dump()).toEqual(snap)

    // 回来：旧页面是新开的一页；新引擎是同一个实例
    const L2 = legacyEngine({ raw: snap, server, now: F.clock.now })
    F.fetch.swap(server())
    const m0 = F.trace.events.length
    const pl = L2.view('w1')
    await settle(L2, new Promise(() => {}))
    prelude(F, 'w1')
    const pf = F.engine.enterWork('w1')
    await settle(F, new Promise(() => {}))
    expect(pf).toBe(pl)
    compared++
    expect(normTrace(noPhase(F.trace.events.slice(m0)))).toEqual(normTrace(noPhase(L2.trace.events)))
    expect(F.storage.dump()).toEqual(L2.storage.dump())
    expect(gens(F.storage)[0]!.status).toBe('done')
    F.dispose()
  }, 60000)
})
