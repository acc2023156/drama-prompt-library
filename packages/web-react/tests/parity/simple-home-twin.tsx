import { act, fireEvent, render } from '@testing-library/react'
import { parse } from 'acorn'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { vi } from 'vitest'
import { SimpleHomePage } from '../../src/features/simple/home/SimpleHomePage'
import { resetHot } from '../../src/features/simple/home/hot'
import { setWorksPushHook } from '../../src/lib/storage'
import { getToast, subscribeToast } from '../../src/lib/toast'
import { LEGACY_TEMPLATE, loadData } from './simple-home-data'

/**
 * 标准版首页的新旧双跑：旧 viewScriptSimple 在独立 jsdom 窗口里真跑（innerHTML + onclick），
 * 新组件渲染在测试环境的 jsdom 里；两边用同一份 localStorage 种子、同一随机序列、同一时间、同一 /hot 打桩，
 * 同一操作后比较 DOM（逐节点）、localStorage 原文、hash、请求、提示条、滚动与动画速率。
 */

// jsdom 没有类型声明（不新增依赖），按 any 使用
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: any }

/*
 * 本文件在 jsdom 环境（.test.tsx）里运行；P0 的 legacy.ts、plugins/load-data.ts 用 new URL(…, import.meta.url) 取路径，
 * jsdom 下全局 URL 被替换，import 即抛错，所以这里自带路径、数据与抽取逻辑（抽取规则与 legacy.ts 的 extractTopLevel 相同）。
 */
const SKIP_NAMES = new Set(['account', 'accountTrigger', 'SpeechRec'])
function declaredNames(p: any, out: string[] = []): string[] {
  if (p.type === 'Identifier') out.push(p.name)
  else if (p.type === 'ObjectPattern') p.properties.forEach((x: any) => declaredNames(x.value ?? x.argument, out))
  else if (p.type === 'ArrayPattern') p.elements.forEach((e: any) => e && declaredNames(e, out))
  else if (p.type === 'AssignmentPattern') declaredNames(p.left, out)
  else if (p.type === 'RestElement') declaredNames(p.argument, out)
  return out
}
/** 顶层只保留函数、类、变量声明；表达式语句（启动副作用）与依赖 DOM 的常量丢掉。 */
function extractTopLevel(script: string): string {
  const kept: string[] = []
  for (const node of parse(script, { ecmaVersion: 'latest', sourceType: 'script' }).body as any[]) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') kept.push(script.slice(node.start, node.end))
    else if (node.type === 'VariableDeclaration') {
      if (!node.declarations.flatMap((d: any): string[] => declaredNames(d.id)).some((n: string) => SKIP_NAMES.has(n))) kept.push(script.slice(node.start, node.end))
    }
  }
  return kept.join('\n')
}

const NOW = 1795500000000
/** 固定随机序列（循环）：覆盖 0 附近与接近 1 的值。 */
export const RANDOM_SEQ = [0.12, 0.87, 0.45, 0.03, 0.66, 0.99, 0.31, 0.58, 0.74, 0.2]

/** 打桩的 /hot：undefined = 503；对象 = 200 + JSON；gated(对象) = 等 release() 后才返回。 */
export type HotStub = unknown | undefined
const GATED = Symbol('gated')
export const gated = (data: unknown) => ({ [GATED]: data })
let gates: (() => void)[] = []

export interface Observed {
  html: unknown
  storage: Record<string, string>
  hash: string
  fetches: string[]
  toasts: string[]
  scrolls: string[]
  rates: number[]
  pushes: number
}

let scriptCache: string | null = null
function legacySource(): string {
  if (scriptCache) return scriptCache
  const html = readFileSync(LEGACY_TEMPLATE, 'utf8')
  const open = '\n<script>\n'
  const start = html.indexOf(open), end = html.lastIndexOf('\n</script>')
  if (start < 0 || end < start || html.indexOf(open, start + 1) >= 0) throw new Error('site-template.html 里没有找到唯一的内联 <script>')
  const script = html.slice(start + open.length, end)
  const withData = script.replace('/*__DATA__*/null', () => JSON.stringify(loadData())).replace("/*__API_BASE__*/''", () => JSON.stringify(''))
  return (scriptCache = extractTopLevel(withData))
}

/** 元素的可比较结构：标签、属性（class 排序、style 取解析后的 cssText、空 class/style 视为无）、input 的当前值、子节点（合并相邻文本、去掉纯空白文本、空白折叠）。 */
export function snap(node: Node): unknown {
  if (node.nodeType !== 1) return null
  const el = node as HTMLElement
  const attrs: [string, string][] = []
  for (const a of Array.from(el.attributes)) {
    let v = a.value
    if (a.name === 'class') v = v.split(/\s+/).filter(Boolean).sort().join(' ')
    if (a.name === 'style') v = el.style.cssText
    if (a.name === 'value' && el.tagName === 'INPUT') continue
    if ((a.name === 'class' || a.name === 'style') && !v) continue
    attrs.push([a.name, v])
  }
  if (el.tagName === 'INPUT') attrs.push(['.value', (el as HTMLInputElement).value])
  attrs.sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const kids: unknown[] = []
  let text = ''
  const flush = () => {
    if (text.trim()) kids.push(text.replace(/\s+/g, ' '))
    text = ''
  }
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === 3) text += c.nodeValue
    else if (c.nodeType === 1) {
      flush()
      kids.push(snap(c))
    }
  }
  flush()
  return { tag: el.tagName.toLowerCase(), attrs, kids }
}

const describeEl = (el: Element, opt: unknown) => `${el.id || el.className}|${JSON.stringify(opt)}`

function dumpStorage(s: Storage): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i)!
    out[k] = s.getItem(k)!
  }
  return out
}

function hotFetch(hot: HotStub, log: string[]) {
  return (url: string) => {
    log.push(String(url))
    if (hot === undefined) return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ error: 'hot unavailable' }) })
    const g = (hot as Record<symbol, unknown>)[GATED]
    const resp = { ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(g ?? hot))) }
    return g ? new Promise((res) => gates.push(() => res(resp))) : Promise.resolve(resp)
  }
}

function seqRandom() {
  let k = 0
  return () => RANDOM_SEQ[k++ % RANDOM_SEQ.length]
}

/** 一侧页面的操作接口。 */
interface Side {
  root(): HTMLElement
  doc: Document
  win: Window & typeof globalThis
  observe(): Observed
}

class OldSide implements Side {
  dom: any
  win: any
  doc: Document
  fetches: string[] = []
  scrolls: string[] = []
  rates: number[] = []
  pushes = 0
  toasts: string[] = []
  timers: { at: number; fn: () => void }[] = []
  clock = 0
  perfNow = 1000
  constructor(seed: Record<string, string>, hot: HotStub) {
    this.dom = new JSDOM('<!doctype html><html><body><div class="wrap" id="view"></div><div class="toast" id="toast"></div></body></html>', {
      url: 'http://localhost/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    })
    const w = (this.win = this.dom.window)
    const self = this
    this.doc = w.document
    for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, v)
    w.fetch = hotFetch(hot, this.fetches)
    w.matchMedia = () => ({ matches: false })
    w.Element.prototype.scrollIntoView = function (this: Element, opt: unknown) {
      self.scrolls.push(describeEl(this, opt))
    }
    w.Element.prototype.getAnimations = function () {
      return [{ set playbackRate(v: number) { self.rates.push(v) } }]
    }
    // 定时器改成手动推进，便于与新组件的假定时器对齐
    w.setTimeout = (fn: () => void, ms = 0) => {
      this.timers.push({ at: this.clock + ms, fn })
      return this.timers.length
    }
    w.clearTimeout = () => {}
    w.requestAnimationFrame = (fn: () => void) => w.setTimeout(fn, 16)
    Object.defineProperty(w.performance, 'now', { configurable: true, value: () => this.perfNow })
    w.__rnd = seqRandom()
    const ctx = this.dom.getInternalVMContext()
    vm.runInContext('Math.random = () => window.__rnd(); Date.now = () => ' + NOW + ';', ctx)
    vm.runInContext(legacySource(), ctx, { filename: 'legacy-site-template.js' })
    w.cloudPush = () => {
      this.pushes++
    }
    const toast = w.toast
    w.toast = (text: string) => {
      this.toasts.push(text)
      toast(text)
    }
    vm.runInContext('viewScriptSimple()', ctx)
  }
  root() {
    return this.doc.getElementById('view')!
  }
  advance(ms: number) {
    this.clock += ms
    for (;;) {
      const due = this.timers.filter((t) => t.at <= this.clock).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      this.timers.splice(this.timers.indexOf(due), 1)
      due.fn()
    }
  }
  observe(): Observed {
    return {
      html: snap(this.root()),
      storage: dumpStorage(this.win.localStorage),
      hash: this.win.location.hash,
      fetches: this.fetches.slice(),
      toasts: this.toasts.slice(),
      scrolls: this.scrolls.slice(),
      rates: this.rates.slice(),
      pushes: this.pushes,
    }
  }
}

class NewSide implements Side {
  doc = document
  win = window
  fetches: string[] = []
  scrolls: string[] = []
  rates: number[] = []
  pushes = 0
  toasts: string[] = []
  unToast: () => void
  container: HTMLElement
  perfNow = 1000
  constructor(seed: Record<string, string>, hot: HotStub) {
    localStorage.clear()
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
    resetHot()
    vi.stubGlobal('fetch', hotFetch(hot, this.fetches))
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const self = this
    Element.prototype.scrollIntoView = function (this: Element, opt?: unknown) {
      self.scrolls.push(describeEl(this, opt))
    } as never
    Element.prototype.getAnimations = function () {
      return [{ set playbackRate(v: number) { self.rates.push(v) } }] as never
    }
    vi.spyOn(performance, 'now').mockImplementation(() => this.perfNow)
    vi.spyOn(Math, 'random').mockImplementation(seqRandom())
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    setWorksPushHook(() => {
      this.pushes++
    })
    this.unToast = subscribeToast(() => {
      if (getToast().show) this.toasts.push(getToast().text)
    })
    const view = document.createElement('div')
    view.className = 'wrap'
    view.id = 'view'
    document.body.append(view)
    this.container = render(<SimpleHomePage />, { container: view }).container as HTMLElement
  }
  root() {
    return this.container
  }
  observe(): Observed {
    return {
      html: snap(this.root()),
      storage: dumpStorage(localStorage),
      hash: location.hash,
      fetches: this.fetches.slice(),
      toasts: this.toasts.slice(),
      scrolls: this.scrolls.slice(),
      rates: this.rates.slice(),
      pushes: this.pushes,
    }
  }
}

export interface Twin {
  old: OldSide
  neu: NewSide
  /** 两边各自取元素：selector + 第几个。 */
  click(selector: string, n?: number): Promise<void>
  input(selector: string, value: string): Promise<void>
  mouse(type: 'mouseenter' | 'mouseleave' | 'mousemove', init?: MouseEventInit): Promise<void>
  /** 等 /hot 等异步完成。 */
  settle(): Promise<void>
  /** 放行 gated 的 /hot 响应并等待完成。 */
  release(): Promise<void>
  /** 推进定时器（旧页面手动队列；新组件 vi 假定时器）。 */
  advance(ms: number): Promise<void>
  /** 断言两边全部可观测状态相等，返回旧页面的观测值。 */
  same(): Observed
}

function pickEl(side: Side, selector: string, n = 0): HTMLElement {
  const els = side.root().querySelectorAll<HTMLElement>(selector)
  if (!els[n]) throw new Error(`${side instanceof OldSide ? '旧' : '新'}页面找不到 ${selector}[${n}]`)
  return els[n]
}

/** 建立一对新旧页面。调用前需 vi.useFakeTimers({ toFake: FAKE })（新组件侧），用后 teardown(t)。 */
export const FAKE = ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] as const
export async function twin(seed: Record<string, string> = {}, hot?: HotStub, expectFn?: (a: unknown, b: unknown, msg: string) => void): Promise<Twin> {
  location.hash = ''
  // React 的 act 首次走异步路径时会调用一次 Math.random（enqueueTask 里取 setImmediate），先预热，免得吃掉随机序列
  await act(async () => {})
  const old = new OldSide(seed, hot)
  let neu!: NewSide
  await act(async () => {
    neu = new NewSide(seed, hot)
  })
  const t: Twin = {
    old,
    neu,
    async click(selector, n = 0) {
      pickEl(old, selector, n).click()
      await act(async () => {
        fireEvent.click(pickEl(neu, selector, n))
      })
    },
    async input(selector, value) {
      const o = pickEl(old, selector) as HTMLInputElement
      o.value = value
      o.dispatchEvent(new old.win.Event('input', { bubbles: true }))
      await act(async () => {
        fireEvent.input(pickEl(neu, selector), { target: { value } })
      })
    },
    async mouse(type, init = {}) {
      const o = pickEl(old, '#orbitStage')
      const MouseEv = old.win.MouseEvent
      o.dispatchEvent(new MouseEv(type, { bubbles: type === 'mousemove', ...init }))
      const nEl = pickEl(neu, '#orbitStage')
      await act(async () => {
        if (type === 'mouseenter') fireEvent.mouseEnter(nEl, init)
        else if (type === 'mouseleave') fireEvent.mouseLeave(nEl, init)
        else fireEvent.mouseMove(nEl, init)
      })
    },
    async settle() {
      for (let i = 0; i < 20; i++) await new Promise<void>((r) => queueMicrotask(r))
      await act(async () => {
        for (let i = 0; i < 20; i++) await Promise.resolve()
      })
    },
    async release() {
      const g = gates
      gates = []
      g.forEach((fn) => fn())
      await t.settle()
    },
    async advance(ms) {
      old.advance(ms)
      await act(async () => {
        vi.advanceTimersByTime(ms)
      })
    },
    same() {
      const a = old.observe(), b = neu.observe()
      const eq = expectFn || ((x, y, m) => {
        if (JSON.stringify(x) !== JSON.stringify(y)) throw new Error(m)
      })
      eq(b.html, a.html, 'DOM')
      eq(b.storage, a.storage, 'localStorage')
      eq(b.hash, a.hash, 'location.hash')
      eq(b.fetches, a.fetches, '请求')
      eq(b.toasts, a.toasts, '提示条')
      eq(b.scrolls, a.scrolls, '滚动')
      eq(b.rates, a.rates, '动画速率')
      eq(b.pushes, a.pushes, 'works 推送钩子')
      return a
    },
  }
  return t
}

export function teardown(t?: Twin): void {
  gates = []
  t?.neu.unToast()
  setWorksPushHook(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  location.hash = ''
  document.getElementById('view')?.remove()
}
