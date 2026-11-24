import type { WzSettings } from '../../../domain/types'

/** 作品卡存进 pl.vibeCard 的内容：作品设定去掉撞题结果 dup。 */
export type CardKeep = Omit<WzSettings, 'dup'>

/** 对话框挂载作品卡的接口（P4-A 与 P4-B 的约定）。 */
export interface WorkCardProps {
  /** 卡片初始设定：WZ_DEF 合上 pl.vibeCard（旧 Object.assign({}, WZ_DEF, V)）。 */
  value: WzSettings
  /** 每次改动后调用，参数为去掉 dup 的设定（旧 bindWcard 的 save）。 */
  onChange(keep: CardKeep): void
  /** 右上角 ×：回到对话框输入（旧 bindWcard 的 close）。 */
  onClose(): void
}
