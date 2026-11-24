import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { LEGACY_TEMPLATE, MemoryStorage, extractTopLevel } from './legacy'
import { RecBlob, newCalls, patchWindow } from './result-stubs'

/**
 * 结果页对照用的旧页面沙箱：旧顶层声明放进 node:vm，挂一个独立的 jsdom 文档（与新组件所在文档分开，
 * 避免 getElementById 串号），随机数、时间、剪贴板、下载、confirm、滚动全部打桩并记录。
 */

export interface LegacyPageOptions {
  data: unknown
  storage?: Record<string, string>
  /** Math.random 依次取这组值（循环）。 */
  rand: number[]
  now: number
  confirmAnswer?: boolean
}

function inlineScript(html: string): string {
  const open = '\n<script>\n'
  const start = html.indexOf(open)
  const end = html.lastIndexOf('\n</script>')
  if (start < 0 || end < start) throw new Error('site-template.html 里没有找到内联 <script>')
  return html.slice(start + open.length, end)
}

export function loadLegacyPage(opt: LegacyPageOptions) {
  const script = inlineScript(readFileSync(LEGACY_TEMPLATE, 'utf8'))
    .replace('/*__DATA__*/null', () => JSON.stringify(opt.data))
    .replace("/*__API_BASE__*/''", () => "''")
  const source = extractTopLevel(script)

  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div class="toast" id="toast"></div></body></html>')
  const win = dom.window as any
  const storage = new MemoryStorage(opt.storage)
  const calls = newCalls()
  const blobs = new Map<string, RecBlob>()
  patchWindow(win, calls, blobs)
  let blobN = 0
  let randN = 0
  const location = { hash: '', search: '', pathname: '/', href: 'http://localhost/' }
  const sandbox: Record<string, unknown> = {
    console,
    document: win.document,
    location,
    localStorage: storage,
    sessionStorage: new MemoryStorage(),
    // 取全局当下的 setTimeout，测试里切换假计时器后仍然生效
    setTimeout: (...a: [() => void, number]) => globalThis.setTimeout(...a),
    clearTimeout: (id: any) => globalThis.clearTimeout(id),
    navigator: { clipboard: { writeText: async (t: string) => void calls.clipboard.push(t) } },
    Blob: RecBlob,
    URL: {
      createObjectURL(b: RecBlob) {
        const u = `blob:legacy/${++blobN}`
        blobs.set(u, b)
        return u
      },
      revokeObjectURL: (u: string) => void calls.revoked.push(u),
    },
    confirm: (m: string) => {
      calls.confirm.push(m)
      return opt.confirmAnswer ?? true
    },
    __rand: () => opt.rand[randN++ % opt.rand.length],
    __now: opt.now,
  }
  sandbox.window = sandbox
  sandbox.self = sandbox
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'legacy-site-template.js' })
  vm.runInContext('Math.random = () => __rand(); Date.now = () => __now', sandbox)

  const doc = win.document as Document
  return {
    doc,
    win,
    storage,
    calls,
    location,
    /** 跑旧 viewScriptResult，渲染进 #view。 */
    render(id: string, fresh: boolean) {
      vm.runInContext(`viewScriptResult(${JSON.stringify(id)}, ${JSON.stringify(fresh)})`, sandbox)
    },
    view: () => doc.getElementById('view')!,
    toast: () => doc.getElementById('toast')!,
    modals: () => [...doc.querySelectorAll('.modal')],
    click: (sel: string) => (doc.querySelector(sel) as HTMLElement).click(),
    setConfirm: (v: boolean) => void (opt.confirmAnswer = v),
  }
}
export type LegacyPage = ReturnType<typeof loadLegacyPage>
