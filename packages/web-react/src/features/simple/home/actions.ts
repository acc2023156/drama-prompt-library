import { SX_NAMES, SX_TITLES, pick, sxBuildWork, sxOutline } from '../../../domain/sx'
import type { Gender, SxState, SxTemplate } from '../../../domain/types'
import { WZ_DEF, wzGuess } from '../../../domain/wz'
import { depthOf } from '../../../domain/yq'
import { get, set } from '../../../lib/storage'
import { HOT_PITCH, type HotFeed, type StarRow } from './orbit-data'

/** 标准版首页的选择状态（pl.sxPick）。 */
export interface Pick {
  g: Gender
  idx: number | null
  name: string
  title: string
  q: string
  [k: string]: unknown
}
export const DEFAULT_PICK = (): Pick => ({ g: 'male', idx: null, name: '', title: '', q: '' })

/** 旧 chatState()（第 1585 行）：PRO 对话框状态的默认值合上 pl.chat。 */
export const chatState = (): Record<string, any> =>
  Object.assign({ tab: 'auto', doc: '', pitch: '', novel: '', editing: false, style: '无', ratio: '9:16', ai: 'Claude' }, get('chat') || {})

/** 旧 openHot：点热点星体，带一句起手故事进 PRO 氛围写作（写 chat、vibeCard、pro 后跳 #/script）。 */
export function openHot(d: StarRow, hot: HotFeed | null): void {
  const d1 = d[1] as string | undefined
  const C = chatState(),
    pitch = hot && d1 && d1.length > 8 ? d1 : (HOT_PITCH[d[0]] || d[0]),
    g = wzGuess(pitch)
  set('chat', { ...C, tab: 'auto', pitch })
  set('vibeCard', Object.assign({}, WZ_DEF, { mode: 'auto', pitch, ai: C.ai, style: C.style, ratio: C.ratio, mins: 1, depth: depthOf(C) }, g, { hooks: g.hooks }))
  set('pro', true)
  location.hash = '#/script'
}

/** 旧 openRole 的存储部分：选中某个角色并记住角色库位置；write = 直接去创作平台。 */
export function storeRolePick(g: Gender, i: number, write: boolean): void {
  set('sxPick', { g, idx: i, name: '', title: '', q: '' })
  set('homeMode', write ? 'create' : 'lib')
  set('libNav', { lv: 'role', g, i })
}

/** 旧 randomize：随机主角名与剧名（剧名里的 {n} 换成名字）。 */
export function randomName(g: Gender): { name: string; title: string } {
  const name = pick(SX_NAMES[g])
  return { name, title: pick(SX_TITLES[g]).replace('{n}', name) }
}

/** 旧一键产出：拼标准版结果、写 works、清 sxPick，返回结果页地址。st.name 已非空。 */
export function produce(st: Pick, t: SxTemplate): string {
  const s: SxState = {
    id: 's' + Date.now().toString(36),
    g: st.g,
    role: t,
    name: st.name.trim(),
    title: st.title.trim() || pick(SX_TITLES[st.g]).replace('{n}', st.name.trim()),
    idea: '',
  } as SxState
  s.outline = sxOutline(t, s.name, s.g)
  set('works', sxBuildWork(get('works') || [], s, Date.now()).list)
  set('sxPick', null)
  return '#/script/s/' + s.id + '?new=1'
}
