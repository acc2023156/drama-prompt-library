import { ICONS, type IconName } from './icons'

/** 线框图标：输出与旧 ico(n) 相同的 <svg viewBox="0 0 24 24">…</svg>。图标内容是本文件内的常量，不含外部输入。 */
export function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
}

/** 旧 ico(n) 的字符串形式，给仍需拼 HTML 的地方（如 markdown 代码卡）。 */
export const icoHtml = (name: IconName): string => `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`
