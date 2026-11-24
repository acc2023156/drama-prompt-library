import * as jsdomModule from 'jsdom'
import { act, fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'
import { RouteView } from '../../src/app/RouteView'
import { useRoute } from '../../src/app/useRoute'
import { setWorksPushHook } from '../../src/lib/storage'
import { getToast, subscribeToast } from '../../src/lib/toast'
import { loadData } from './data'
import { legacyHtml } from './legacy'

/**
 * 资产库（M03）的新旧双跑：旧页面在独立 jsdom 窗口里整页运行（真实内联脚本、hashchange 路由），
 * 新页面在测试环境的 jsdom 里经 RouteView 按 hash 渲染（与 App 一样每次 hashchange 重新挂载）。
 * 两边用同一份 localStorage 种子与同一组桩（时钟、定时器、confirm、剪贴板、FileReader、语音识别、元素尺寸、样式），
 * 每步操作后比较 #view 的 DOM（逐节点）、localStorage 原文、location.hash、请求、提示条、confirm 提问、剪贴板写入。
 */

// tests/parity/jsdom.d.ts 只声明了 JSDOM 的一小部分，这里按 any 取用（同 legacy-page.ts）
const { JSDOM, VirtualConsole } = jsdomModule as any

export const NOW = 1795500000000

export interface TwinOptions {
  /** localStorage 种子：键不带前缀，值按 JSON 写入（字符串原文请用 raw）。 */
  seed?: Record<string, unknown>
  /** 原文种子：键带 pl. 前缀，值原样写入。 */
  raw?: Record<string, string>
  /** confirm() 依次的回答，用完后默认 true。 */
  confirms?: boolean[]
  /** 有语音识别（SpeechRecognition）；'throws' = start() 抛错。 */
  speech?: boolean | 'throws'
  /** 剪贴板 writeText 失败（走 execCommand 退路）。 */
  clipboardFails?: boolean
  /** 连线层被样式隐藏（手机宽度）。 */
  wiresHidden?: boolean
}

export interface Observed {
  html: unknown
  storage: Record<string, string>
  hash: string
  fetches: string[]
  toasts: string[]
  confirms: string[]
  clips: string[]
  execs: string[]
  speech: string[]
}

/**
 * #view 的可比较结构：标签、属性（class 排序、style 取 CSSOM 解析后的 cssText、空 class/style 视为无）、子节点（合并相邻文本、去掉纯空白文本、空白折叠）。
 * 表单控件比较当前值：input、textarea、select 取 .value，option 取 .selected；textarea 的子文本是初始值（React 与旧页面写法不同），不比较。
 * 不比较两个旧页面内部钩子：复制按钮的 data-cp（绑事件用，同 dom-tree.ts；新页面用 CopyButton）；返回按钮的 data-dirty
 * （旧 backDirty 的状态标记，样式表不用它，可见的“储存并返回”文字与 dirty 类照常比较；新页面由 BackBar 的 dirty 属性表达）。
 */
export function snap(node: Node): unknown {
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const attrs: [string, string][] = []
  for (const a of Array.from(el.attributes)) {
    let v = a.value
    if (a.name === 'data-cp' || a.name === 'data-dirty' || a.name === 'selected') continue
    if (a.name === 'value' && (tag === 'input' || tag === 'textarea')) continue
    if (a.name === 'class') v = v.split(/\s+/).filter(Boolean).sort().join(' ')
    if (a.name === 'style') v = el.style.cssText
    if ((a.name === 'class' || a.name === 'style') && !v) continue
    attrs.push([a.name, v])
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') attrs.push(['.value', (el as HTMLInputElement).value])
  if (tag === 'option') attrs.push(['.selected', String((el as HTMLOptionElement).selected)])
  attrs.sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const kids: unknown[] = []
  let text = ''
  const flush = () => {
    if (text.trim()) kids.push(text.replace(/\s+/g, ' '))
    text = ''
  }
  if (tag !== 'textarea')
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 3) text += c.nodeValue
      else if (c.nodeType === 1) {
        flush()
        kids.push(snap(c))
      }
    }
  flush()
  return { tag, attrs, kids }
}

function dump(s: Storage): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < s.length; i++) out[s.key(i)!] = s.getItem(s.key(i)!)!
  return out
}

/** 元素尺寸桩：按 id / data-in 给出固定矩形，两边相同，连线坐标因此可比较；layout.dy 模拟窗口尺寸变化后的位移。 */
const layout = { dy: 0 }
function rectOf(el: Element): DOMRect {
  const r = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect
  if (el.id === 'graph') return r(40, 120, 960, 420)
  if (el.id === 'out') return r(640, 150, 320, 300.5)
  const k = el.getAttribute('data-in')
  if (k != null) return r(60, 140 + layout.dy + (k === 't' ? 3 : +k) * 110.25, 280, 96)
  return r(0, 0, 0, 0)
}

/** FileReader 桩：读成 data: 地址，结果在 flushReads() 时同时交付，两边顺序一致。 */
function fakeReader(pending: (() => void)[]) {
  return class {
    result: string | null = null
    onload: (() => void) | null = null
    readAsDataURL(file: { name: string; type: string }) {
      pending.push(() => {
        this.result = `data:${file.type};base64,${btoa(encodeURIComponent(file.name))}`
        this.onload?.()
      })
    }
  }
}

/** 语音识别桩：记录调用；emit() 推送识别结果，end() 结束。 */
export interface FakeRecs {
  list: any[]
}
function fakeSpeech(mode: true | 'throws', recs: FakeRecs, log: string[]) {
  return class {
    lang = ''
    interimResults = false
    continuous = false
    onresult: ((e: unknown) => void) | null = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor() {
      recs.list.push(this)
    }
    start() {
      log.push(`start ${this.lang} ${this.interimResults} ${this.continuous}`)
      if (mode === 'throws') throw new Error('not allowed')
    }
    stop() {
      log.push('stop')
      this.onend?.()
    }
  }
}

interface Side {
  root(): HTMLElement
  win: any
  fetches: string[]
  toasts: string[]
  confirms: string[]
  clips: string[]
  execs: string[]
  speech: string[]
  recs: FakeRecs
  reads: (() => void)[]
}

function observe(s: Side): Observed {
  return {
    html: snap(s.root()),
    storage: dump(s.win.localStorage),
    hash: s.win.location.hash,
    fetches: s.fetches.slice(),
    toasts: s.toasts.slice(),
    confirms: s.confirms.slice(),
    clips: s.clips.slice(),
    execs: s.execs.slice(),
    speech: s.speech.slice(),
  }
}

/** 两边共用的桩：装到指定 window 上。 */
function stubWindow(w: any, side: Side, opt: TwinOptions) {
  const answers = [...(opt.confirms || [])]
  w.confirm = (m: string) => {
    side.confirms.push(m)
    return answers.length ? answers.shift() : true
  }
  w.fetch = (url: string) => {
    side.fetches.push(String(url))
    return new Promise(() => {})
  }
  Object.defineProperty(w.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (t: string) => {
        if (opt.clipboardFails) return Promise.reject(new Error('denied'))
        side.clips.push(t)
        return Promise.resolve()
      },
    },
  })
  w.document.execCommand = (cmd: string) => {
    // 旧 copyText 的退路：临时 textarea 挂在 body 末尾，选中后 execCommand('copy')
    const ta = w.document.body.lastElementChild
    side.execs.push(`${cmd}:${ta?.tagName === 'TEXTAREA' ? ta.value : ''}`)
    return true
  }
  w.FileReader = fakeReader(side.reads)
  if (opt.speech) w.SpeechRecognition = fakeSpeech(opt.speech, side.recs, side.speech)
  else delete w.SpeechRecognition
  w.Element.prototype.getBoundingClientRect = function (this: Element) {
    return rectOf(this)
  }
  const gcs = w.getComputedStyle.bind(w)
  w.getComputedStyle = (el: Element) => (opt.wiresHidden && el.id === 'wires' ? { display: 'none' } : gcs(el))
}

const newSide = (): Side => ({ root: () => null as never, win: null, fetches: [], toasts: [], confirms: [], clips: [], execs: [], speech: [], recs: { list: [] }, reads: [] })

class OldSide {
  s = newSide()
  timers: { at: number; fn: () => void }[] = []
  clock = 0
  errors: string[] = []
  constructor(opt: TwinOptions, storage: Record<string, string>) {
    const self = this
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', (e: Error) => this.errors.push(String(e.stack || e)))
    const dom = new JSDOM(legacyHtml({ data: loadData() }), {
      url: 'http://localhost/#/partner',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(w: any) {
        self.s.win = w
        stubWindow(w, self.s, opt)
        w.scrollTo = () => {}
        w.Element.prototype.scrollIntoView = () => {}
        w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
        // 定时器改成手动推进，与新页面的假定时器对齐
        w.setTimeout = (fn: () => void, ms = 0) => {
          self.timers.push({ at: self.clock + ms, fn })
          return self.timers.length
        }
        w.clearTimeout = () => {}
        w.requestAnimationFrame = (fn: () => void) => w.setTimeout(fn, 16)
        const RealDate = w.Date
        w.Date = class extends RealDate {
          constructor(...a: unknown[]) {
            if (a.length) super(...(a as []))
            else super(NOW)
          }
          static now() {
            return NOW
          }
        }
      },
    })
    const w = dom.window
    const toast = w.toast
    w.toast = (t: string) => {
      this.s.toasts.push(t)
      toast(t)
    }
    w.localStorage.clear()
    for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v)
    this.s.root = () => w.document.getElementById('view')
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
}

function Routed() {
  const { route, rev } = useRoute()
  return <RouteView key={rev} route={route} />
}

class NewSide {
  s = newSide()
  unToast: () => void
  saved: { rect: typeof Element.prototype.getBoundingClientRect; gcs: typeof getComputedStyle; exec: unknown }
  constructor(opt: TwinOptions, storage: Record<string, string>) {
    this.saved = { rect: Element.prototype.getBoundingClientRect, gcs: window.getComputedStyle, exec: document.execCommand }
    this.s.win = window
    localStorage.clear()
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v)
    stubWindow(window, this.s, opt)
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    setWorksPushHook(() => {})
    this.unToast = subscribeToast(() => {
      if (getToast().show) this.s.toasts.push(getToast().text)
    })
    const view = document.createElement('div')
    view.className = 'wrap'
    view.id = 'view'
    document.body.append(view)
    render(<Routed />, { container: view })
    this.s.root = () => view
  }
  restore() {
    Element.prototype.getBoundingClientRect = this.saved.rect
    window.getComputedStyle = this.saved.gcs
    ;(document as any).execCommand = this.saved.exec
    delete (window as any).SpeechRecognition
    delete (navigator as any).clipboard
    this.unToast()
  }
}

const pick = (root: HTMLElement, sel: string, n: number, who: string) => {
  const el = root.querySelectorAll<HTMLElement>(sel)[n]
  if (!el) throw new Error(`${who}页面找不到 ${sel}[${n}]`)
  return el
}

export interface Twin {
  old: OldSide
  neu: NewSide
  /** 两边都跳到 hash（同用户改地址栏），等路由完成。 */
  go(hash: string): Promise<void>
  click(sel: string, n?: number): Promise<void>
  /** 点页面空白处（document 上的点击）。 */
  clickBody(): Promise<void>
  input(sel: string, value: string): Promise<void>
  choose(sel: string, value: string): Promise<void>
  /** 给第 k 个参考图输入框选文件（name 为空表示取消选择）。 */
  file(k: number, name: string | null, type?: string): Promise<void>
  /** 交付所有挂起的 FileReader 结果。 */
  flushReads(): Promise<void>
  /** 改元素尺寸桩后派发 resize。 */
  resize(dy: number): Promise<void>
  /** 语音识别：最近一个识别器推送结果 / 结束。 */
  speak(parts: string[]): Promise<void>
  speechEnd(): Promise<void>
  advance(ms: number): Promise<void>
  settle(): Promise<void>
  /** 断言两边全部可观测状态相等，返回旧页面的观测值。 */
  same(): Observed
  oldErrors(): string[]
}

/** 让两边的异步流程跑完：jsdom 的 hashchange 用 setImmediate 派发（不在假定时器之列），中间穿插 act 让 React 提交。 */
async function settleBoth() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise<void>((r) => setImmediate(r))
      for (let j = 0; j < 10; j++) await Promise.resolve()
    })
  }
}

/** 建立一对新旧页面并都停在 hash；新页面先改好 hash 再挂载，避免空 hash 的默认首页（标准版）写存储、发请求。 */
export async function twin(opt: TwinOptions, expectFn: (a: unknown, b: unknown, msg: string) => void, hash: string): Promise<Twin> {
  const storage = { ...(opt.raw || {}), ...Object.fromEntries(Object.entries(opt.seed || {}).map(([k, v]) => ['pl.' + k, JSON.stringify(v)])) }
  const old = new OldSide(opt, storage)
  old.s.win.location.hash = hash
  location.hash = hash
  await settleBoth()
  let neu!: NewSide
  await act(async () => {
    neu = new NewSide(opt, storage)
  })
  await settleBoth()
  const both = async (fnOld: () => void, fnNew: () => void) => {
    fnOld()
    await act(async () => {
      fnNew()
    })
    await settleBoth()
  }
  const t: Twin = {
    old,
    neu,
    go: (hash) =>
      both(
        () => {
          old.s.win.location.hash = hash
        },
        () => {
          location.hash = hash
        },
      ),
    click: (sel, n = 0) =>
      both(
        () => pick(old.s.root(), sel, n, '旧').click(),
        () => fireEvent.click(pick(neu.s.root(), sel, n, '新')),
      ),
    clickBody: () =>
      both(
        () => old.s.win.document.body.click(),
        () => fireEvent.click(document.body),
      ),
    input: (sel, value) =>
      both(
        () => {
          const o = pick(old.s.root(), sel, 0, '旧') as HTMLInputElement
          o.value = value
          o.dispatchEvent(new old.s.win.Event('input', { bubbles: true }))
        },
        () => fireEvent.input(pick(neu.s.root(), sel, 0, '新'), { target: { value } }),
      ),
    choose: (sel, value) =>
      both(
        () => {
          const o = pick(old.s.root(), sel, 0, '旧') as HTMLSelectElement
          o.value = value
          o.dispatchEvent(new old.s.win.Event('change', { bubbles: true }))
        },
        () => fireEvent.change(pick(neu.s.root(), sel, 0, '新'), { target: { value } }),
      ),
    file: (k, name, type = 'image/png') => {
      const set = (w: any, el: HTMLInputElement) => {
        const files = name == null ? [] : [new w.File(['x'], name, { type })]
        Object.defineProperty(el, 'files', { configurable: true, value: files })
      }
      return both(
        () => {
          const o = pick(old.s.root(), `[data-file="${k}"]`, 0, '旧') as HTMLInputElement
          set(old.s.win, o)
          o.dispatchEvent(new old.s.win.Event('change', { bubbles: true }))
        },
        () => {
          const n = pick(neu.s.root(), `[data-file="${k}"]`, 0, '新') as HTMLInputElement
          set(window, n)
          fireEvent.change(n)
        },
      )
    },
    flushReads: () =>
      both(
        () => old.s.reads.splice(0).forEach((fn) => fn()),
        () => neu.s.reads.splice(0).forEach((fn) => fn()),
      ),
    resize: (dy) => {
      layout.dy = dy
      return both(
        () => old.s.win.dispatchEvent(new old.s.win.Event('resize')),
        () => window.dispatchEvent(new Event('resize')),
      )
    },
    speak: (parts) => {
      const ev = { results: parts.map((p) => [{ transcript: p }]) }
      return both(
        () => old.s.recs.list.at(-1).onresult(ev),
        () => neu.s.recs.list.at(-1).onresult(ev),
      )
    },
    speechEnd: () =>
      both(
        () => old.s.recs.list.at(-1).onend(),
        () => neu.s.recs.list.at(-1).onend(),
      ),
    advance: (ms) =>
      both(
        () => old.advance(ms),
        () => vi.advanceTimersByTime(ms),
      ),
    settle: settleBoth,
    same() {
      const a = observe(old.s), b = observe(neu.s)
      for (const k of Object.keys(a) as (keyof Observed)[]) expectFn(b[k], a[k], k)
      return a
    },
    oldErrors: () => old.errors.slice(),
  }
  return t
}

export const FAKE = ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] as const

export function teardown(t?: Twin): void {
  layout.dy = 0
  t?.neu.restore()
  setWorksPushHook(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  location.hash = ''
  document.getElementById('view')?.remove()
}
