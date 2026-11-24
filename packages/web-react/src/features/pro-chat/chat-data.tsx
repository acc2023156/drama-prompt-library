import type { ReactNode } from 'react'
import { ICONS, type IconName } from '../../components/icons'
import { makeById } from '../../domain/library'
import { type StyleItem, styleList } from '../../domain/styles'
import { DATA, type Entry } from '../../data'
import { get } from '../../lib/storage'
import { SITE } from '../../lib/site'

/** PRO 对话框的常量与状态（旧 CONN、CTABS、RATIOS、chatState，site-template.html 第 1572–1585 行）。 */

/** 连接器选择（被 CSS 隐藏，DOM 与点击行为照旧保留）。 */
export const CONN: { v: string; l: string; svg: ReactNode }[] = [
  { v: 'Claude', l: 'Claude', svg: <svg viewBox="0 0 24 24"><path d="M12 2.5v7M12 14.5v7M2.5 12h7M14.5 12h7M5.3 5.3l5 5M13.7 13.7l5 5M5.3 18.7l5-5M13.7 10.3l5-5" stroke="#e07a4f" strokeWidth="2.6" strokeLinecap="round" fill="none" /></svg> },
  { v: 'ChatGPT', l: 'ChatGPT', svg: <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round"><path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6Z" /><path d="M12 3.2v8.8l7.6 4.4M12 12l-7.6 4.4" /></svg> },
  { v: 'Grok', l: 'Grok', svg: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#fff" /><circle cx="14.5" cy="9.5" r="2.2" fill="#111" /></svg> },
  { v: 'Qwen', l: 'Qwen', svg: <svg viewBox="0 0 24 24"><path d="M12 2.5 15 9l6.5 1.2-4.8 4.5 1.3 6.8L12 18.2 6 21.5l1.3-6.8-4.8-4.5L9 9Z" fill="#6c5ce7" /></svg> },
  { v: '云端模型', l: 'Other', svg: <svg viewBox="0 0 24 24" fill="none" stroke="#cfcfd6" strokeWidth="1.7" dangerouslySetInnerHTML={{ __html: ICONS.globe }} /> },
]

export type ChatTab = 'auto' | 'paste' | 'novel'
export const CTABS: { m: ChatTab; icon: IconName; l: string }[] = [
  { m: 'auto', icon: 'quill', l: '氛围写作' },
  { m: 'paste', icon: 'upload', l: '上传剧本' },
  { m: 'novel', icon: 'novel', l: '汇入小说' },
]

export const RATIOS = ['9:16', '16:9', '3:4', '1:1']

/** 对话框状态（pl.chat）。存储里可能带其他键（如 depth），原样保留。 */
export interface ChatState {
  tab: ChatTab
  doc: string
  pitch: string
  novel: string
  editing: boolean
  style: string
  ratio: string
  ai: string
  depth?: string
  [k: string]: unknown
}

/** 旧 chatState()：默认值合上 pl.chat；键的先后与旧页面相同（默认键在前），写回的 JSON 原文因此一致。 */
export const chatState = (): ChatState =>
  Object.assign({ tab: 'auto', doc: '', pitch: '', novel: '', editing: false, style: '无', ratio: '9:16', ai: 'Claude' }, get('chat') || {}) as ChatState

/** 旧 styleList()：每次调用时读 pl.asm 的自定义画风。 */
let byId: Record<string, Entry> | null = null
export function styles(): StyleItem[] {
  byId ??= makeById(SITE.entries)
  return styleList(DATA.core.styles, byId, (get('asm') || ({} as { custom?: string })).custom)
}
