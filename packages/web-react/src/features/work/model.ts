import { epMat, type VibeSx } from '../../domain/vibe'
import type { Work, WzSettings } from '../../domain/types'

/** 作品页的分页：旧 viewVibeScript 的 TABS 与 TAB_FN（每个分页让侧栏高亮哪个功能）。 */
export const TABS: [string, string][] = [['outline', '各集大纲'], ['script', '剧情对话'], ['assets', '角色资产库'], ['board', '分镜图'], ['listing', '上架资料']]
export const TAB_FN: Record<string, string> = { outline: 'script', script: 'script', assets: 'assets', board: 'storyboard', listing: 'script' }

/** AI 审稿按钮打开的网站（旧 AI_SITES）。 */
export const AI_SITES: Record<string, string> = { Claude: 'https://claude.ai/new', ChatGPT: 'https://chatgpt.com/', Grok: 'https://grok.com/', Qwen: 'https://chat.qwen.ai/' }

/** 等待页计时（旧 mmss）。 */
export const mmss = (sec: number): string => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

/** 一集的正文：去掉 vibeData 拼上的第一行标题（旧 epTxt）。 */
export const epText = (eps: string[], i: number): string => eps[i].split('\n').slice(1).join('\n').trim()

/** 导出与上架资料下载用的文件名：去掉 Windows 不允许的字符。 */
export const safeName = (title: string | undefined, fallback: string): string => (title || fallback).replace(/[\\/:*?"<>|]/g, '-')

/** 旧 yqRefresh（第 2808 行）：地址栏是这部作品的作品页时返回其中的分页（可能为空），不是则返回 null（不重画）。 */
export function hashTab(wid: string): { tab: string | undefined } | null {
  const m = location.hash.match(/^#\/script\/v\/([^/]+)\/?(\w+)?/)
  return m && m[1] === wid ? { tab: m[2] } : null
}

/** 写作进度条（旧 done-hero 里的立即执行函数）；不显示时返回 null。 */
export function progressOf(w: Work, s: VibeSx): { err: boolean; nx: number; n: number; pct: number; note: string | null } | null {
  const g = w.gen
  if (!(g && g.engine === 'yq' && g.data && g.status !== 'done')) return null
  const n = s.outline.length, k = (s.written || []).filter(Boolean).length, nx = Math.max(0, (s.written || []).indexOf(false)) + 1
  return { err: g.status === 'error', nx, n, pct: Math.round((k / n) * 100), note: g.note || null }
}

/** 角色资产库分页的条目（旧第 3056–3067 行）：模型写的人物优先，没有就用本地草稿的主角、感情线、对手与主要场景。键序与旧页面一致（会写进 pl.assetSeed）。 */
export interface AssetItem {
  fn: string
  label: string
  name: string
  sub?: string
  profile: string
}

export function assetItems(s: VibeSx, W: WzSettings, eps: string[]): AssetItem[] {
  const core = [W.pitch, W.core].filter((x) => x && x.trim()).join('；')
  const locCount: Record<string, number> = {}
  eps.forEach((e) => epMat(e).locs.forEach((l) => (locCount[l] = (locCount[l] || 0) + 1)))
  const topLocs = Object.keys(locCount).sort((a, b) => locCount[b] - locCount[a]).slice(0, 4)
  const items: AssetItem[] = s.cast && s.cast.length ? [
    ...s.cast.slice(0, 6).map((c) => ({ fn: 'role-board', label: c.role.split(/[·・\s]/)[0], name: c.name, profile: `${c.name}（${c.role}）\n${c.bio}` })),
    ...topLocs.map((l) => ({ fn: 'scene-board', label: l, name: l, sub: '场景', profile: l })),
  ] : [
    { fn: 'role-board', label: s.leads[0], name: s.name, profile: `${s.leads[0]}${s.name}。${core}` },
    { fn: 'role-board', label: s.leads[1], name: s.name2, profile: `${s.leads[1]}${s.name2}，${s.name}的感情线对象。${core}` },
    { fn: 'role-board', label: '对手', name: '对手', sub: `与${s.name}作对的人`, profile: `与${s.name}作对的人。${core}` },
    { fn: 'scene-board', label: '主要场景', name: '主要场景', sub: W.genre, profile: [W.genre, core].filter(Boolean).join('；') },
  ]
  if (!items.some((x) => x.fn === 'scene-board')) items.push({ fn: 'scene-board', label: '主要场景', name: '主要场景', sub: W.genre, profile: [W.genre, core].filter(Boolean).join('；') })
  return items
}

/** AI 审稿的提示词（旧 vtAI 点击处理）。 */
export function reviewText(title: string, eps: string[]): string {
  return [`你是短剧剧本审稿编辑。以下是《${title}》10 集剧本，请逐集审稿：`,
    '1. 红线：未成年、暴力色情、政治敏感、违法引导等合规问题，指出位置并直接给出改法。',
    '2. 前后文：人名、身份、伏笔、设定是否前后一致；改一处要同步改哪些地方。',
    '3. 节奏与钩子：每集开头 3 秒是否抓人、结尾是否留钩子，冲突是否成立。',
    '4. 对白：是否口语、有没有说明腔，人物说话是否有辨识度。',
    '先给总评（三句以内），再按集列出问题与改法，最后输出修改后的完整剧本。', '', `《${title}》`, '', eps.join('\n\n---\n\n')].join('\n')
}
