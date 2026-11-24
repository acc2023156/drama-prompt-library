import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { URL as NodeURL, fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { parse } from 'acorn'
import { JSDOM } from 'jsdom'

/*
 * 这个文件在 jsdom 环境（.test.tsx）里运行：此环境下 legacy.ts 与 plugins/load-data.ts 的 import.meta.url 不是 file 地址，
 * 它们顶层的 fileURLToPath(new URL(...)) 会抛错，所以抽取旧脚本与生成内容数据的逻辑在这里按同样的做法再写一份
 * （与 legacy.ts 的 extractTopLevel、load-data.ts 的 loadDataJson 同逻辑，旧页面结构变化时两处一起改）。
 */
const here = (rel: string) => fileURLToPath(new NodeURL(rel, import.meta.url))
const LEGACY_TEMPLATE = here('../../../web/site-template.html')
const BUILD_PY = here('../../../web/build.py')

/** build.py data 的内容（对象）。 */
export function loadContentData(): any {
  const file = process.env.TJ_DATA
  const text = file
    ? readFileSync(file, 'utf8')
    : execFileSync(process.env.TJ_PYTHON || 'python3', ['-I', '-B', BUILD_PY, 'data'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  return JSON.parse(text)
}

/** 依赖 DOM 的顶层常量，抽取时跳过。 */
const SKIP_NAMES = new Set(['account', 'accountTrigger', 'SpeechRec'])

function declaredNames(pattern: any, out: string[] = []): string[] {
  if (pattern.type === 'Identifier') out.push(pattern.name)
  else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((p: any) => declaredNames(p.value ?? p.argument, out))
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e: any) => e && declaredNames(e, out))
  else if (pattern.type === 'AssignmentPattern') declaredNames(pattern.left, out)
  else if (pattern.type === 'RestElement') declaredNames(pattern.argument, out)
  return out
}

/** 顶层只保留函数、类、变量声明；表达式语句（启动副作用）与依赖 DOM 的常量丢掉。 */
function extractTopLevel(script: string): string {
  const ast = parse(script, { ecmaVersion: 'latest', sourceType: 'script' })
  const kept: string[] = []
  for (const node of ast.body as any[]) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') kept.push(script.slice(node.start, node.end))
    else if (node.type === 'VariableDeclaration') {
      const names = node.declarations.flatMap((d: any): string[] => declaredNames(d.id))
      if (!names.some((n: string) => SKIP_NAMES.has(n))) kept.push(script.slice(node.start, node.end))
    }
  }
  return kept.join('\n')
}

/** 取出模板里唯一的内联 <script> 正文（legacy.ts 里同名函数未导出）。 */
function inlineScript(html: string): string {
  const open = '\n<script>\n'
  const start = html.indexOf(open)
  const end = html.lastIndexOf('\n</script>')
  if (start < 0 || end < start || html.indexOf(open, start + 1) >= 0) throw new Error('site-template.html 里没有找到唯一的内联 <script>')
  return html.slice(start + open.length, end)
}

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
 * 在 jsdom 里加载旧页面的顶层声明（与 legacy.ts 同一套抽取），让旧 view 函数真的往 #view 里画 DOM、绑事件。
 * 页面里没有 marked、没有云同步，这两处与旧 viewAssembler / viewTool 无关。
 */
export function loadLegacyDom(opt: { data: unknown; storage?: Record<string, string> }): LegacyDom {
  const script = inlineScript(readFileSync(LEGACY_TEMPLATE, 'utf8')).replace('/*__DATA__*/null', () => JSON.stringify(opt.data))
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
  vm.runInContext(extractTopLevel(script), ctx, { filename: 'legacy-site-template.js' })
  return {
    window,
    view: window.document.getElementById('view')!,
    exec: (code) => vm.runInContext(code, ctx),
    copied,
    downloads,
  }
}
