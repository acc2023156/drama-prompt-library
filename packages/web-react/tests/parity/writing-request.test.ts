import { afterAll, describe, expect, it, vi } from 'vitest'
import { YQ_HOT, YQ_PLAN, YQ_WRITE } from '../../src/domain/yq'
import { YQ_CAP_MS, YQ_IDLE_MS, YQ_STREAM, YQ_WAIT, yqChat, yqOnce, yqReadStream } from '../../src/features/writing/request'
import {
  buildResponse, errView, freshEngine, jsonReply, legacyEngine, normTrace, plain, type Reply, type Responder, type SideOptions, type SseChunk, sseData, sseDelta, sseReply,
} from './writing-harness'

/*
 * 写作调用层的新旧对照：SSE 解析（各种分片切法）、100 秒无新字与 15 分钟上限、yqOnce 的状态码与积分回写、yqChat 的重试与换模型。
 * 每个用例新旧两边各用一个虚拟时钟与同一串桩回应，比较结果、全部 fetch 调用（URL、头、请求体原文）、
 * 定时器（创建时刻与时长）、localStorage 写入与登录 / 提示事件。
 */

const AUTH = { token: 'tok.1.sig', user: { uid: 'u1', phone: '13800138000', role: 'free', points: 10, cap: 40 } }
const TESTER = { token: 't2', user: { uid: 'u2', phone: '13900139000', role: 'tester', points: null } }
// 新旧两边都在 vm 与虚拟时钟里整段实跑，单个用例的比较次数多，放宽超时。
vi.setConfig({ testTimeout: 120000 })
let compared = 0
afterAll(() => console.log(`[parity writing-request] ${compared} 次新旧对照`))

type Outcome = { ok?: unknown; err?: { message: string; retry: unknown } }
async function outcome(p: Promise<unknown>): Promise<Outcome> {
  try {
    return { ok: plain(await p) }
  } catch (e) {
    return { err: errView(e) }
  }
}

/* ---------- SSE 解析 ---------- */

const enc = new TextEncoder()
const STREAMS: Record<string, string> = {
  basic: sseDelta('你好') + sseDelta('，世界') + 'data: [DONE]\n\n',
  finish: sseDelta('甲') + sseDelta('乙', 'stop'),
  finishNull: sseDelta('甲', null) + sseDelta('乙', null) + 'data: [DONE]\n\n',
  crlf: 'data: {"choices":[{"delta":{"content":"一"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"二"}}]}\r\n\r\ndata: [DONE]\r\n\r\n',
  nospace: 'data:{"choices":[{"delta":{"content":"紧"}}]}\ndata:[DONE]\n',
  comments: ': keep-alive\n\nevent: ping\ndata: {"choices":[{"delta":{}}]}\n\n' + sseDelta('内容') + 'id: 3\nretry: 100\ndata: [DONE]\n\n',
  badJson: 'data: {oops\n\n' + sseDelta('好') + 'data: \n\ndata: null\n\ndata: []\n\ndata: [DONE]\n\n',
  oddChoices: sseData({ choices: [] }) + sseData({}) + sseData({ choices: [{}] }) + sseData({ choices: [{ delta: { content: null } }] }) + sseData({ choices: [{ delta: { content: 5 } }] }) + sseData({ choices: [{ delta: { content: '尾' }, finish_reason: '' }] }) + 'data: [DONE]\n\n',
  noEnd: sseDelta('写了') + sseDelta('一半'),
  afterDone: sseDelta('前') + 'data: [DONE]\n\n' + sseDelta('后'),
  emoji: sseDelta('😀中文🎬') + sseDelta('ß∑') + 'data: [DONE]\n\n',
  doneNoNewline: sseDelta('只有') + 'data: [DONE]',
  spaced: '   data: {"choices":[{"delta":{"content":"空格"}}]}   \n  data: [DONE]  \n',
  think: sseDelta('<think>想') + sseDelta('</think>答') + 'data: [DONE]\n\n',
  empty: '',
  onlyDone: 'data: [DONE]\n\n',
  multiChoice: sseData({ choices: [{ delta: { content: 'A' } }, { delta: { content: 'B' } }] }) + sseData({ choices: [{ delta: { content: 'C' }, finish_reason: 'length' }] }),
  dataWord: 'database: x\ndata: [DONE]\n',
}

/** 把字节流在给定位置切开，每片间隔 10 毫秒。 */
function cutAt(bytes: Uint8Array, cuts: number[]): SseChunk[] {
  const pts = [0, ...cuts.filter((c) => c > 0 && c < bytes.length).sort((a, b) => a - b), bytes.length]
  const out: SseChunk[] = []
  for (let i = 0; i + 1 < pts.length; i++) if (pts[i + 1] > pts[i]) out.push({ at: (i + 1) * 10, data: bytes.slice(pts[i], pts[i + 1]) })
  return out
}

async function compareStream(chunks: SseChunk[], end: 'close' | 'hang' = 'close', closeAt?: number) {
  const reply = { sse: chunks, end, closeAt }
  const L = legacyEngine()
  const acL = new AbortController()
  const rL = buildResponse(L.clock, reply, acL.signal)
  const pL = outcome(L.call('yqReadStream', rL, acL) as Promise<unknown>)
  let oL: Outcome | undefined
  pL.then((o) => (oL = o))
  await L.clock.run(() => oL !== undefined)

  const F = freshEngine()
  const acF = new AbortController()
  const rF = buildResponse(F.clock, reply, acF.signal)
  let oF: Outcome | undefined
  outcome(yqReadStream(rF, acF, F.deps)).then((o) => (oF = o))
  await F.clock.run(() => oF !== undefined)
  F.dispose()

  compared++
  expect(oF).toEqual(oL)
  expect(normTrace(F.trace.events)).toEqual(normTrace(L.trace.events))
  expect(F.clock.now).toBe(L.clock.now)
  return oF!
}

let rnd = 12345
const prand = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648)

describe('yqReadStream：SSE 行解析', () => {
  for (const [name, text] of Object.entries(STREAMS)) {
    it(`${name}：整段、逐字节单刀切、随机多刀切的结果都与旧页面相同`, async () => {
      const bytes = enc.encode(text)
      const whole = await compareStream(bytes.length ? [{ at: 10, data: bytes }] : [])
      for (let c = 1; c < bytes.length; c++) expect(await compareStream(cutAt(bytes, [c]))).toEqual(whole)
      for (let k = 0; k < 25; k++) {
        const cuts = Array.from({ length: 1 + Math.floor(prand() * 8) }, () => Math.floor(prand() * bytes.length))
        expect(await compareStream(cutAt(bytes, cuts))).toEqual(whole)
      }
      // 每个字节一片
      expect(await compareStream(cutAt(bytes, Array.from({ length: bytes.length }, (_, i) => i)))).toEqual(whole)
    })
  }

  it('各流的预期结果（固定旧行为）', async () => {
    const r = async (t: string) => compareStream([{ at: 10, data: enc.encode(t) }])
    expect(await r(STREAMS.basic)).toEqual({ ok: '你好，世界' })
    expect(await r(STREAMS.finish)).toEqual({ ok: '甲乙' })
    expect(await r(STREAMS.crlf)).toEqual({ ok: '一二' })
    expect(await r(STREAMS.noEnd)).toEqual({ err: { message: '串流中断', retry: true } })
    expect(await r(STREAMS.afterDone)).toEqual({ ok: '前后' })
    expect(await r(STREAMS.doneNoNewline)).toEqual({ err: { message: '串流中断', retry: true } })
    expect(await r(STREAMS.oddChoices)).toEqual({ ok: '5尾' })
    expect(await r(STREAMS.multiChoice)).toEqual({ ok: 'AC' })
    expect(await r(STREAMS.empty)).toEqual({ err: { message: '串流中断', retry: true } })
    expect(await r(STREAMS.onlyDone)).toEqual({ ok: '' })
    expect(await r(STREAMS.dataWord)).toEqual({ ok: '' })
  })
})

describe('yqReadStream：100 秒无新字与 15 分钟上限', () => {
  const at = (sec: number, data: string): SseChunk => ({ at: sec * 1000, data })
  it('每 99 秒来一段新字不会中止；正好 100 秒也不中止（同刻先收字）', async () => {
    expect(await compareStream([at(99, sseDelta('a')), at(198, sseDelta('b')), at(297, sseDelta('c')), at(396, 'data: [DONE]\n\n')])).toEqual({ ok: 'abc' })
    expect(await compareStream([at(100, sseDelta('a')), at(200, sseDelta('b', 'stop'))])).toEqual({ ok: 'ab' })
  })
  it('只有保活 PING（空 delta、注释行）不算新字：100 秒后中止', async () => {
    const pings = Array.from({ length: 10 }, (_, i) => at(30 * (i + 1), i % 2 ? ': ping\n\n' : sseData({ choices: [{ delta: {} }] })))
    const o = await compareStream([at(1, sseDelta('开头')), ...pings, at(400, 'data: [DONE]\n\n')])
    expect(o).toEqual({ err: { message: '串流中断', retry: true } })
  })
  it('101 秒才来下一段：中止；中止时刻 = 最后一次新字 + 100 秒', async () => {
    const F = await compareStream([at(5, sseDelta('a')), at(106, sseDelta('b')), at(107, 'data: [DONE]\n\n')], 'hang')
    expect(F).toEqual({ err: { message: '串流中断', retry: true } })
  })
  it('一直有新字但整段超过 15 分钟：在 15:00 中止', async () => {
    const chunks = Array.from({ length: 24 }, (_, i) => at(50 * (i + 1), sseDelta(String(i))))
    const o = await compareStream([...chunks, at(1250, 'data: [DONE]\n\n')])
    expect(o).toEqual({ err: { message: '串流中断', retry: true } })
  })
  it('14:59 收到结尾标记：成功', async () => {
    const chunks = Array.from({ length: 17 }, (_, i) => at(50 * (i + 1), sseDelta(String(i % 10))))
    expect(await compareStream([...chunks, at(899, 'data: [DONE]\n\n')])).toEqual({ ok: '01234567890123456' })
  })
  it('收到结尾后连接挂着不关：100 秒后中止，视为中断', async () => {
    expect(await compareStream([at(1, sseDelta('x')), at(2, 'data: [DONE]\n\n')], 'hang')).toEqual({ err: { message: '串流中断', retry: true } })
  })
  it('时长常量', () => {
    expect([YQ_IDLE_MS, YQ_CAP_MS, YQ_STREAM, [...YQ_WAIT]]).toEqual([100000, 900000, true, [5, 15, 45]])
    const L = legacyEngine()
    expect([[...L.run('YQ_WAIT')], L.run('YQ_STREAM')]).toEqual([[...YQ_WAIT], YQ_STREAM])
  })
})

/* ---------- yqOnce ---------- */

async function compareOnce(reply: Reply | Responder, opt: SideOptions & { model?: string; content?: string; max?: number } = {}) {
  const server = () => (typeof reply === 'function' ? reply : () => reply)
  const model = opt.model ?? YQ_WRITE
  const content = opt.content ?? '写一集'
  const L = legacyEngine({ ...opt, server })
  let oL: Outcome | undefined
  outcome(L.call('yqOnce', model, content, opt.max) as Promise<unknown>).then((o) => (oL = o))
  await L.clock.run(() => oL !== undefined)

  const F = freshEngine({ ...opt, server })
  let oF: Outcome | undefined
  outcome(yqOnce(model, content, opt.max, { deps: F.deps })).then((o) => (oF = o))
  await F.clock.run(() => oF !== undefined)
  F.dispose()

  compared++
  expect(oF).toEqual(oL)
  expect(normTrace(F.trace.events)).toEqual(normTrace(L.trace.events))
  expect(F.storage.dump()).toEqual(L.storage.dump())
  return { o: oF!, trace: F.trace, storage: F.storage }
}

const BODIES: unknown[] = [{ error: '上游说不行' }, { error: { message: '对象里的消息' } }, { error: { code: 7 } }, {}, { error: '' }, { error: 0 }, null, '不是 JSON']
const STATUSES = [200, 201, 400, 401, 402, 403, 404, 408, 413, 429, 500, 502, 503, 504, 599]
const replyFor = (status: number, body: unknown, headers: Record<string, string> = {}): Reply =>
  typeof body === 'string' ? { status, text: body, headers } : body === null ? { status, text: '', headers } : { status, json: body, headers }

describe('yqOnce：状态码、错误体与积分回写', () => {
  it('状态码 × 错误体：结果、retry 标记、登录与提示事件都与旧页面相同', async () => {
    for (const status of STATUSES) for (const body of BODIES) await compareOnce(replyFor(status, body, { 'X-Points': '7' }), { storage: { auth: AUTH, tjCode: 'c0de' } })
  })
  it('401：删 pl.auth 并打开登录；402：提示积分用完；两者不重试', async () => {
    const a = await compareOnce(replyFor(401, { error: 'login required' }), { storage: { auth: AUTH } })
    expect(a.o).toEqual({ err: { message: '请先登录', retry: undefined } })
    expect(a.storage.getItem('pl.auth')).toBeNull()
    expect(a.trace.of('ev')).toEqual([{ t: 0, k: 'ev', name: 'openLogin' }])
    const b = await compareOnce(replyFor(402, { error: 'no points', points: 0 }, { 'X-Points': '0' }), { storage: { auth: AUTH } })
    expect(b.o).toEqual({ err: { message: '积分不足', retry: undefined } })
    expect(b.trace.of('ev')).toEqual([{ t: 0, k: 'ev', name: 'toast', arg: '今天的积分用完了，明天 0 点补满' }])
    expect(JSON.parse(b.storage.getItem('pl.auth')!).user.points).toBe(0)
  })
  it('登录态 × X-Points × 通行码 × 后端地址 × max_tokens：请求头、请求体原文与积分写回', async () => {
    const auths: (object | undefined)[] = [undefined, AUTH, TESTER]
    const pts: (string | undefined)[] = [undefined, '7', '0', 'abc', '']
    for (const auth of auths) for (const p of pts) for (const tjCode of [undefined, 'k-123']) for (const apiBase of ['', 'https://api.example.test']) {
      const headers: Record<string, string> = p === undefined ? {} : { 'X-Points': p }
      const storage: Record<string, unknown> = {}
      if (auth) storage.auth = auth
      if (tjCode) storage.tjCode = tjCode
      for (const max of [undefined, 0, 1500]) await compareOnce(sseReply('正文'), { storage, apiBase, max: max as number })
      await compareOnce(replyFor(429, { error: 'busy' }, headers), { storage, apiBase })
      await compareOnce({ ...(sseReply('好') as object), headers } as Reply, { storage, apiBase })
    }
  })
  it('请求体字段与键顺序（逐字节）', async () => {
    const a = await compareOnce(sseReply('x'), { storage: { auth: AUTH, tjCode: 'c' }, model: YQ_HOT, content: '含"引号"\n与换行', max: 4000 })
    const f = a.trace.of('fetch')[0]
    expect(f.url).toBe('/yq/v1/chat/completions')
    expect(f.init).toEqual({
      method: 'POST', signal: 'AbortSignal',
      headers: { 'X-Tianji-Code': 'c', 'Content-Type': 'application/json', Authorization: 'Bearer tok.1.sig' },
      body: '{"model":"gemma4-31b-heretic","messages":[{"role":"user","content":"含\\"引号\\"\\n与换行"}],"max_tokens":4000,"temperature":0.8,"stream":true}',
    })
    expect(Object.keys(JSON.parse((f.init as { body: string }).body))).toEqual(['model', 'messages', 'max_tokens', 'temperature', 'stream'])
  })
  it('网络中断、空回应、只有 <think>、非流式 JSON、200 但非 JSON、event-stream 却是错误码', async () => {
    const st = { storage: { auth: AUTH } }
    expect((await compareOnce({ net: true }, st)).o).toEqual({ err: { message: '网路中断', retry: true } })
    expect((await compareOnce(jsonReply('  非流式  '), st)).o).toEqual({ ok: '非流式' })
    expect((await compareOnce(jsonReply('<think>a</think> <think>b\n</think>答'), st)).o).toEqual({ ok: '答' })
    expect((await compareOnce(jsonReply('<think>只想不答</think>'), st)).o).toEqual({ err: { message: '空白回应', retry: true } })
    expect((await compareOnce(sseReply('<think>只想</think>   '), st)).o).toEqual({ err: { message: '空白回应', retry: true } })
    expect((await compareOnce({ status: 200, text: '<html>' }, st)).o).toEqual({ err: { message: '空白回应', retry: true } })
    expect((await compareOnce({ status: 200, json: { choices: [{ message: { content: 12 } }] } }, st)).o).toEqual({ ok: '12' })
    await compareOnce({ status: 200, json: { choices: [{ text: 'x' }] } }, st)
    await compareOnce({ sse: [{ at: 1, data: sseDelta('x') }], status: 500 }, st)
    await compareOnce({ sse: [{ at: 1, data: sseDelta('x') }], status: 401 }, st)
    await compareOnce({ status: 200, headers: { 'Content-Type': 'application/json; event-stream' }, text: '' }, st)
    await compareOnce({ ...(sseReply('流') as object), headers: { 'Content-Type': 'text/plain' } } as Reply, st)
    await compareOnce({ net: true, delay: 5000 }, st)
    await compareOnce({ ...(sseReply('迟到的流') as object), delay: 30000 } as Reply, st)
  })
})

/* ---------- yqChat：重试与换模型 ---------- */

type Kind = 'ok' | 'r429' | 'r500' | 'r502' | 'r503' | 'r504' | 'net' | 'empty' | 'cut' | 'idle' | 'n400' | 'n401' | 'n402' | 'n403'
const RETRYABLE: Kind[] = ['r429', 'r500', 'r502', 'r503', 'r504', 'net', 'empty', 'cut', 'idle']
const FINAL: Kind[] = ['ok', ...RETRYABLE, 'n400', 'n401', 'n402', 'n403']
function attempt(k: Kind, n: number): Reply {
  switch (k) {
    case 'ok': return sseReply(`第 ${n} 次成功`)
    case 'net': return { net: true }
    case 'empty': return sseReply('<think>空</think>')
    case 'cut': return sseReply('写一半', { end: 'none' })
    case 'idle': return { sse: [{ at: 1000, data: sseDelta('慢') }], end: 'hang' }
    default: return replyFor(+k.slice(1), { error: `错误 ${k}` }, { 'X-Points': String(9 - n) })
  }
}

async function compareChat(seq: Kind[], model: string, storage: Record<string, unknown> = { auth: AUTH }) {
  const server = (): Responder => (req) => attempt(seq[Math.min(req.n, seq.length - 1)], req.n)
  const L = legacyEngine({ storage, server })
  const retL: unknown[] = []
  L.run(`globalThis.__opts={onRetry:(...a)=>__ev('onRetry', a)}`)
  let oL: Outcome | undefined
  outcome(L.run(`yqChat(${JSON.stringify(model)}, '提示', 2000, __opts)`) as Promise<unknown>).then((o) => (oL = o))
  await L.clock.run(() => oL !== undefined)

  const F = freshEngine({ storage, server })
  let oF: Outcome | undefined
  outcome(yqChat(model, '提示', 2000, { onRetry: (...a) => F.trace.push({ k: 'ev', name: 'onRetry', arg: a }) }, { deps: F.deps })).then((o) => (oF = o))
  await F.clock.run(() => oF !== undefined)
  F.dispose()
  void retL
  compared++
  expect(oF).toEqual(oL)
  expect(plain(normTrace(F.trace.events))).toEqual(plain(normTrace(L.trace.events)))
  expect(F.storage.dump()).toEqual(L.storage.dump())
  return { o: oF!, trace: F.trace }
}

describe('yqChat：重试 3 次（5、15、45 秒），最后一次换快模型', () => {
  it('前 0–3 次可重试失败 × 最后一次各种结果 × 三个模型', async () => {
    for (const model of [YQ_WRITE, YQ_PLAN, YQ_HOT]) for (const r of RETRYABLE) for (const f of FINAL) for (let len = 1; len <= 4; len++) {
      await compareChat([...Array(len - 1).fill(r), f], model)
    }
  }, 120000)
  it('混合的失败序列（不同的可重试错误交替出现）', async () => {
    for (let a = 0; a < RETRYABLE.length; a++) for (const f of ['ok', 'r429', 'n402'] as Kind[]) {
      await compareChat([RETRYABLE[a], RETRYABLE[(a + 3) % 9], RETRYABLE[(a + 5) % 9], f], YQ_WRITE)
    }
  })
  it('时刻与模型：等 5、15、45 秒；第 4 次用 YQ_PLAN；onRetry 依次 (1,5)(2,15)(3,45)，成功后 (0)', async () => {
    const { o, trace } = await compareChat(['r429', 'net', 'r504', 'ok'], YQ_WRITE)
    expect(o).toEqual({ ok: '第 3 次成功' })
    const fetches = trace.of('fetch')
    expect(fetches.map((f) => f.t)).toEqual([0, 5000, 20000, 65000])
    expect(fetches.map((f) => JSON.parse((f.init as { body: string }).body).model)).toEqual([YQ_WRITE, YQ_WRITE, YQ_WRITE, YQ_PLAN])
    expect(trace.of('ev').map((e) => [e.t, e.arg])).toEqual([[0, [1, 5]], [5000, [2, 15]], [20000, [3, 45]], [69000, [0]]])
    expect(trace.of('timer').filter((t) => [5000, 15000, 45000].includes(t.ms)).map((t) => [t.t, t.ms])).toEqual([[0, 5000], [5000, 15000], [20000, 45000]])
  })
  it('重试用尽：抛最后一次的错误，共 4 次请求', async () => {
    const { o, trace } = await compareChat(['r500', 'r500', 'r500', 'r503'], YQ_HOT)
    expect(o).toEqual({ err: { message: '错误 r503', retry: true } })
    expect(trace.of('fetch')).toHaveLength(4)
    expect(JSON.parse((trace.of('fetch')[3].init as { body: string }).body).model).toBe(YQ_PLAN)
  })
  it('不可重试的错误与积分不足直接抛出，不等待', async () => {
    for (const k of ['n400', 'n401', 'n402', 'n403'] as Kind[]) {
      const { trace } = await compareChat([k], YQ_WRITE)
      expect(trace.of('fetch')).toHaveLength(1)
      expect(trace.of('timer').filter((t) => t.ms === 5000)).toHaveLength(0)
    }
  })
  it('未登录与内部测试身份下的重试', async () => {
    for (const storage of [{}, { auth: TESTER }, { tjCode: 'k' }]) for (const seq of [['r429', 'ok'], ['n401'], ['cut', 'idle', 'empty', 'net']] as Kind[][]) {
      await compareChat(seq, YQ_WRITE, storage)
    }
  })
})
