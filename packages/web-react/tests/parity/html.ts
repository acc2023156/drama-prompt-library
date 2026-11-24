/** 新旧 HTML 片段的结构化比较：只抽取对用户有意义的部分（链接、标题、分隔线、按钮），忽略属性顺序与转义写法差异。 */

const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&nbsp;': ' ' }
export const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|nbsp|#x27|#39);/g, (m) => ENT[m])
export const textOf = (html: string) => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s>/])`))
  return m ? decode(m[1] ?? '') : null
}
const classes = (tag: string) => (attr(tag, 'class') || '').split(/\s+/).filter(Boolean).sort().join(' ')

export type NavItem =
  | { t: 'a'; href: string | null; cls: string; pro: boolean; text: string }
  | { t: 'title'; text: string }
  | { t: 'hr' }
  | { t: 'button'; id: string | null; cls: string; text: string }

/** 按出现顺序抽取 <a>、.ps-title、.ps-hr 与 <button>。 */
export function navItems(html: string): NavItem[] {
  const out: NavItem[] = []
  const re = /<a\b[^>]*>[\s\S]*?<\/a>|<div class="ps-title">[\s\S]*?<\/div>|<div class="ps-hr"><\/div>|<button\b[^>]*>[\s\S]*?<\/button>/g
  for (const m of html.matchAll(re)) {
    const s = m[0]
    const open = s.slice(0, s.indexOf('>') + 1)
    if (s.startsWith('<a')) out.push({ t: 'a', href: attr(open, 'href'), cls: classes(open), pro: attr(open, 'data-pro') !== null, text: textOf(s) })
    else if (s.startsWith('<button')) out.push({ t: 'button', id: attr(open, 'id'), cls: classes(open), text: textOf(s) })
    else if (s.includes('ps-hr')) out.push({ t: 'hr' })
    else out.push({ t: 'title', text: textOf(s) })
  }
  return out
}
