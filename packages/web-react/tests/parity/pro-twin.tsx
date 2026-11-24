import { act, cleanup, render } from '@testing-library/react'
import * as jsdomModule from 'jsdom'
import vm from 'node:vm'
import { expect, vi } from 'vitest'
import { closeModal, TextModalHost } from '../../src/components/TextModal'
import { ScriptHomePage } from '../../src/features/pro-chat/ScriptHomePage'
import { ScriptFormPage } from '../../src/features/script-form/ScriptFormPage'
import { setWorksPushHook } from '../../src/lib/storage'
import { getToast, subscribeToast } from '../../src/lib/toast'
import { isAccountOpen, setAccount } from '../../src/lib/ui'
import { loadData } from './data'
import { legacyTopLevel } from './legacy'

/**
 * PRO 首页（含作品卡）与五步表单的新旧双跑：旧 viewScriptHome / viewScriptNew 在独立 jsdom 窗口里真跑（innerHTML + onclick），
 * 新组件渲染在测试环境的 jsdom 里。两边用同一份 localStorage 种子与同一组桩：随机序列、时钟、confirm、剪贴板、语音识别、
 * 动态脚本加载（mammoth、pdf.js）、FileReader、滚动、下载；同一操作后比较 DOM（逐节点）、localStorage 原文、hash、
 * 提示条、弹窗、滚动、焦点、语音识别调用、脚本加载、文件读取、复制、下载、登录面板、works 推送次数。
 */

const { JSDOM } = jsdomModule as unknown as { JSDOM: any }

export const NOW = 1795500000000
/** 固定随机序列（循环）。 */
export const RANDOM_SEQ = [0.12, 0.87, 0.45, 0.03, 0.66, 0.99, 0.31, 0.58, 0.74, 0.2]

export type Page = { kind: 'home' } | { kind: 'form'; wid?: string }

/** 动态脚本、文件解析库与语音识别的行为配置（两边相同）。 */
export interface Stubs {
  /** 有浏览器语音识别（缺省 true）。 */
  speech?: boolean
  /** 语音识别 start() 抛错（浏览器不让用）。 */
  speechThrows?: boolean
  /** 某个脚本地址载入失败。 */
  scriptFails?: (src: string) => boolean
  /** mammoth 解析结果；Error 表示解析抛错。 */
  docx?: string | Error
  /** pdf.js 每页的文字项。 */
  pdf?: { str: string; hasEOL?: boolean }[][]
  /** confirm 的回答（缺省 true）。 */
  confirm?: boolean
}

/** 上传的文件：bytes 给 readAnyFile（arrayBuffer），text 给 FileReader.readAsText。 */
export interface FakeFile {
  name: string
  size?: number
  bytes?: Uint8Array
  text?: string
}

export interface Observed {
  html: unknown
  modal: unknown
  storage: Record<string, string>
  hash: string
  toasts: string[]
  scrolls: string[]
  focus: string
  confirms: string[]
  speech: string[]
  scripts: string[]
  libs: string[]
  reads: string[]
  clip: string[]
  downloads: string[]
  login: boolean
  pushes: number
}

let scriptCache: string | null = null
const legacySource = () => (scriptCache ??= legacyTopLevel({ data: loadData() }))

/**
 * 元素的可比较结构：标签、属性（class 排序、style 取解析后的 cssText、空 class / style 视为无）、表单控件的当前值与选中状态、子节点。
 * 归一只处理“同义不同写”：
 * - 相邻文本合并；只含空白且带换行的文本丢弃（旧模板字符串的缩进换行），其余文本逐字比较
 * - input / textarea 的 value 属性与 checked、option 的 selected 属性不比（React 与 innerHTML 写法不同），改比 .value / .checked / .selected 当前值；
 *   textarea 的子文本是初始值（defaultValue），不比，只比当前 .value
 */
export function snap(node: Node | null, skip: ReadonlySet<string> = NONE): unknown {
  if (!node || node.nodeType !== 1) return null
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const attrs: [string, string][] = []
  for (const a of Array.from(el.attributes)) {
    let v = a.value
    if (a.name === 'class') v = v.split(/\s+/).filter(Boolean).sort().join(' ')
    if (a.name === 'style') v = el.style.cssText
    if ((a.name === 'value' || a.name === 'checked') && (tag === 'input' || tag === 'textarea')) continue
    if (a.name === 'selected' && tag === 'option') continue
    if ((a.name === 'class' || a.name === 'style') && !v) continue
    if (skip.has(a.name)) continue
    attrs.push([a.name, v])
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') attrs.push(['.value', (el as HTMLInputElement).value])
  if (tag === 'input' && (el as HTMLInputElement).type === 'checkbox') attrs.push(['.checked', String((el as HTMLInputElement).checked)])
  if (tag === 'option') attrs.push(['.selected', String((el as HTMLOptionElement).selected)])
  attrs.sort((a, b) => (a[0] < b[0] ? -1 : 1))
  const kids: unknown[] = []
  if (tag !== 'textarea') {
    let text = ''
    const flush = () => {
      if (text && !(/^\s*$/.test(text) && text.includes('\n'))) kids.push(text)
      text = ''
    }
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 3) text += c.nodeValue
      else if (c.nodeType === 1) {
        flush()
        kids.push(snap(c, skip))
      }
    }
    flush()
  }
  return { tag, attrs, kids }
}

const NONE: ReadonlySet<string> = new Set()
/** 文本弹窗（P1-A 的 TextModal）不输出旧代码绑事件用的钩子属性，与 dom-tree.ts 的约定相同，比较弹窗时不看这三个。 */
const MODAL_HOOKS: ReadonlySet<string> = new Set(['data-x', 'data-dl', 'data-cp'])

const describeEl = (el: Element | null) => {
  if (!el || el.tagName === 'BODY') return '(body)'
  const data = Array.from(el.attributes).filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}=${a.value}]`).join('')
  return `${el.tagName.toLowerCase()}#${el.id}.${el.className}${data}`
}

function dumpStorage(s: Storage): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < s.length; i++) out[s.key(i)!] = s.getItem(s.key(i)!)!
  return out
}

function seqRandom() {
  let k = 0
  return () => RANDOM_SEQ[k++ % RANDOM_SEQ.length]
}

/** 两边各自记录的副作用。 */
class Log {
  toasts: string[] = []
  scrolls: string[] = []
  confirms: string[] = []
  speech: string[] = []
  recs: FakeRec[] = []
  scripts: string[] = []
  libs: string[] = []
  reads: string[] = []
  clip: string[] = []
  downloads: string[] = []
  pushes = 0
}

interface FakeRec {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: unknown) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

/** 把桩装进一个窗口（旧页面的 jsdom 窗口，或测试环境的全局窗口）。返回撤销函数。 */
function install(w: any, log: Log, stubs: Stubs): () => void {
  const undo: (() => void)[] = []
  const put = (obj: any, key: string, value: unknown) => {
    const had = Object.prototype.hasOwnProperty.call(obj, key), prev = obj[key]
    Object.defineProperty(obj, key, { value, configurable: true, writable: true })
    undo.push(() => (had ? Object.defineProperty(obj, key, { value: prev, configurable: true, writable: true }) : delete obj[key]))
  }
  if (stubs.speech !== false) {
    put(w, 'SpeechRecognition', class {
      lang = ''
      interimResults = false
      continuous = false
      onresult = null
      onend = null
      onerror = null
      constructor() {
        log.recs.push(this as unknown as FakeRec)
        log.speech.push('new')
      }
      start() {
        log.speech.push(`start ${this.lang} ${this.interimResults} ${this.continuous}`)
        if (stubs.speechThrows) throw new Error('not-allowed')
      }
      stop() {
        log.speech.push('stop')
        queueMicrotask(() => (this as unknown as FakeRec).onend?.())
      }
    })
  } else {
    put(w, 'SpeechRecognition', undefined)
    put(w, 'webkitSpeechRecognition', undefined)
  }
  const head = w.document.head
  const append = w.Node.prototype.appendChild
  put(head, 'appendChild', function (this: Node, node: any) {
    if (node.tagName === 'SCRIPT') {
      const src = node.src as string
      log.scripts.push(src)
      queueMicrotask(() => {
        if (stubs.scriptFails?.(src)) return node.onerror?.()
        if (src.includes('mammoth')) {
          w.mammoth = {
            extractRawText: async (o: { arrayBuffer: ArrayBuffer }) => {
              log.libs.push(`mammoth ${o.arrayBuffer.byteLength}`)
              if (stubs.docx instanceof Error) throw stubs.docx
              return { value: stubs.docx ?? '' }
            },
          }
        }
        if (src.includes('pdf.min')) {
          const lib: any = {
            GlobalWorkerOptions: { workerSrc: '' },
            getDocument: (o: { data: ArrayBuffer }) => {
              log.libs.push(`pdf ${o.data.byteLength} worker=${lib.GlobalWorkerOptions.workerSrc}`)
              const pages = stubs.pdf ?? []
              return { promise: Promise.resolve({ numPages: pages.length, getPage: async (i: number) => ({ getTextContent: async () => ({ items: pages[i - 1] }) }) }) }
            },
          }
          w.pdfjsLib = lib
        }
        node.onload?.()
      })
    }
    return append.call(this, node)
  })
  undo.push(() => {
    head.querySelectorAll('script').forEach((s: Element) => s.remove())
    delete w.mammoth
    delete w.pdfjsLib
  })
  put(w, 'FileReader', class {
    result: string | null = null
    onload: (() => void) | null = null
    readAsText(f: FakeFile, enc: string) {
      log.reads.push(`${f.name} ${enc}`)
      queueMicrotask(() => {
        this.result = f.text ?? ''
        this.onload?.()
      })
    }
  })
  put(w, 'confirm', (m: string) => {
    log.confirms.push(m)
    return stubs.confirm ?? true
  })
  put(w.navigator, 'clipboard', { writeText: async (t: string) => void log.clip.push(t) })
  put(w.URL, 'createObjectURL', (b: Blob) => `blob:${b.type}:${b.size}`)
  put(w.URL, 'revokeObjectURL', () => {})
  const aClick = w.HTMLAnchorElement.prototype.click
  put(w.HTMLAnchorElement.prototype, 'click', function (this: HTMLAnchorElement) {
    if (this.download) return void log.downloads.push(`${this.download} ${this.href}`)
    return aClick.call(this)
  })
  put(w.Element.prototype, 'scrollIntoView', function (this: Element, opt: unknown) {
    log.scrolls.push(`${describeEl(this)}|${JSON.stringify(opt)}`)
  })
  return () => undo.reverse().forEach((fn) => fn())
}

/** 旧页面一侧。 */
class OldSide {
  dom: any
  win: any
  doc: Document
  log = new Log()
  logins = 0
  timers: { at: number; fn: () => void }[] = []
  clock = 0
  constructor(seed: Record<string, string>, page: Page, stubs: Stubs) {
    this.dom = new JSDOM('<!doctype html><html><head></head><body><div class="wrap" id="view"></div><div class="toast" id="toast"></div></body></html>', {
      url: 'http://localhost/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    })
    const w = (this.win = this.dom.window)
    this.doc = w.document
    for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, v)
    install(w, this.log, stubs)
    // 两边用同一个解码器：jsdom 窗口自带的 TextDecoder 与测试环境（Node）的对 GB18030 / Big5 坏字节的处理不同，属于测试环境差异
    w.TextDecoder = TextDecoder
    w.setTimeout = (fn: () => void, ms = 0) => {
      this.timers.push({ at: this.clock + ms, fn })
      return this.timers.length
    }
    w.clearTimeout = () => {}
    w.requestAnimationFrame = (fn: () => void) => w.setTimeout(fn, 16)
    w.__rnd = seqRandom()
    const ctx = this.dom.getInternalVMContext()
    vm.runInContext('Math.random = () => window.__rnd(); Date.now = () => ' + NOW + ';', ctx)
    // 抽取器跳过了依赖 DOM 的 SpeechRec 常量（模块加载时取一次），这里按旧页面的写法补上
    vm.runInContext('var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;', ctx)
    vm.runInContext(legacySource(), ctx, { filename: 'legacy-site-template.js' })
    w.cloudPush = () => {
      this.log.pushes++
    }
    // 登录面板与导航在本对照之外（P1-A 已对照），只记录是否被调用
    w.openLogin = () => {
      this.logins++
    }
    w.drawNav = () => {}
    const toast = w.toast
    w.toast = (text: string) => {
      this.log.toasts.push(text)
      toast(text)
    }
    vm.runInContext(page.kind === 'home' ? 'viewScriptHome()' : `viewScriptNew(${JSON.stringify(page.wid ?? null)})`, ctx)
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
    return observe(this.win, this.root(), this.log, this.logins > 0)
  }
}

function observe(w: any, root: Element, log: Log, login: boolean): Observed {
  return {
    html: snap(root),
    modal: snap(w.document.querySelector('.modal'), MODAL_HOOKS),
    storage: dumpStorage(w.localStorage),
    hash: w.location.hash,
    toasts: log.toasts.slice(),
    scrolls: log.scrolls.slice(),
    focus: describeEl(w.document.activeElement),
    confirms: log.confirms.slice(),
    speech: log.speech.slice(),
    scripts: log.scripts.slice(),
    libs: log.libs.slice(),
    reads: log.reads.slice(),
    clip: log.clip.slice(),
    downloads: log.downloads.slice(),
    login,
    pushes: log.pushes,
  }
}

/** 新组件一侧。 */
class NewSide {
  doc = document
  win = window
  log = new Log()
  container: HTMLElement
  unToast: () => void
  uninstall: () => void
  constructor(seed: Record<string, string>, page: Page, stubs: Stubs) {
    localStorage.clear()
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
    this.uninstall = install(window, this.log, stubs)
    vi.spyOn(Math, 'random').mockImplementation(seqRandom())
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    setWorksPushHook(() => {
      this.log.pushes++
    })
    this.unToast = subscribeToast(() => {
      if (getToast().show) this.log.toasts.push(getToast().text)
    })
    const view = document.createElement('div')
    view.className = 'wrap'
    view.id = 'view'
    document.body.append(view)
    const host = document.createElement('div')
    host.id = 'modal-host'
    document.body.append(host)
    this.container = render(page.kind === 'home' ? <ScriptHomePage /> : <ScriptFormPage wid={page.wid} />, { container: view }).container as HTMLElement
    render(<TextModalHost />, { container: host })
  }
  root() {
    return this.container
  }
  observe(): Observed {
    return observe(window, this.root(), this.log, isAccountOpen())
  }
}

type AnySide = OldSide | NewSide

function pickEl(side: AnySide, selector: string, n = 0): HTMLElement {
  const els = side.doc.querySelectorAll<HTMLElement>(selector)
  if (!els[n]) throw new Error(`${side instanceof OldSide ? '旧' : '新'}页面找不到 ${selector}[${n}]`)
  return els[n]
}

/** 用原型上的 setter 改值（React 侧不经过它对 value 的记录），再派发事件。 */
function setValue(side: AnySide, el: HTMLElement, value: string) {
  const proto = el.tagName === 'TEXTAREA' ? side.win.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? side.win.HTMLSelectElement.prototype : side.win.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
}

function fileFor(side: AnySide, f: FakeFile) {
  const bytes = f.bytes ?? new TextEncoder().encode(f.text ?? '')
  return {
    name: f.name,
    size: f.size ?? bytes.length,
    text: f.text,
    // 在各自窗口的领域里建 ArrayBuffer，旧页面的 TextDecoder 认得它
    arrayBuffer: () => Promise.resolve(side.win.Uint8Array.from(bytes).buffer),
  }
}

export interface Twin {
  old: OldSide
  neu: NewSide
  click(selector: string, n?: number): Promise<void>
  /** 输入框打字：改值并派发 input。 */
  input(selector: string, value: string, n?: number): Promise<void>
  /** 下拉：改值并派发 change。 */
  change(selector: string, value: string): Promise<void>
  /** 文件框选文件并派发 change；f 为 null 表示取消选择。 */
  file(selector: string, f: FakeFile | null): Promise<void>
  /** 派发拖放事件（dragover / dragleave / drop），drop 带文件。 */
  drag(selector: string, type: 'dragover' | 'dragleave' | 'drop', f?: FakeFile): Promise<void>
  /** 最近一个语音识别实例送出识别结果。 */
  speak(...parts: string[]): Promise<void>
  /** 最近一个语音识别实例结束（onend）或出错（onerror）。 */
  speechEnd(kind?: 'onend' | 'onerror'): Promise<void>
  settle(): Promise<void>
  advance(ms: number): Promise<void>
  /** 断言两边全部可观测状态相等，返回旧页面的观测值。 */
  same(): Observed
}

const eq = (a: unknown, b: unknown, m: string) => expect(a, m).toStrictEqual(b)

/** 建立一对新旧页面；用后 teardown(t)。调用前需 vi.useFakeTimers({ toFake: FAKE })。 */
export const FAKE = ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] as const
/** seed 按 pl.<键> = JSON.stringify(值) 写入；raw 为原文（如损坏的 JSON、字符串 null）。 */
export async function twin(seed: Record<string, unknown>, page: Page, stubs: Stubs = {}, raw: Record<string, string> = {}): Promise<Twin> {
  location.hash = ''
  // React 的 act 首次走异步路径时会取一次 Math.random，先预热，免得吃掉随机序列
  await act(async () => {})
  const init = { ...Object.fromEntries(Object.entries(seed).map(([k, v]) => ['pl.' + k, JSON.stringify(v)])), ...Object.fromEntries(Object.entries(raw).map(([k, v]) => ['pl.' + k, v])) }
  const old = new OldSide(init, page, stubs)
  let neu!: NewSide
  await act(async () => {
    neu = new NewSide(init, page, stubs)
  })
  const both = async (fn: (side: AnySide) => void) => {
    fn(old)
    await act(async () => fn(neu))
  }
  const t: Twin = {
    old,
    neu,
    click: (sel, n = 0) => both((s) => pickEl(s, sel, n).click()),
    input: (sel, value, n = 0) =>
      both((s) => {
        const el = pickEl(s, sel, n)
        setValue(s, el, value)
        el.dispatchEvent(new s.win.Event('input', { bubbles: true }))
      }),
    change: (sel, value) =>
      both((s) => {
        const el = pickEl(s, sel)
        setValue(s, el, value)
        el.dispatchEvent(new s.win.Event('change', { bubbles: true }))
      }),
    file: (sel, f) =>
      both((s) => {
        const el = pickEl(s, sel)
        Object.defineProperty(el, 'files', { value: f ? [fileFor(s, f)] : [], configurable: true })
        el.dispatchEvent(new s.win.Event('change', { bubbles: true }))
      }),
    drag: (sel, type, f) =>
      both((s) => {
        const el = pickEl(s, sel)
        const ev = new s.win.Event(type, { bubbles: true, cancelable: true })
        Object.defineProperty(ev, 'dataTransfer', { value: { files: f ? [fileFor(s, f)] : [] } })
        el.dispatchEvent(ev)
      }),
    speak: (...parts) =>
      both((s) => {
        const r = s.log.recs[s.log.recs.length - 1]
        r.onresult?.({ results: parts.map((p) => [{ transcript: p }]) })
      }),
    speechEnd: (kind = 'onend') =>
      both((s) => {
        const r = s.log.recs[s.log.recs.length - 1]
        r[kind]?.()
      }),
    async settle() {
      for (let i = 0; i < 30; i++) await new Promise<void>((r) => queueMicrotask(r))
      await act(async () => {
        for (let i = 0; i < 30; i++) await Promise.resolve()
      })
    },
    async advance(ms) {
      old.advance(ms)
      await act(async () => {
        vi.advanceTimersByTime(ms)
      })
    },
    same() {
      const a = old.observe(), b = neu.observe()
      eq(b.html, a.html, 'DOM')
      eq(b.modal, a.modal, '弹窗')
      eq(b.storage, a.storage, 'localStorage')
      eq(b.hash, a.hash, 'location.hash')
      eq(b.toasts, a.toasts, '提示条')
      eq(b.scrolls, a.scrolls, '滚动')
      eq(b.focus, a.focus, '焦点')
      eq(b.confirms, a.confirms, 'confirm')
      eq(b.speech, a.speech, '语音识别')
      eq(b.scripts, a.scripts, '动态脚本')
      eq(b.libs, a.libs, '解析库调用')
      eq(b.reads, a.reads, 'FileReader')
      eq(b.clip, a.clip, '剪贴板')
      eq(b.downloads, a.downloads, '下载')
      eq(b.login, a.login, '登录面板')
      eq(b.pushes, a.pushes, 'works 推送钩子')
      return a
    },
  }
  return t
}

export function teardown(t?: Twin): void {
  cleanup()
  t?.neu.unToast()
  t?.neu.uninstall()
  t?.old.win.close()
  closeModal()
  setAccount(false)
  setWorksPushHook(null)
  vi.restoreAllMocks()
  localStorage.clear()
  location.hash = ''
  document.getElementById('view')?.remove()
  document.getElementById('modal-host')?.remove()
}
