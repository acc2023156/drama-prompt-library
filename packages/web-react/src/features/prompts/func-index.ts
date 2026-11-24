import { ASSET_NAV } from '../../app/nav-data'
import { FN } from '../assets/menus'

/**
 * 搜索时一并找出剧本 / 资产库 / 分镜里的相关功能：旧 funcIndex（site-template.html 第 3494 行）。
 * 角色类型数据来自内嵌 DATA.roles；资产功能的目录来自 nav-data，说明文字来自资产库的完整菜单。
 */
export interface FuncPick {
  pro: boolean
  g?: 'male' | 'female'
  idx?: number
}
export interface FuncHit {
  fn: string
  title: string
  desc: string
  href: string
  /** 小写后的检索串：标题 + 说明 + 关键词 */
  kw: string
  pick?: FuncPick
}

/** 资产功能的说明文字：取自资产库的完整菜单（旧 ASSET_MENUS 的 desc）。 */
export const ASSET_DESC: Record<string, string> = Object.fromEntries(Object.entries(FN).map(([id, f]) => [id, f.desc]))

export type RoleTypes = Record<'male' | 'female', Record<string, unknown>[]>

export function funcIndex(roles: RoleTypes): FuncHit[] {
  const L: FuncHit[] = []
  const add = (fn: string, title: string, desc: string, href: string, kw: string, pick?: FuncPick) =>
    L.push({ fn, title, desc, href, kw: (title + ' ' + desc + ' ' + kw).toLowerCase(), pick })
  add('script', '人物即剧本', '标准版：选主角，一键产出 10 集剧本', '#/script', '剧本 编剧 人物 角色 主角 男主 女主 男频 女频 一键 10集', { pro: false })
  add('script', '新增作品', 'PRO：策划文件 → 骨架 → 规格 → 补充设定 → 确认', '#/script/new', '剧本 编剧 策划 大纲 小说 改编 卖点 作品 男主 女主 主角 对手', { pro: true })
  for (const g of ['male', 'female'] as const)
    roles[g].forEach((t, i) =>
      add('script', t.type as string, `${g === 'male' ? '男频' : '女频'} · ${t.gold}`, '#/script', `剧本 人物 角色 主角 ${g === 'male' ? '男频 男主' : '女频 女主'} ${Object.values(t).join(' ')}`, { pro: false, g, idx: i }),
    )
  for (const m of ASSET_NAV)
    for (const i of m.items)
      add('assets', i.label, ASSET_DESC[i.id], '#/assets/' + i.id, `资产 ${m.title} ${m.key === 'role' ? '角色 人物 主角 男主 女主 对手 设定 三视图 特写' : '场景 空镜 设定 天气 昼夜'}`)
  add('storyboard', '分镜', '把剧本拆成分镜表，再组装成视频提示词', '#/storyboard', '分镜 镜头 视频 分镜表 成片')
  add('storyboard', '6.0 组装器', '组装每集 4～6 段视频提示词，可换画风', '#/assembler', '分镜 视频 组装 6.0 画风 镜头')
  return L
}

/** 搜索词命中的相关功能（旧 drawFuncHits 的筛选与排序）：每个词都要出现在检索串里，标准版的角色类型排在后面。 */
export function funcHits(roles: RoleTypes, q: string): FuncHit[] {
  const toks = q.trim().toLowerCase().split(/[\s,，、]+/).filter(Boolean)
  if (!toks.length) return []
  return funcIndex(roles)
    .filter((x) => toks.every((t) => x.kw.includes(t)))
    .sort((a, b) => Number(!!(a.pick && a.pick.g)) - Number(!!(b.pick && b.pick.g)))
}
