import { parse } from 'acorn'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { marked } from 'marked'

/**
 * 本文件在 jsdom 环境（.test.tsx）里运行。P0 的 legacy.ts、plugins/load-data.ts 用 fileURLToPath(new URL(…, import.meta.url))
 * 取路径，jsdom 环境下全局 URL 被替换，import 时即抛 “The URL must be of scheme file”，所以这里自带路径与抽取逻辑（逻辑与 legacy.ts 的 extractTopLevel 相同）。
 */
const PKG_WEB = path.resolve(import.meta.dirname, '../../../web')
export const LEGACY_TEMPLATE = path.join(PKG_WEB, 'site-template.html')

/** build.py data 的内容（对象）；TJ_DATA 指向已生成文件时直接读。 */
export function loadDataDom(): any {
  const f = process.env.TJ_DATA
  const text = f ? readFileSync(f, 'utf8') : execFileSync('python3', ['-I', '-B', path.join(PKG_WEB, 'build.py'), 'data'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  return JSON.parse(text)
}

const SKIP_NAMES = new Set(['account', 'accountTrigger', 'SpeechRec'])
function declaredNames(pattern: any, out: string[] = []): string[] {
  if (pattern.type === 'Identifier') out.push(pattern.name)
  else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((p: any) => declaredNames(p.value ?? p.argument, out))
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e: any) => e && declaredNames(e, out))
  else if (pattern.type === 'AssignmentPattern') declaredNames(pattern.left, out)
  else if (pattern.type === 'RestElement') declaredNames(pattern.argument, out)
  return out
}
function extractTopLevel(script: string): string {
  const kept: string[] = []
  for (const node of parse(script, { ecmaVersion: 'latest', sourceType: 'script' }).body as any[]) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') kept.push(script.slice(node.start, node.end))
    else if (node.type === 'VariableDeclaration') {
      const names = node.declarations.flatMap((d: any): string[] => declaredNames(d.id))
      if (!names.some((n: string) => SKIP_NAMES.has(n))) kept.push(script.slice(node.start, node.end))
    }
  }
  return kept.join('\n')
}

/**
 * 提示词库对照用：把旧页面顶层函数装进一个真 jsdom 窗口里运行，
 * 旧 viewList / viewEntry / viewDoc / renderMd 直接写这个窗口的 #view，得到真实 DOM 来和新组件比较。
 * 页头 CDN 的 marked@12.0.2 以 npm 的 marked 12.0.2 代替（P0 已核实两者的 marked.min.js 字节相同）。
 */
function inlineScript(html: string): string {
  const open = '\n<script>\n'
  const start = html.indexOf(open)
  const end = html.lastIndexOf('\n</script>')
  if (start < 0 || end < start) throw new Error('site-template.html 里没有找到内联 <script>')
  return html.slice(start + open.length, end)
}

export interface LegacyDom {
  win: any
  view: HTMLElement
  /** 旧页面作用域里求值（返回原值，不做 JSON 复制） */
  run<T = any>(expr: string): T
  /** 旧 navigator.clipboard.writeText 收到的文本 */
  copied: string[]
  /** 恢复旧页面全局 state 与 localStorage */
  reset(): void
}

export function loadLegacyDom(data: unknown): LegacyDom {
  const script = inlineScript(readFileSync(LEGACY_TEMPLATE, 'utf8'))
    .replace('/*__DATA__*/null', () => JSON.stringify(data))
    .replace("/*__API_BASE__*/''", () => JSON.stringify(''))
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="toast"></div></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' })
  const win = dom.window as any
  win.marked = marked
  const copied: string[] = []
  Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async (t: string) => void copied.push(t) }, configurable: true })
  const ctx = dom.getInternalVMContext()
  vm.runInContext(extractTopLevel(script), ctx, { filename: 'legacy-site-template.js' })
  const run = <T>(expr: string): T => vm.runInContext(expr, ctx) as T
  return {
    win,
    view: win.document.getElementById('view'),
    run,
    copied,
    reset() {
      run("(()=>{state.q='';state.lic='all';state.prod=false})()")
      win.localStorage.clear()
      win.document.getElementById('view').innerHTML = ''
      copied.length = 0
    },
  }
}

/** 规范化后的节点：标签、排序后的属性、类名集合、样式（按 cssText 归一）、input 的 value 属性值、子节点。 */
export type CanonNode = string | { tag: string; attrs: [string, string][]; cls: string[]; style: string; value?: string; kids: CanonNode[] }

const ALWAYS_IGNORED = new Set(['class', 'style', 'value'])

/**
 * 比较用的结构化 DOM。规则（每条都有理由）：
 * - 只含空白的文本节点丢弃：旧页面模板字符串里的缩进换行，落在 flex / grid / 块级之间，不产生可见空白（核对 CSS：.row .sec-head .card .composer .crumb .pager 均为 flex 或块级）；
 * - 相邻文本节点合并，其余文本原样比较（不 trim）；
 * - class 比较集合（旧写法 `tag ` 带尾空格、顺序可能不同），style 比较解析后的 cssText；
 * - input 比较 value 属性而不是 value 特性（React 受控输入的 value 特性写法不同，用户看到的是值）。
 * ignoreId：详情页复制按钮旧写法有 id="cp"，CopyButton 没有 id 参数；该 id 只被旧 viewEntry 自己用，CSS 与脚本里别处都没有引用。
 */
export function canon(node: Node, opt: { ignoreId?: (el: Element) => boolean } = {}): CanonNode[] {
  node.normalize()
  const out: CanonNode[] = []
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) {
      const t = c.textContent || ''
      if (t.trim() !== '') out.push(t)
    } else if (c.nodeType === 1) {
      const el = c as HTMLElement
      const attrs: [string, string][] = []
      for (const a of Array.from(el.attributes)) {
        if (ALWAYS_IGNORED.has(a.name)) continue
        if (a.name === 'id' && opt.ignoreId?.(el)) continue
        attrs.push([a.name, a.value])
      }
      attrs.sort((x, y) => (x[0] < y[0] ? -1 : 1))
      const n: CanonNode = {
        tag: el.tagName.toLowerCase(),
        attrs,
        cls: (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).sort(),
        style: el.style ? el.style.cssText : '',
        kids: canon(el, opt),
      }
      if (el.tagName === 'INPUT') n.value = (el as HTMLInputElement).value
      out.push(n)
    }
  })
  return out
}
