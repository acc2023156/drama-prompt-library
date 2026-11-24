/**
 * DOM 节点逐个比较用的规范化快照（新旧页面各自渲染后比较）。
 * 抹平的只有写法差异，不抹平用户可见的差异：
 * - 只含换行的空白文本节点（旧模板字符串的缩进）忽略；其余文本逐字比较，相邻文本节点先合并
 * - class 按词排序，空 class 视为没有
 * - style 取解析后的 cssText
 * - textarea 比较 value，不比较内部文本
 * - 旧页面返回按钮的内联 onclick 属性与脏标记 data-dirty（只给内联脚本和 backDirty 自己读），新页面用事件处理函数与状态代替，所以忽略 #pgBack 上的这两个属性；变脏后的类名与文字仍逐字比较，点击行为另有测试
 */
export type Snap = string | { tag: string; attrs: Record<string, string>; children: Snap[] }

const BLANK = /^\s*\n\s*$/

export function snap(node: Node): Snap | null {
  if (node.nodeType === 3) {
    const t = node.textContent ?? ''
    return BLANK.test(t) ? null : t
  }
  if (node.nodeType !== 1) return null
  const el = node as Element
  const attrs: Record<string, string> = {}
  for (const a of Array.from(el.attributes)) {
    if (a.name === 'class') {
      const c = a.value.split(/\s+/).filter(Boolean).sort().join(' ')
      if (c) attrs.class = c
    } else if (a.name === 'style') {
      const css = (el as HTMLElement).style.cssText
      if (css) attrs.style = css
    } else if ((a.name === 'onclick' || a.name === 'data-dirty') && el.id === 'pgBack') {
      continue
    } else attrs[a.name] = a.value
  }
  if (el.tagName === 'TEXTAREA') {
    attrs.value = (el as HTMLTextAreaElement).value
    return { tag: 'textarea', attrs: sortKeys(attrs), children: [] }
  }
  const children: Snap[] = []
  let pending = ''
  const flush = () => {
    if (pending) children.push(pending)
    pending = ''
  }
  for (const c of Array.from(el.childNodes)) {
    const s = snap(c)
    if (typeof s === 'string') pending += s
    else if (s) {
      flush()
      children.push(s)
    }
  }
  flush()
  return { tag: el.tagName.toLowerCase(), attrs: sortKeys(attrs), children }
}

const sortKeys = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

/** 容器内全部子节点的快照。 */
export const snapChildren = (box: Element): Snap[] => {
  const out: Snap[] = []
  let pending = ''
  for (const c of Array.from(box.childNodes)) {
    const s = snap(c)
    if (typeof s === 'string') pending += s
    else if (s) {
      if (pending) out.push(pending)
      pending = ''
      out.push(s)
    }
  }
  if (pending) out.push(pending)
  return out
}

/** 节点总数（用于说明“逐节点”比较覆盖了多少节点）。 */
export function countNodes(s: Snap | Snap[]): number {
  if (Array.isArray(s)) return s.reduce<number>((n, x) => n + countNodes(x), 0)
  if (typeof s === 'string') return 1
  return 1 + countNodes(s.children)
}
