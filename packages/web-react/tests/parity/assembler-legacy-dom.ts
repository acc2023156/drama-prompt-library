import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { legacyTopLevel } from './legacy'

export interface LegacyDom {
  window: Window & typeof globalThis
  /** 旧页面 #view 容器 */
  view: HTMLElement
  /** 在旧页面脚本作用域里执行语句 */
  exec(code: string): unknown
  /** 剪贴板 writeText 收到的文本（按调用顺序） */
  copied: string[]
  /** 点击旧下载按钮时生成的文件：文件名与 Blob */
  downloads: { name: string; blob: Blob }[]
}

/**
 * 在 jsdom 里加载旧页面的顶层声明（经 legacy.ts 的统一入口抽取），让旧 view 函数真的往 #view 里画 DOM、绑事件。
 * 页面里没有 marked、没有云同步，这两处与旧 viewAssembler / viewTool 无关。
 */
export function loadLegacyDom(opt: { data: unknown; storage?: Record<string, string> }): LegacyDom {
  const dom = new JSDOM('<!doctype html><html><body><div class="wrap" id="view"></div><div class="toast" id="toast"></div></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
  })
  const window = dom.window as Window & typeof globalThis
  for (const [k, v] of Object.entries(opt.storage ?? {})) window.localStorage.setItem(k, v)

  const copied: string[] = []
  const downloads: { name: string; blob: Blob }[] = []
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (t: string) => void copied.push(t) }, configurable: true })
  const urls = new Map<string, Blob>()
  window.URL.createObjectURL = (b: Blob) => {
    const u = 'blob:legacy/' + urls.size
    urls.set(u, b)
    return u
  }
  window.URL.revokeObjectURL = () => {}
  // jsdom 不做导航：点击带 download 的链接只记录
  const anchorClick = window.HTMLAnchorElement.prototype.click
  window.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.download) downloads.push({ name: this.download, blob: urls.get(this.href)! })
    else anchorClick.call(this)
  }

  const ctx = dom.getInternalVMContext()
  vm.runInContext(legacyTopLevel({ data: opt.data }), ctx, { filename: 'legacy-site-template.js' })
  return {
    window,
    view: window.document.getElementById('view')!,
    exec: (code) => vm.runInContext(code, ctx),
    copied,
    downloads,
  }
}
