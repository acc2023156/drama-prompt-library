import { parse } from 'acorn'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

/** 旧页面模板，只读。 */
export const LEGACY_TEMPLATE = fileURLToPath(new URL('../../../web/site-template.html', import.meta.url))

/** 依赖 DOM 的顶层常量，抽取时跳过。 */
const SKIP_NAMES = new Set(['account', 'accountTrigger', 'SpeechRec'])

export class MemoryStorage {
  private map = new Map<string, string>()
  constructor(init: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(init)) this.map.set(k, v)
  }
  get length() {
    return this.map.size
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v))
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

function declaredNames(pattern: any, out: string[] = []): string[] {
  if (pattern.type === 'Identifier') out.push(pattern.name)
  else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((p: any) => declaredNames(p.value ?? p.argument, out))
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e: any) => e && declaredNames(e, out))
  else if (pattern.type === 'AssignmentPattern') declaredNames(pattern.left, out)
  else if (pattern.type === 'RestElement') declaredNames(pattern.argument, out)
  return out
}

/** 取出模板里唯一的内联 <script> 正文。 */
function inlineScript(html: string): string {
  const open = '\n<script>\n'
  const start = html.indexOf(open)
  const end = html.lastIndexOf('\n</script>')
  if (start < 0 || end < start || html.indexOf(open, start + 1) >= 0) {
    throw new Error('site-template.html 里没有找到唯一的内联 <script>，抽取器需要同步调整')
  }
  return html.slice(start + open.length, end)
}

/** 顶层只保留函数、类、变量声明；表达式语句（启动副作用）与依赖 DOM 的常量丢掉。 */
export function extractTopLevel(script: string): string {
  const ast = parse(script, { ecmaVersion: 'latest', sourceType: 'script' })
  const kept: string[] = []
  for (const node of ast.body as any[]) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      kept.push(script.slice(node.start, node.end))
    } else if (node.type === 'VariableDeclaration') {
      const names = node.declarations.flatMap((d: any): string[] => declaredNames(d.id))
      if (!names.some((n: string) => SKIP_NAMES.has(n))) kept.push(script.slice(node.start, node.end))
    }
  }
  return kept.join('\n')
}

export interface LegacyOptions {
  /** build.py data 的内容（对象）。 */
  data: unknown
  /** 预置的 localStorage（键带 pl. 前缀）。 */
  storage?: Record<string, string>
  apiBase?: string
}

export interface Legacy {
  storage: MemoryStorage
  setHash(hash: string): void
  /** 在旧页面的脚本作用域里求值表达式，结果经 JSON 复制回当前领域（undefined 保持 undefined）。 */
  run<T = unknown>(expr: string): T
  /** 设置 location.hash 后调用旧 parse()。 */
  parse(hash: string): any
}

/** 在 node:vm 里加载旧页面的顶层纯函数与常量，供新旧对照。 */
export function loadLegacy(opt: LegacyOptions): Legacy {
  const script = inlineScript(readFileSync(LEGACY_TEMPLATE, 'utf8'))
  const withData = script
    .replace("/*__DATA__*/null", () => JSON.stringify(opt.data))
    .replace("/*__API_BASE__*/''", () => JSON.stringify(opt.apiBase ?? ''))
  const source = extractTopLevel(withData)

  const storage = new MemoryStorage(opt.storage)
  const location = { hash: '', search: '', pathname: '/', href: 'http://localhost/' }
  const sandbox: Record<string, unknown> = {
    console,
    location,
    localStorage: storage,
    sessionStorage: new MemoryStorage(),
    setTimeout,
    clearTimeout,
  }
  sandbox.window = sandbox
  sandbox.self = sandbox
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'legacy-site-template.js' })

  const run = <T>(expr: string): T => {
    const json = vm.runInContext(`(()=>{const v=(${expr});return v===undefined?undefined:JSON.stringify(v)})()`, sandbox) as string | undefined
    return json === undefined ? (undefined as T) : (JSON.parse(json) as T)
  }
  const setHash = (hash: string) => {
    location.hash = hash
  }
  return {
    storage,
    setHash,
    run,
    parse(hash) {
      setHash(hash)
      return run('parse()')
    },
  }
}
