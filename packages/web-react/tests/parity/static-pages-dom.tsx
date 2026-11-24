import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Toast } from '../../src/components/Toast'
import { loadDataJson } from '../../plugins/load-data'
import { type Legacy, loadLegacy } from './legacy'

/**
 * 静态页（伙伴计划、会员）的新旧 DOM 对照工具。仅用于 jsdom 组件测试（.test.tsx）。
 *
 * 旧页面：把旧 viewXxx() 放进 node:vm 里实跑，让它的 document / history / location 指向 jsdom 的真实对象，
 * 于是旧页面直接渲染进真实 DOM，事件处理器也是旧代码自己绑定的；新页面用 React 渲染进同样的骨架。
 * 比较的是 DOM 树，不是 HTML 字符串。
 */

export type Snap = string | { tag: string; ns: string | null; attrs: Record<string, string>; kids: Snap[] }

const SKELETON = '<div id="view"></div><div id="toastHost"></div>'

/** 样式属性：逐条声明去空白后原序比较。 */
const normStyle = (v: string) =>
  v
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(':')
      return `${s.slice(0, i).trim()}:${s.slice(i + 1).trim()}`
    })
    .join(';')

/** class 属性：按空白切开后原序比较（旧模板 `plan ` 的尾随空格不算差异）。 */
const normClass = (v: string) => v.split(/\s+/).filter(Boolean).join(' ')

/**
 * DOM 树快照：标签、命名空间、属性、子节点、文本。
 * 忽略：内联事件属性 on*（行为单独用交互场景比较）、注释、仅含空白的文本节点（旧模板里块级元素之间的换行缩进，
 * 其父级布局均为块级 / flex / 绝对定位，不产生可见空白）；相邻文本节点先合并；文本其余部分逐字保留。
 */
export function snap(node: Node): Snap | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent ?? ''
    return t.trim() === '' ? null : t
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const el = node as Element
  const attrs: Record<string, string> = {}
  for (const name of el.getAttributeNames().sort()) {
    if (name.startsWith('on')) continue
    const v = el.getAttribute(name) ?? ''
    attrs[name] = name === 'class' ? normClass(v) : name === 'style' ? normStyle(v) : v
  }
  el.normalize()
  const kids = [...el.childNodes].map(snap).filter((x): x is Snap => x !== null)
  return { tag: el.localName, ns: el.namespaceURI, attrs, kids }
}

export const snapChildren = (el: Element): Snap[] => {
  el.normalize()
  return [...el.childNodes].map(snap).filter((x): x is Snap => x !== null)
}

/** 第一处差异的路径与两侧内容；完全相等返回 null。 */
export function firstDiff(a: Snap | Snap[], b: Snap | Snap[], path = '$'): string | null {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = a as Snap[]
    const y = b as Snap[]
    if (!Array.isArray(a) || !Array.isArray(b)) return `${path}: 一侧是列表`
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if (x[i] === undefined || y[i] === undefined) return `${path}[${i}]: 子节点数 旧=${x.length} 新=${y.length}`
      const d = firstDiff(x[i], y[i], `${path}[${i}]`)
      if (d) return d
    }
    return null
  }
  if (typeof a === 'string' || typeof b === 'string') return a === b ? null : `${path}: 文本 旧=${JSON.stringify(a)} 新=${JSON.stringify(b)}`
  if (a.tag !== b.tag || a.ns !== b.ns) return `${path}: 标签 旧=<${a.tag}> 新=<${b.tag}>`
  const keys = [...new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)])]
  for (const k of keys) if (a.attrs[k] !== b.attrs[k]) return `${path}<${a.tag}>@${k}: 旧=${JSON.stringify(a.attrs[k])} 新=${JSON.stringify(b.attrs[k])}`
  return firstDiff(a.kids, b.kids, `${path}<${a.tag}>`)
}

/** 节点总数（元素 + 文本），用来在报告里写明对照覆盖了多少节点。 */
export function countNodes(s: Snap | Snap[]): number {
  if (Array.isArray(s)) return s.reduce((n, x) => n + countNodes(x), 0)
  if (typeof s === 'string') return 1
  return 1 + countNodes(s.kids)
}

let cachedLegacy: Legacy | undefined

/** 加载旧页面沙箱（每个测试文件在 beforeAll 里 await 一次）。 */
export async function loadLegacyPages(): Promise<Legacy> {
  if (cachedLegacy) return cachedLegacy
  cachedLegacy = loadLegacy({ data: JSON.parse(loadDataJson()) })
  return cachedLegacy
}

/** build.py data 的 JSON 文本（给需要 #tj-data 的真实路由组件用）。 */
export function siteDataJson(): string {
  return loadDataJson()
}

export function legacyPages(): Legacy {
  if (!cachedLegacy) throw new Error('先在 beforeAll 里 await loadLegacyPages()')
  return cachedLegacy
}

/** 让旧脚本的 document / history / location 指向 jsdom 真实对象（经 vm 里共享的 console 递送）。 */
function bridge(legacy: Legacy) {
  ;(console as any).__tjHost = { document, history, location }
  legacy.run('(globalThis.document=console.__tjHost.document,globalThis.history=console.__tjHost.history,globalThis.location=console.__tjHost.location,0)')
}

export interface Mounted {
  view: HTMLElement
  /** #toast 的当前状态，新旧页面同一读法。 */
  toast(): { text: string; show: boolean }
}

const toastState = () => {
  const el = document.getElementById('toast')
  return { text: el?.textContent ?? '', show: el?.classList.contains('show') ?? false }
}

/** 旧页面：skeleton 里放 #view 与 #toast（初始文本同 Layout），再实跑旧 viewXxx()。 */
export function mountLegacy(fn: string): Mounted {
  document.body.innerHTML = '<div id="view"></div><div class="toast" id="toast">已复制</div>'
  bridge(legacyPages())
  legacyPages().run(`(${fn}(),0)`)
  return { view: document.getElementById('view')!, toast: toastState }
}

/** 新页面：React 渲染进同样的骨架，Toast 组件与 Layout 里一致。 */
export function mountNew(ui: ReactElement): Mounted {
  document.body.innerHTML = SKELETON
  const view = document.getElementById('view')!
  render(ui, { container: view })
  render(<Toast />, { container: document.getElementById('toastHost')! })
  return { view, toast: toastState }
}
