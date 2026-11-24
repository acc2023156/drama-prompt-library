import vm from 'node:vm'
import { createWritingEngine, type WritingEngine } from '../../src/features/writing/engine'
import type { WritingDeps, WritingStorage } from '../../src/features/writing/deps'
import { get, remove, set, setWorksPushHook } from '../../src/lib/storage'
import { loadData } from './data'
import { legacyTopLevel, MemoryStorage } from './legacy'

/*
 * 写作引擎新旧对照的公共设施：
 * - Clock：虚拟时钟（setTimeout / clearTimeout / Date.now 都走它），新旧两边各用一个，按同样规则推进；
 * - RecStorage：记录每一次 localStorage 写入的 localStorage；
 * - makeFetch：按脚本回应的 fetch 桩，支持 JSON、SSE 分片、网络错误、挂起不结束，遵守 AbortSignal；
 * - legacyEngine：经 tests/parity/legacy.ts 的 legacyTopLevel 取旧页面顶层声明，在 node:vm 里实跑旧引擎；
 * - freshEngine：新引擎，存储走真实的 lib/storage（localStorage 换成 RecStorage）。
 * 两边产生的事件按时间顺序记进 Trace，测试比较整串事件是否相同。
 */

export const T0 = 1795500000000

export type TraceEvent =
  | { t: number; k: 'fetch'; url: string; init: unknown }
  | { t: number; k: 'write'; key: string; raw: string }
  | { t: number; k: 'remove'; key: string }
  | { t: number; k: 'timer'; id: number; ms: number }
  | { t: number; k: 'clear'; id: number }
  | { t: number; k: 'ev'; name: string; arg?: unknown }

export class Trace {
  events: TraceEvent[] = []
  constructor(private clock: Clock) {}
  push(e: Record<string, unknown>): void {
    this.events.push({ t: this.clock.now - T0, ...e } as TraceEvent)
  }
  of<K extends TraceEvent['k']>(k: K): Extract<TraceEvent, { k: K }>[] {
    return this.events.filter((e) => e.k === k) as Extract<TraceEvent, { k: K }>[]
  }
}

interface Timer {
  id: number
  at: number
  seq: number
  fn: () => void
  every?: number
}

/** 虚拟时钟。schedule 给桩用（不记入 Trace）；setTimeout 给被测引擎用（记入 Trace）。 */
export class Clock {
  now = T0
  private timers = new Map<number, Timer>()
  private nextId = 1
  private seq = 0
  trace: Trace | null = null
  fired = 0

  private add(fn: () => void, ms: number, every?: number): number {
    const id = this.nextId++
    this.timers.set(id, { id, at: this.now + Math.max(0, Number(ms) || 0), seq: this.seq++, fn, every })
    return id
  }
  /** 桩内部用的定时器，id 取负数，不与引擎的定时器混号。 */
  schedule(fn: () => void, ms: number): void {
    const id = -this.nextId++
    this.timers.set(id, { id, at: this.now + Math.max(0, ms), seq: this.seq++, fn })
  }
  setTimeout = (fn: () => void, ms: number): number => {
    const id = this.add(fn, ms)
    this.trace?.push({ k: 'timer', id, ms })
    return id
  }
  clearTimeout = (id: unknown): void => {
    if (typeof id !== 'number' || !this.timers.has(id)) return
    this.timers.delete(id)
    this.trace?.push({ k: 'clear', id })
  }
  /** 界面计时器（旧 genWait 的 setInterval），不记入 Trace。 */
  setInterval = (fn: () => void, ms: number): number => this.add(fn, ms, ms)
  clearInterval = (id: unknown): void => {
    if (typeof id === 'number') this.timers.delete(id)
  }
  pending(): number {
    return [...this.timers.values()].filter((t) => t.id > 0 && !t.every).length
  }
  async drain(): Promise<void> {
    for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r))
  }
  /** 推进时间直到 until() 为真、没有定时器或超过 limitMs；每触发一个定时器就清空微任务。 */
  async run(until: () => boolean = () => false, limitMs = 48 * 3600e3): Promise<void> {
    const end = this.now + limitMs
    for (;;) {
      await this.drain()
      if (until()) return
      const next = [...this.timers.values()].sort((a, b) => a.at - b.at || a.seq - b.seq)[0]
      if (!next || next.at > end) return
      if (++this.fired > 200000) throw new Error('定时器过多，疑似死循环')
      this.now = next.at
      if (next.every) next.at += next.every
      else this.timers.delete(next.id)
      next.fn()
    }
  }
  /** 推进到 now + ms（含该时刻到期的定时器）。 */
  async advance(ms: number): Promise<void> {
    const end = this.now + ms
    for (;;) {
      await this.drain()
      const next = [...this.timers.values()].sort((a, b) => a.at - b.at || a.seq - b.seq)[0]
      if (!next || next.at > end) break
      this.now = next.at
      if (next.every) next.at += next.every
      else this.timers.delete(next.id)
      next.fn()
    }
    this.now = end
    await this.drain()
  }
}

/** 记录写入的 localStorage：只记 pl. 开头的键（不含 pl.lastVibe，见对照测试说明）。 */
export class RecStorage extends MemoryStorage {
  trace: Trace | null = null
  setItem(k: string, v: string) {
    super.setItem(k, v)
    if (k.startsWith('pl.') && k !== 'pl.lastVibe') this.trace?.push({ k: 'write', key: k, raw: String(v) })
  }
  removeItem(k: string) {
    super.removeItem(k)
    if (k.startsWith('pl.')) this.trace?.push({ k: 'remove', key: k })
  }
  dump(): Record<string, string> {
    const o: Record<string, string> = {}
    for (let i = 0; i < this.length; i++) {
      const k = this.key(i) as string
      o[k] = this.getItem(k) as string
    }
    return o
  }
}

/* ---------- fetch 桩 ---------- */

export interface SseChunk {
  /** 相对响应头到达的毫秒数。 */
  at: number
  data: string | Uint8Array
}
export type Reply =
  | { net: true; delay?: number }
  | { status?: number; headers?: Record<string, string>; json?: unknown; text?: string; delay?: number }
  | { sse: SseChunk[]; status?: number; headers?: Record<string, string>; end?: 'close' | 'hang'; closeAt?: number; delay?: number }

export interface Req {
  n: number
  url: string
  init: RequestInit | undefined
  body: any
  prompt: string
}
export type Responder = (req: Req) => Reply

const enc = new TextEncoder()
const abortErr = () => new DOMException('This operation was aborted', 'AbortError')

/** 把 init 规整成可比较的普通对象（signal 只记是否存在）。 */
function initView(init: RequestInit | undefined): unknown {
  if (init === undefined) return undefined
  const { signal, ...rest } = init as RequestInit & { signal?: AbortSignal }
  return { ...rest, signal: signal ? 'AbortSignal' : signal }
}

export interface StubFetch {
  (url: string, init?: RequestInit): Promise<Response>
  /** 换一个回应器（调用序号从 0 重新计）。 */
  swap(r: Responder): void
}

export function makeFetch(clock: Clock, trace: Trace, first: Responder): StubFetch {
  let n = 0
  let responder = first
  const f = (url: string, init?: RequestInit): Promise<Response> => {
    const k = n++
    trace.push({ k: 'fetch', url, init: initView(init) })
    let body: any = null
    try {
      body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null
    } catch {
      body = null
    }
    const prompt = body?.messages?.[0]?.content ?? ''
    const reply = responder({ n: k, url, init, body, prompt })
    const signal = init?.signal ?? undefined
    return new Promise<Response>((resolve, reject) => {
      if (signal?.aborted) return reject(abortErr())
      let settled = false
      const onAbort = () => {
        if (settled) return
        settled = true
        reject(abortErr())
      }
      signal?.addEventListener('abort', onAbort)
      clock.schedule(() => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        if ('net' in reply) return reject(new TypeError('fetch failed'))
        resolve(buildResponse(clock, reply, signal))
      }, reply.delay ?? 0)
    })
  }
  return Object.assign(f, { swap(r: Responder) { responder = r; n = 0 } })
}

export function buildResponse(clock: Clock, reply: Exclude<Reply, { net: true }>, signal?: AbortSignal): Response {
  if ('sse' in reply) {
    const headers = { 'Content-Type': 'text/event-stream', ...(reply.headers || {}) }
    let closed = false
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        const fail = () => {
          if (closed) return
          closed = true
          try {
            ctrl.error(abortErr())
          } catch {
            /* 已结束 */
          }
        }
        if (signal) signal.addEventListener('abort', fail)
        for (const c of reply.sse) {
          clock.schedule(() => {
            if (closed) return
            ctrl.enqueue(typeof c.data === 'string' ? enc.encode(c.data) : c.data)
          }, c.at)
        }
        if ((reply.end ?? 'close') === 'close') {
          const last = reply.closeAt ?? (reply.sse.length ? reply.sse[reply.sse.length - 1].at : 0)
          clock.schedule(() => {
            if (closed) return
            closed = true
            ctrl.close()
          }, last)
        }
      },
    })
    return new Response(stream, { status: reply.status ?? 200, headers })
  }
  const text = reply.text !== undefined ? reply.text : reply.json === undefined ? '' : JSON.stringify(reply.json)
  const status = reply.status ?? 200
  const nullBody = status === 204 || status === 205 || status === 304
  return new Response(nullBody ? null : text, { status, headers: { 'Content-Type': 'application/json', ...(reply.headers || {}) } })
}

/* ---------- SSE 与模型回复的构造 ---------- */

export const sseData = (o: unknown): string => `data: ${JSON.stringify(o)}\n\n`
export const sseDelta = (t: string, finish?: string | null): string =>
  sseData({ choices: [{ delta: { content: t }, ...(finish !== undefined ? { finish_reason: finish } : {}) }] })

/** 一段文字的标准流式回复：每 step 毫秒一片，最后 [DONE]（或 finish_reason）。 */
export function sseReply(text: string, opt: { pieces?: number; step?: number; end?: 'done' | 'finish' | 'none'; headers?: Record<string, string> } = {}): Reply {
  const pieces = Math.max(1, opt.pieces ?? 3)
  const step = opt.step ?? 1000
  const size = Math.ceil(text.length / pieces) || 1
  const chunks: SseChunk[] = []
  for (let i = 0, k = 0; i < text.length; i += size, k++) chunks.push({ at: (k + 1) * step, data: sseDelta(text.slice(i, i + size)) })
  const end = opt.end ?? 'done'
  const at = (chunks.length + 1) * step
  if (end === 'done') chunks.push({ at, data: 'data: [DONE]\n\n' })
  if (end === 'finish') chunks.push({ at, data: sseDelta('', 'stop') })
  return { sse: chunks, headers: opt.headers }
}

export const jsonReply = (text: string, extra: { status?: number; headers?: Record<string, string> } = {}): Reply => ({
  json: { choices: [{ message: { content: text } }] },
  ...extra,
})

/** 按提示词种类判定是哪一步的调用。 */
export function kindOf(prompt: string): 'card' | 'plan' | 'scene' | 'batch' | 'ep' | 'check' | 'fix' | 'other' {
  if (prompt.startsWith('你是短剧总策划')) return 'card'
  if (prompt.startsWith('你是短剧总编剧')) return 'plan'
  if (prompt.includes('排分场大纲')) return 'scene'
  if (/集的第 \d+–\d+ 场/.test(prompt)) return 'batch'
  if (prompt.startsWith('你是短剧编剧。写《')) return 'ep'
  if (prompt.startsWith('你是短剧审稿')) return 'check'
  if (prompt.startsWith('按下面的审稿意见')) return 'fix'
  return 'other'
}

export interface StoryOpt {
  /** 大纲回的集数（默认按提示词要求）。 */
  episodes?: number
  /** 分场回的场数（默认按提示词要求）。 */
  scenes?: number
  /** 自检结果：每次自检回几条问题（默认 0）。 */
  issues?: (n: number) => number
  /** 修稿长度相对原稿的倍数（默认 1）。 */
  fixRatio?: number
  /** 某次调用改用指定回应（n 为全局调用序号）。 */
  override?: (req: Req, kind: ReturnType<typeof kindOf>) => Reply | undefined
  /** 改成整段 JSON 回应（非流式）。 */
  plain?: boolean
  /** 流式分片间隔。 */
  step?: number
  /** 大纲里不带 cast。 */
  noCast?: boolean
}

/** 模拟写作模型：按提示词种类回策划卡、大纲、分场、剧本、自检、修稿。 */
export function storyServer(opt: StoryOpt = {}): Responder {
  const count: Record<string, number> = {}
  return (req) => {
    const kind = kindOf(req.prompt)
    const c = (count[kind] = (count[kind] ?? 0) + 1)
    const o = opt.override?.(req, kind)
    if (o) return o
    let text: string
    if (kind === 'card') {
      text = '好的，策划卡如下：' + JSON.stringify({
        title: ' 牌名 ', logline: '卡梗概', mystery: '谜底',
        rules: { power: '董事会', stakes: '股份', spaces: '公司→家族', evidence: '合同', limit: '只能用三次', address: '从全名到昵称' },
        cast: [
          { name: '林晚', role: '女主', age: 26, look: '短发', want: '夺回公司', flaw: '急躁', voice: '直来直去' },
          { name: '顾沉', role: '男主', age: 29, look: '西装', want: '', flaw: '多疑' },
          { name: '', role: '配角' },
          { name: ' 周叔 ', role: '', age: 0, voice: '慢' },
        ],
      }) + '\n以上'
    } else if (kind === 'plan') {
      const n = opt.episodes ?? +(/规划一部 (\d+) 集/.exec(req.prompt)?.[1] ?? 3)
      text = '<think>先想想</think>' + JSON.stringify({
        title: ' 剧名甲 ', logline: '一句话梗概',
        ...(opt.noCast ? {} : { cast: [{ name: ' 沈星 ', role: '女主', age: 24, bio: '24 岁的设计师' }, { name: '陆川', bio: '对手' }, { role: '无名' }, null] }),
        episodes: Array.from({ length: n }, (_, i) => (i % 3 === 2 ? { title: '', event: `事件${i + 1}` } : { title: `集${i + 1}`, event: `事件${i + 1}`, hook: `钩子${i + 1}` })),
      })
    } else if (kind === 'scene') {
      const n = opt.scenes ?? +(/正好 (\d+) 场/.exec(req.prompt)?.[1] ?? 3)
      text = JSON.stringify({ scenes: Array.from({ length: n + 1 }, (_, k) => ({ time: '夜', place: `地点${k % 3}`, io: '内', people: ['沈星'], card: k === 1 ? '次日夜' : '', beat: `第${k + 1}场的事` })) })
    } else if (kind === 'batch') {
      const m = /第 (\d+) 集的第 (\d+)–(\d+) 场/.exec(req.prompt)!
      text = `${m[1]}-${m[2]} 夜／地点（内）／沈星\n△ 场 ${m[2]} 到 ${m[3]}（第 ${c} 次）\n沈星（冷）：台词${c}`
    } else if (kind === 'ep') {
      const m = /第 (\d+) 集/.exec(req.prompt)!
      text = `${m[1]}-1 夜／地点（内）／沈星\n△ 动作\n沈星（笑）：第 ${m[1]} 集台词（第 ${c} 次）`
    } else if (kind === 'check') {
      const k = opt.issues?.(c) ?? 0
      text = JSON.stringify({ issues: [...Array.from({ length: k }, (_, j) => ({ where: `场${j + 1}`, problem: `问题${j + 1}`, fix: `改法${j + 1}` })), { where: '空' }] })
    } else if (kind === 'fix') {
      const orig = /原剧本：\n([\s\S]*?)\n\n【底线】/.exec(req.prompt)?.[1] ?? ''
      const ratio = opt.fixRatio ?? 1
      text = ('改：' + orig).slice(0, Math.max(1, Math.floor(orig.length * ratio)))
    } else {
      text = '其他回复'
    }
    return opt.plain ? jsonReply(text) : sseReply(text, { step: opt.step })
  }
}

/* ---------- 旧引擎（vm） ---------- */

export interface Side {
  clock: Clock
  trace: Trace
  storage: RecStorage
  fetch: StubFetch
}

export interface LegacyEngine extends Side {
  ctx: vm.Context
  /** 调旧页面全局函数，返回值原样（vm 里的对象）。 */
  call(name: string, ...args: unknown[]): any
  run(code: string): any
  /** 旧 viewVibeScript 的分支结果。 */
  view(wid: string): string
  /** 在旧页面里执行一段会进入 viewVibeScript 的代码（如按钮处理），返回分支结果。 */
  act(code: string): string
  /** 旧页面渲染时挂到 document.getElementById(id) 上的元素（可取 onclick 调用）。 */
  elements: Record<string, any>
  drive(wid: string): Promise<unknown>
}

export interface SideOptions {
  /** 预置 localStorage（键不带 pl. 前缀，值写 JSON）。 */
  storage?: Record<string, unknown>
  /** 每一边各自新建一个回应器（回应器可以有状态）。 */
  server?: () => Responder
  /** 预置 localStorage 原文（键带 pl. 前缀），在 storage 之后写入。 */
  raw?: Record<string, string>
  /** 时钟起点（默认 T0）。 */
  now?: number
  apiBase?: string
  random?: number[]
}

function seedStorage(s: RecStorage, init: Record<string, unknown> = {}): void {
  for (const [k, v] of Object.entries(init)) s.setItem('pl.' + k, JSON.stringify(v))
}

let legacySource: string | null = null
let legacySourceBase: string | undefined

/** 旧页面顶层声明 + 渲染层桩，在新的 vm 上下文里运行。 */
export function legacyEngine(opt: SideOptions = {}): LegacyEngine {
  if (legacySource === null || legacySourceBase !== opt.apiBase) {
    legacySource = legacyTopLevel({ data: loadData(), apiBase: opt.apiBase })
    legacySourceBase = opt.apiBase
  }
  const clock = new Clock()
  const trace = new Trace(clock)
  const storage = new RecStorage()
  seedStorage(storage, opt.storage)
  for (const [k, v] of Object.entries(opt.raw || {})) storage.setItem(k, v)
  if (opt.now !== undefined) clock.now = opt.now
  storage.trace = trace
  clock.trace = trace
  const fetch = makeFetch(clock, trace, (opt.server ?? (() => storyServer()))())
  const view = { innerHTML: '' }
  const elements: Record<string, any> = {}
  const dummy = (): any => ({ focus() {}, classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [] })
  const document = {
    getElementById: (id: string) => (id === 'view' ? view : id === 'gwT' ? null : (elements[id] ||= dummy())),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    body: dummy(),
  }
  const seq = opt.random ?? [0.5]
  let ri = 0
  const sandbox: Record<string, unknown> = {
    console,
    location: { hash: '', search: '', pathname: '/', href: 'http://localhost/' },
    history: { replaceState() {} },
    localStorage: storage,
    sessionStorage: new MemoryStorage(),
    document,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    fetch,
    AbortController,
    TextDecoder,
    TextEncoder,
    URLSearchParams,
    __now: () => clock.now,
    __rand: () => seq[ri++ % seq.length],
    __ev: (name: string, arg?: unknown) => trace.push({ k: 'ev', name, ...(arg !== undefined ? { arg } : {}) }),
    __view: view,
  }
  sandbox.window = sandbox
  sandbox.self = sandbox
  const ctx = vm.createContext(sandbox)
  vm.runInContext(legacySource, ctx, { filename: 'legacy-site-template.js' })
  vm.runInContext(
    `Date.now=()=>__now(); Math.random=()=>__rand();
     drawAccount=function(){}; drawNav=function(){};
     openLogin=function(){ __ev('openLogin'); };
     toast=function(t){ __ev('toast', t); };
     cloudPush=function(){ __ev('push'); };
     yqRefresh=function(wid){ __ev('refresh', wid); };
     vibeData=function(){ throw { __ready: 1 }; };
     { const g=genWait, l=loginGate, f=genFail;
       genWait=function(v,w,t){ __ev('phase','wait'); return g(v,w,t); };
       loginGate=function(v,w,t){ __ev('phase','login'); return l(v,w,t); };
       genFail=function(v,w,t){ __ev('phase','fail'); return f(v,w,t); }; }`,
    ctx,
  )
  const call = (name: string, ...args: unknown[]) => (vm.runInContext(name, ctx) as (...a: unknown[]) => unknown)(...args)
  return {
    clock, trace, storage, fetch, ctx, call, elements,
    run: (code) => vm.runInContext(code, ctx),
    view(wid) {
      return this.act(`viewVibeScript(${JSON.stringify(wid)})`)
    },
    act(code) {
      view.innerHTML = ''
      const before = trace.events.length
      try {
        vm.runInContext(code, ctx)
      } catch (e) {
        if ((e as { __ready?: number }).__ready) {
          trace.push({ k: 'ev', name: 'phase', arg: 'ready' })
          return 'ready'
        }
        throw e
      }
      if (view.innerHTML.includes('找不到这部作品')) {
        trace.push({ k: 'ev', name: 'phase', arg: 'missing' })
        return 'missing'
      }
      const last = trace.events.slice(before).filter((e) => e.k === 'ev' && e.name === 'phase').pop() as { arg?: unknown } | undefined
      return String(last?.arg)
    },
    drive: (wid) => call('yqDrive', wid) as Promise<unknown>,
  }
}

/* ---------- 新引擎 ---------- */

export interface FreshEngine extends Side {
  engine: WritingEngine
  deps: WritingDeps
  rng: () => number
  dispose(): void
}

/** 新引擎：存储走真实 lib/storage（globalThis.localStorage 换成 RecStorage），其余依赖接虚拟时钟与 fetch 桩。 */
export function freshEngine(opt: SideOptions = {}): FreshEngine {
  const clock = new Clock()
  const trace = new Trace(clock)
  const storage = new RecStorage()
  seedStorage(storage, opt.storage)
  for (const [k, v] of Object.entries(opt.raw || {})) storage.setItem(k, v)
  if (opt.now !== undefined) clock.now = opt.now
  storage.trace = trace
  clock.trace = trace
  const fetch = makeFetch(clock, trace, (opt.server ?? (() => storyServer()))())
  ;(globalThis as { localStorage?: unknown }).localStorage = storage
  const unhook = setWorksPushHook(() => trace.push({ k: 'ev', name: 'push' }))
  const deps: WritingDeps = {
    fetch,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: () => clock.now,
    storage: { get, set, remove } as WritingStorage,
    apiBase: () => opt.apiBase ?? '',
    openLogin: () => trace.push({ k: 'ev', name: 'openLogin' }),
    toast: (t) => trace.push({ k: 'ev', name: 'toast', arg: t }),
  }
  const engine = createWritingEngine(deps)
  const seq = opt.random ?? [0.5]
  let ri = 0
  return { clock, trace, storage, fetch, engine, deps, rng: () => seq[ri++ % seq.length], dispose: unhook }
}

/** 订阅新引擎的 refresh 计数，每加 1 记一条 refresh 事件（对应旧 yqRefresh）。 */
export function watchRefresh(f: FreshEngine, wid: string): () => void {
  let last = f.engine.getState(wid).refresh
  return f.engine.subscribe(wid, () => {
    const s = f.engine.getState(wid)
    for (; last < s.refresh; last++) f.trace.push({ k: 'ev', name: 'refresh', arg: wid })
  })
}

/** 跨 vm 的值转成当前领域的普通值（经 JSON）。 */
export const plain = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

/** 错误规整：消息与 retry 标记。 */
export const errView = (e: any) => ({ message: String(e?.message), retry: e?.retry })

/** 定时器编号换成首次出现的顺序号，便于比较两边（新旧两边各自的编号起点可能不同）。 */
export function normTrace(events: TraceEvent[]): TraceEvent[] {
  const ids = new Map<number, number>()
  const id = (x: number) => {
    if (!ids.has(x)) ids.set(x, ids.size + 1)
    return ids.get(x)
  }
  return events.map((e) => (e.k === 'timer' || e.k === 'clear' ? { ...e, id: id(e.id) } : e)) as TraceEvent[]
}

/** 跑到 p 结束（或时钟没有定时器）。返回是否结束。 */
export async function settle(side: Side, p: Promise<unknown>, limitMs?: number): Promise<boolean> {
  let done = false
  p.then(
    () => (done = true),
    () => (done = true),
  )
  await side.clock.run(() => done, limitMs)
  return done
}
