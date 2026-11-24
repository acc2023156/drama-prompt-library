/**
 * hash 路由解析：旧 parse()（site-template.html 第 3664 行）的逐行移植，判定顺序与回落规则不能改。
 * 旧函数直接读 location.hash、byId 与 store('works')；这里改为参数传入，便于与旧实现逐字段对照。
 */

export type VibeTab = 'outline' | 'script' | 'assets' | 'board' | 'listing'

export interface Route {
  view: 'membership' | 'entry' | 'list' | 'assembler' | 'changelog' | 'admin' | 'hotwords' | 'trash' | 'tool' | 'partner' | 'home' | 'start'
  /** entry：提示词编号与所在目录（编号不存在时 folder 为 undefined） */
  id?: string
  folder?: string
  /** assembler?ep=<wid>.<i>：命中本地作品时的分镜编辑上下文 */
  ep?: { wid: string; i: number }
  vibe?: { id: string; title?: string; tab: string }
  tool?: string
  sub?: 'result' | 'new' | 'vibe'
  sid?: string
  fresh?: boolean
  wid?: string
  vtab?: string
  fn?: string
  idx?: number | null
}

/** 顶栏三个功能入口（旧 TOOLS 的键）。保持普通对象，判定方式与旧 TOOLS[h] 相同。 */
export const TOOLS: Record<string, { label: string }> = {
  script: { label: '剧本' },
  assets: { label: '资产库' },
  storyboard: { label: '分镜' },
}

export interface RouteDeps {
  /** 提示词编号 → 所在目录（旧 byId[id].folder） */
  entryFolder(id: string): string | undefined
  /** 本地作品（旧 store('works').find） */
  findWork(id: string): { id: string; title?: string } | undefined
}

export function parseRoute(hash: string, deps: RouteDeps): Route {
  const h = hash.replace(/^#\/?/, '')
  if (h === 'membership') return { view: 'membership' }
  if (h.startsWith('e/')) return { view: 'entry', id: h.slice(2), folder: deps.entryFolder(h.slice(2)) }
  if (h.startsWith('f/')) return { view: 'list', folder: h.slice(2) }
  if (h === 'assembler' || h === 'changelog' || h === 'admin' || h === 'hotwords' || h === 'trash') return { view: h }
  if (h.startsWith('assembler?ep=')) {
    const [wid, i] = h.slice(13).split('.')
    const w = deps.findWork(wid)
    return w ? { view: 'assembler', ep: { wid, i: +i }, vibe: { id: wid, title: w.title, tab: 'board' } } : { view: 'assembler' }
  }
  if (h.startsWith('script/s/')) {
    const [id, q] = h.slice(9).split('?')
    return { view: 'tool', tool: 'script', sub: 'result', sid: id, fresh: q === 'new=1' }
  }
  if (h === 'script/new') return { view: 'tool', tool: 'script', sub: 'new' }
  if (h.startsWith('script/v/')) {
    const [wid, vtab] = h.slice(9).split('/')
    return { view: 'tool', tool: 'script', sub: 'vibe', wid, vtab }
  }
  if (h.startsWith('script/w/')) return { view: 'tool', tool: 'script', sub: 'new', wid: h.slice(9) }
  if (h.startsWith('assets/')) {
    const [fn, q] = h.slice(7).split('?i=')
    return { view: 'tool', tool: 'assets', fn, idx: q == null ? null : +q }
  }
  if (h === 'partner') return { view: 'partner' }
  if (TOOLS[h]) return { view: 'tool', tool: h }
  if (h === 'prompts') return { view: 'home' }
  return { view: 'start' }
}

/** 路由所属的顶栏功能（旧 funcOf）。 */
export const funcOf = (r: { view: string; tool?: string }): string =>
  r.view === 'tool' ? r.tool! : r.view === 'start' || r.view === 'partner' ? 'script' : r.view === 'assembler' ? 'storyboard' : 'prompts'
