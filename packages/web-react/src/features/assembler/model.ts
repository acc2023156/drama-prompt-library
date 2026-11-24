import { type AsmCore, type AsmState, asmGenreStyle } from '../../domain/assembler'
import { cmpId } from '../../domain/library'
import type { Work } from '../../domain/types'
import { vibeData } from '../../domain/vibe'

/** 补丁条目的章节：旧 viewAssembler 的 SEC，只有这七个会列出。 */
export const SECTIONS = '一二三四五六七'

export interface PatchEntry {
  id: string
  title: string
  patches?: string[]
}

/** 旧 viewAssembler 开头的补丁分组：每个补丁章节对应的条目，按编号排序。 */
export function patchGroups(entries: PatchEntry[]): [string, PatchEntry[]][] {
  const patches: Record<string, PatchEntry[]> = {}
  entries.forEach((e) => (e.patches || []).forEach((s) => (patches[s] = patches[s] || []).push(e)))
  return [...SECTIONS].filter((s) => patches[s]).map((s) => [s, patches[s].sort((a, b) => cmpId(a.id, b.id))])
}

export interface AsmSaved {
  /** pl.asm：整体组装器上次的选择 */
  asm: { style?: string; custom?: string } | null
  /** pl.asmW：每个作品各自的分镜画风 */
  asmW: Record<string, { style: string; custom?: string }> | null
  /** pl.works：含回收站里的作品，旧实现不过滤 */
  works: Work[] | null
}

export interface AsmInit {
  st: AsmState
  /** 分镜编辑模式的作品；普通组装器为 undefined */
  work?: Work
  /** 分镜编辑模式追加的那一集剧本 */
  epTxt: string
  /** 标题区：普通模式是固定标题；分镜编辑模式是“第 N 集”与作品名 */
  head: { title: string; meta: string }
}

const PLAIN_HEAD = { title: '6.0 视频专用提示词 · 组装器', meta: '分镜表 → 每集 4~6 段长视频提示词（生产在用）' }

/**
 * 旧 viewAssembler 渲染前的状态初始化（读 store、按作品定默认画风、取某一集剧本）。
 * 旧实现里 ?ep= 的集序越界（NaN、负数、作品没有任何一集）时在拼标题处抛异常，页面保留上一页；
 * 这里返回 null，由页面不渲染内容，与路由对照文档对 TOOLS 原型键的处理一致。
 */
export function initAssembler(core: AsmCore, ep: { wid: string; i: number } | undefined, saved: AsmSaved): AsmInit | null {
  const styles = Object.keys(core.styles)
  const s = saved.asm || {}
  const st: AsmState = {
    style: s.style && (s.style === '__custom' || styles.includes(s.style)) ? s.style : styles[0],
    custom: s.custom || '',
    opts: {},
  }
  const work = ep && (saved.works || []).find((x) => x.id === ep.wid)
  if (!work) return { st, epTxt: '', head: PLAIN_HEAD }

  const mine = (saved.asmW || {})[work.id]
  if (mine) {
    st.style = mine.style
    st.custom = mine.custom || ''
  } else {
    const g = asmGenreStyle(work)
    if (g === '末日废土写实' && styles.includes(g)) st.style = g
    else {
      st.style = '__custom'
      st.custom = g
    }
  }
  try {
    const { s: sx, eps } = vibeData(work)
    const i = Math.min(ep.i, eps.length - 1)
    return {
      st,
      work,
      epTxt: eps[i],
      head: { title: `第 ${i + 1} 集：${sx.outline[i][0]}`, meta: `《${String(work.title)}》· 分镜图编辑` },
    }
  } catch {
    return null
  }
}

/** 旧 viewTool('storyboard') 的跳转目标：最近打开的氛围写作作品，没有记录就取列表里第一个。回收站里的作品也算（旧实现不过滤）。 */
export function lastVibeWork(works: Work[] | null, lastVibe: string | null): Work | undefined {
  const vs = (works || []).filter((w) => w.kind === 'vibe')
  return vs.find((w) => w.id === lastVibe) || vs[0]
}
