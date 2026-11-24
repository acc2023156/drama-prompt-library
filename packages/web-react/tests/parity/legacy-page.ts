import * as jsdomModule from 'jsdom'
import { legacyHtml } from './legacy'

// tests/parity/jsdom.d.ts（别的任务包写的）只声明了 JSDOM 的一小部分；这里用到 VirtualConsole 与更多选项，按 any 取用，不改共享的声明文件
const { JSDOM, VirtualConsole } = jsdomModule as any

/**
 * 在 jsdom 里整页运行旧页面（site-template.html 的真实内联脚本），用来实跑旧 view 函数并对照新组件。
 * 与 legacy.ts（node:vm 抽取纯函数）互补：这里要真实 DOM、事件与 localStorage。
 * 外部脚本（marked、mammoth 等 CDN）不加载；fetch、confirm、matchMedia 由调用方打桩。
 */

export interface FetchCall {
  url: string
  /** fetch 的第二个参数序列化（旧页面 /words 只传一个参数，这里为 undefined）。 */
  init: unknown
}
export interface StubReply {
  status?: number
  body?: unknown
  /** 响应体不是合法 JSON。 */
  badJson?: boolean
  /** 网络层失败（fetch 抛错）。 */
  throws?: boolean
  /** 一直不返回（用来固定“读取中”的中间状态）。 */
  hang?: boolean
}
export type FetchRoutes = (path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } | undefined) => StubReply

/** 打桩 fetch：只实现旧页面与新请求层用到的 ok / status / json / headers.get。 */
export function makeFetch(base: string, routes: FetchRoutes) {
  const calls: FetchCall[] = []
  const fn = (url: string, init?: any) => {
    calls.push({ url, init: init === undefined ? undefined : JSON.parse(JSON.stringify(init)) })
    const r = routes(url.startsWith(base) ? url.slice(base.length) : url, init)
    if (r.hang) return new Promise(() => {})
    if (r.throws) return Promise.reject(new TypeError('Failed to fetch'))
    const status = r.status ?? 200
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: () => (r.badJson ? Promise.reject(new SyntaxError('bad json')) : Promise.resolve(r.body)),
    })
  }
  return { fn, calls }
}

export interface LegacyPageOptions {
  data: unknown
  apiBase?: string
  now: number
  fetch: (url: string, init?: any) => Promise<unknown>
  confirm: (msg: string) => boolean
}

export interface LegacyPage {
  window: any
  document: Document
  /** 每次导航后重新取 #view（旧页面不替换这个节点，只改 innerHTML）。 */
  readonly view: HTMLElement
  errors: string[]
  /** 清空两个存储，写入种子（localStorage 键带 pl. 前缀，值为原文），再跳到 hash 并等异步流程跑完。 */
  go(hash: string, seed?: { local?: Record<string, string>; session?: Record<string, string> }): Promise<void>
  local(): Record<string, string>
  session(): Record<string, string>
  close(): void
}

const tick = () => new Promise((r) => setTimeout(r, 0))
/** 让已发出的 fetch 与其后的 promise 链跑完。 */
export async function settle(n = 6) {
  for (let i = 0; i < n; i++) await tick()
}

function dump(s: Storage): Record<string, string> {
  const o: Record<string, string> = {}
  for (let i = 0; i < s.length; i++) o[s.key(i)!] = s.getItem(s.key(i)!)!
  return o
}

/**
 * 载入旧页面并执行启动脚本。启动在静态的 #/partner 上完成（不发请求、不写存储），
 * 之后 go() 清空存储再写种子，避免启动流程（登录态下的 /me、/works 同步）混进对照记录。
 */
export function loadLegacyPage(opt: LegacyPageOptions): LegacyPage {
  const html = legacyHtml({ data: opt.data, apiBase: opt.apiBase })
  const errors: string[] = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (e: Error) => errors.push(String(e.stack || e)))
  const dom = new JSDOM(html, {
    url: 'http://localhost/#/partner',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(w: any) {
      w.fetch = opt.fetch
      w.confirm = opt.confirm
      w.scrollTo = () => {}
      w.Element.prototype.scrollIntoView = () => {}
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
      const RealDate = w.Date
      w.Date = class extends RealDate {
        constructor(...a: unknown[]) {
          if (a.length) super(...(a as []))
          else super(opt.now)
        }
        static now() {
          return opt.now
        }
      }
    },
  })
  const w: any = dom.window
  return {
    window: w,
    document: w.document,
    get view() {
      return w.document.getElementById('view')
    },
    errors,
    async go(hash, seed = {}) {
      w.localStorage.clear()
      w.sessionStorage.clear()
      for (const [k, v] of Object.entries(seed.local || {})) w.localStorage.setItem(k, v)
      for (const [k, v] of Object.entries(seed.session || {})) w.sessionStorage.setItem(k, v)
      w.location.hash = hash
      await settle()
    },
    local: () => dump(w.localStorage),
    session: () => dump(w.sessionStorage),
    close: () => w.close(),
  }
}

/* ---------- DOM 结构化比较 ---------- */

export type DomNode = string | { tag: string; attrs: Record<string, string>; style: string[]; props: Record<string, string | boolean>; kids: DomNode[] }

const normStyle = (s: string | null) =>
  (s || '')
    .split(';')
    .map((x) => x.trim().replace(/\s*:\s*/, ':'))
    .filter(Boolean)

/**
 * 把 DOM 子树转成可比较的结构：标签、属性（忽略顺序）、style 声明、表单控件的当前值与选中状态、文本。
 * 只在两处放宽：相邻文本节点合并（React 会把插值拆成多个节点）；纯空白文本节点忽略（旧页面模板的缩进换行）。
 */
export function domTree(parent: Node): DomNode[] {
  const out: DomNode[] = []
  let text = ''
  const flush = () => {
    if (text.trim()) out.push(text)
    text = ''
  }
  for (const n of Array.from(parent.childNodes)) {
    if (n.nodeType === 3) {
      text += n.textContent
      continue
    }
    if (n.nodeType !== 1) continue
    flush()
    const el = n as Element
    const tag = el.localName
    const attrs: Record<string, string> = {}
    for (const a of Array.from(el.attributes)) {
      if (a.name === 'style' || a.name === 'selected') continue
      if (a.name === 'value' && (tag === 'input' || tag === 'textarea')) continue
      attrs[a.name] = a.value
    }
    const props: Record<string, string | boolean> = {}
    if (tag === 'input' || tag === 'textarea') props.value = (el as HTMLInputElement).value
    if (tag === 'option') props.selected = (el as HTMLOptionElement).selected
    if (tag === 'select') props.value = (el as HTMLSelectElement).value
    out.push({ tag, attrs, style: normStyle(el.getAttribute('style')), props, kids: domTree(el) })
  }
  flush()
  return out
}
