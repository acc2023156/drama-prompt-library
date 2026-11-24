/**
 * DOM 逐节点比较：把节点转成可 toStrictEqual 的树。
 * 归一规则（只处理“同义不同写”，不吞内容差异）：
 * - 相邻文本节点合并；只含空白的文本节点丢弃（旧模板字符串里的缩进换行），pre 内保留
 * - 属性按名字排序；class 按词排序、空 class 视为没有；style 拆成 [属性, 值] 列表。
 *   css 模式（默认）：style 先经 jsdom 的 CSSOM 重新序列化再比较（实时 DOM 里 React 写的样式已被 CSSOM 规范化，
 *   如颜色转 rgb、数字去浮点尾巴，旧页面模板里的原文也要走同一规范化）；
 *   raw 模式：不经 CSSOM，只去掉空白后按声明比较（用于 React 服务端渲染出的 HTML 对旧页面原文，逐字符核对数值与颜色写法）
 * - 只有旧代码用来绑事件的 data-x / data-dl / data-cp 钩子不比较（新版靠 React 事件，见 ignoreAttrs）
 */
export type Tree = { tag: string; attrs: [string, string][]; children: (Tree | string)[] } | string

const BIND_HOOKS = new Set(['data-x', 'data-dl', 'data-cp'])

export function styleDecls(css: string): [string, string][] {
  return css
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':')
      return [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()] as [string, string]
    })
}

export interface TreeOpt {
  raw?: boolean
}

export function tree(node: Node, opt: TreeOpt = {}, ignoreAttrs: Set<string> = BIND_HOOKS): Tree {
  if (node.nodeType === 3) return node.textContent ?? ''
  const el = node as Element
  const attrs: [string, string][] = []
  for (const a of Array.from(el.attributes)) {
    if (ignoreAttrs.has(a.name)) continue
    if (a.name === 'class') {
      const c = a.value.split(/\s+/).filter(Boolean).sort().join(' ')
      if (c) attrs.push(['class', c])
    } else if (a.name === 'style') {
      let css = a.value
      if (!opt.raw) {
        const probe = el.ownerDocument.createElement('div')
        probe.style.cssText = a.value
        css = probe.style.cssText
      }
      const d = styleDecls(css)
      if (d.length) attrs.push(['style', JSON.stringify(d)])
    } else attrs.push([a.name, a.value])
  }
  attrs.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
  const keepWs = el.tagName.toLowerCase() === 'pre'
  const children: (Tree | string)[] = []
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === 8) continue
    const t = tree(c, opt, ignoreAttrs)
    if (typeof t === 'string') {
      if (!keepWs && !t.trim()) continue
      if (typeof children[children.length - 1] === 'string') children[children.length - 1] += t
      else children.push(t)
    } else children.push(t)
  }
  return { tag: el.tagName.toLowerCase(), attrs, children }
}

/** 一个容器下的全部子节点（容器自身不进树）。 */
export const childrenTree = (host: Element, opt: TreeOpt = {}): Tree[] => (tree(host, opt) as Exclude<Tree, string>).children as Tree[]
