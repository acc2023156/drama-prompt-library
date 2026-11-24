import { get } from '../../lib/storage'
import { type AssetFn, FN } from './menus'

/** 作品页“角色资产库”带来的导入清单（pl.assetSeed）。 */
export interface SeedItem {
  fn: string
  label: string
  name?: string
  profile?: string
  sub?: string
  done?: boolean
  [k: string]: unknown
}
export type AssetSeed = {
  wid: string
  title?: string
  items: SeedItem[]
}

/** 编辑器的表单状态；保存时去掉 imgs（参考图不保存）。 */
export interface AssetState {
  name?: string
  profile?: string
  extra?: string
  style: string
  ratio: string
  res: string
  opts: string[]
  imgs?: string[]
  [k: string]: unknown
}
export type SavedAsset = {
  fn: string
  name?: string
  prompt?: string
  state?: AssetState
  time?: number
}

export const readAssets = (): SavedAsset[] => (get('assets') as SavedAsset[] | null) || []

/** 功能 id 查表：只认菜单里的 id（旧 FN[id] 会命中 constructor 等原型键）。 */
export const fnOf = (id: string): AssetFn | undefined => (Object.hasOwn(FN, id) ? FN[id] : undefined)

/** 导入完成后“去分镜”的目标（旧 seedBoard）：作品还在且是氛围写作作品就去它的分镜页。 */
export const seedBoard = (sd: AssetSeed): string =>
  (get('works') || []).some((w) => w.id === sd.wid && w.kind === 'vibe') ? `#/script/v/${sd.wid}/board` : '#/storyboard'
