import { parse } from 'acorn'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

/*
 * 旧页面对照的统一入口：所有新旧对照测试都经这里读取旧模板、抽取内联脚本。
 * 路径用 fileURLToPath(import.meta.url) 加 path.resolve：vitest 的 jsdom（web）转换只改写 new URL('相对路径', import.meta.url)
 * 这种写法并把全局 URL 换成 jsdom 的实现，导致 .test.tsx 里 import 即抛 “The URL must be of scheme file”；
 * 这里不写该模式，import.meta.url 本身在 node 与 jsdom 两个项目里都是 file 地址（字符串），所以两边都能 import。
 */
const HERE = path.dirname(fileURLToPath(import.meta.url))

/** 固定的对照基准：旧模板在该提交时的内容（tests/fixtures 下的快照，说明见该目录 README）。 */
export const LEGACY_SNAPSHOT_COMMIT = 'f331924'
export const LEGACY_SNAPSHOT_SHA256 = '21bd18c2279791fe699882be76a22aad9d0e91589dcf6f70f4a5f9c686ec6500'
export const LEGACY_SNAPSHOT = path.resolve(HERE, '../fixtures/legacy-template.f331924.html')
/** 仓库里当前的旧模板（只读）；只在设置 LEGACY_TEMPLATE=latest 时使用，给追平（P6-A 及以后各次）对照最新模板。 */
export const LEGACY_LATEST = path.resolve(HERE, '../../../web/site-template.html')

function pickTemplate(env: string | undefined): string {
  if (env === undefined || env === '') return LEGACY_SNAPSHOT
  if (env === 'latest') return LEGACY_LATEST
  throw new Error(`LEGACY_TEMPLATE 只接受 latest（对照最新模板）或不设置（对照固定快照），收到 ${JSON.stringify(env)}`)
}

/** 当前生效的旧模板文件路径：默认固定快照，LEGACY_TEMPLATE=latest 时为仓库最新模板。 */
export const LEGACY_TEMPLATE = pickTemplate(process.env.LEGACY_TEMPLATE)

/** 当前生效的旧模板全文。 */
export function readLegacyTemplate(): string {
  return readFileSync(LEGACY_TEMPLATE, 'utf8')
}

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
export function inlineScript(html: string): string {
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

/** 内联脚本全文，数据与后端地址占位符已替换（后端地址缺省为空，即同源）。 */
export function legacyScript(opt: { data: unknown; apiBase?: string }): string {
  return inlineScript(readLegacyTemplate())
    .replace('/*__DATA__*/null', () => JSON.stringify(opt.data))
    .replace("/*__API_BASE__*/''", () => JSON.stringify(opt.apiBase ?? ''))
}

/** 整页 HTML（给整页运行旧页面的 jsdom 用），数据与后端地址占位符已替换。 */
export function legacyHtml(opt: { data: unknown; apiBase?: string }): string {
  return readLegacyTemplate()
    .replace('/*__DATA__*/null', () => JSON.stringify(opt.data))
    .replace("/*__API_BASE__*/''", () => JSON.stringify(opt.apiBase ?? ''))
}

/** 抽取后的旧页面顶层声明源码：各对照沙箱（node:vm 或 jsdom 的 vm 上下文）直接 runInContext 它。 */
export function legacyTopLevel(opt: { data: unknown; apiBase?: string }): string {
  return extractTopLevel(legacyScript(opt))
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
  const source = legacyTopLevel(opt)

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
