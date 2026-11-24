/** 旧页面 esc：转义 HTML 的 & < > "。 */
export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c as '&' | '<' | '>' | '"'])

/** 旧页面 nfmt：千分位（en-US）。 */
export const nfmt = (n: number): string => n.toLocaleString('en-US')
