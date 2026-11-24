import type { IconName } from '../../components/icons'

/** 预览格：[图标, 渐变色序号（旧 G）, 可选 grid-row] */
export type PvTile = [IconName, number, string?]
export interface AssetPv {
  cols: string
  tiles: PvTile[]
}
export interface AssetItem {
  id: string
  icon: IconName
  label: string
  desc: string
  pv: AssetPv
  /** 参考图节点的名称，按顺序对应提示词里的图1、图2…… */
  inputs: string[]
  /** 名称输入框的占位文字，未填名称时也代入模板 */
  name: string
  /** 多选项（如昼夜天气）与默认选中 */
  opts?: string[]
  optDefault?: string[]
  /** 提示词模板：{name}、{profile}、{opts} */
  tpl: string
}
export interface AssetMenu {
  key: 'role' | 'scene'
  title: string
  stack: IconName[]
  items: AssetItem[]
}

/** 资产库两个菜单（旧 ASSET_MENUS，site-template.html 第 1193 行），逐字取自旧页面，由对照测试核对。 */
export const ASSET_MENUS: AssetMenu[] = [
  { key: 'role', title: '创建角色', stack: ['user', 'user', 'user'], items: [
    { id: 'role-new', icon: 'plus', label: '新建角色节点', desc: '新建一个空白角色，先写好角色档案，后面再接设定板或特写。',
      pv: { cols: '1fr', tiles: [['user', 0]] }, inputs: [], name: '角色名',
      tpl: '角色：{name}\n角色档案：{profile}' },
    { id: 'role-board', icon: 'board', label: '角色设定板', desc: '根据角色档案和人物参考图创建角色',
      pv: { cols: '1.4fr 1fr 1fr', tiles: [['user', 0, 'span 2'], ['user', 1], ['user', 2], ['user', 3], ['user', 1]] }, inputs: ['人物参考'], name: '角色名',
      tpl: '根据图1的人物参考和以下角色档案，为角色\u300c{name}\u300d生成一张角色设定板：正面、侧面、背面全身三视图，脸部特写，4 个常用表情，服装与配饰细节拆解。人物比例与五官全图一致，纯色浅灰背景，均匀柔光，角落标注角色名。\n角色档案：{profile}' },
    { id: 'role-close', icon: 'user', label: '角色特写', desc: '根据角色参考图生成角色三视图与脸部特写图',
      pv: { cols: '1.2fr 1fr 1fr 1fr', tiles: [['user', 0], ['user', 1], ['user', 1], ['user', 1]] }, inputs: ['角色参考'], name: '角色名',
      tpl: '以图1为角色\u300c{name}\u300d的参考，生成角色三视图（正面、侧面、背面全身）与一张脸部特写。五官、发型、服装、体型与参考完全一致，不添加新配饰；纯色背景，正面柔光，便于后续作为视频生成的角色素材。' },
    { id: 'role-split', icon: 'split', label: '脸身分离图', desc: '分别准备面部与服装参考，涂抹遮挡小脸。',
      pv: { cols: '1fr 1.6fr', tiles: [['user', 0], ['board', 2]] }, inputs: ['脸部参考', '服装参考'], name: '角色名',
      tpl: '图1为角色\u300c{name}\u300d的脸部参考，图2为服装参考。生成一张左右拼接图：左侧为脸部特写，严格保持图1五官；右侧为全身服装展示，严格保持图2服装款式与配色，服装图中人物的脸部用涂抹遮挡，避免和脸部参考混淆。纯色背景。' },
  ] },
  { key: 'scene', title: '创建场景', stack: ['mount', 'mount', 'mount'], items: [
    { id: 'scene-new', icon: 'plus', label: '新建场景节点', desc: '新建一个空白场景，先写好场景档案，后面再接设定板或变体。',
      pv: { cols: '1fr', tiles: [['mount', 2]] }, inputs: [], name: '场景名',
      tpl: '场景：{name}\n场景档案：{profile}' },
    { id: 'scene-board', icon: 'board', label: '场景设定板', desc: '根据场景档案和场景参考图创建场景',
      pv: { cols: '1.6fr 1fr', tiles: [['mount', 0, 'span 2'], ['mount', 2], ['mount', 1]] }, inputs: ['场景参考'], name: '场景名',
      tpl: '根据图1的场景参考和以下场景档案，为场景\u300c{name}\u300d生成一张场景设定板：一张全景主视图，2～3 个常用机位视角，关键陈设、道具与材质特写。空间结构、陈设位置在各视角间一致，光线来源统一，角落标注场景名。\n场景档案：{profile}' },
    { id: 'scene-var', icon: 'sun', label: '昼夜天气变体', desc: '基于参考场景生成白天、夜晚、雨天场景',
      pv: { cols: '1fr 1fr 1fr', tiles: [['sun', 1], ['moon', 0], ['rain', 2]] }, inputs: ['参考场景'], name: '场景名',
      opts: ['白天', '黄昏', '夜晚', '雨天', '雪天', '雾天'], optDefault: ['白天', '夜晚', '雨天'],
      tpl: '以图1为场景\u300c{name}\u300d的参考，保持空间结构、陈设、机位和构图不变，分别生成以下版本：{opts}。每个版本只改变时间、天气和对应的光线、色温、地面与空气状态，不增加人物和新物件。' },
    { id: 'scene-empty', icon: 'frame', label: '无人物空镜', desc: '基于参考场景生成无人物、无肢体的空镜',
      pv: { cols: '1fr', tiles: [['frame', 0]] }, inputs: ['参考场景'], name: '场景名',
      opts: ['全景', '中景', '近景特写', '俯拍', '低机位'], optDefault: ['全景'],
      tpl: '以图1为场景\u300c{name}\u300d的参考，生成无人物、无肢体、无人影的空镜，景别与机位：{opts}。保持场景结构、陈设和光线与参考一致，画面安静克制，可用于转场和环境交代。' },
  ] },

]

export type AssetFn = AssetItem & { menu: AssetMenu }
/** 功能 id → 功能（带所属菜单），旧 FN。 */
export const FN: Record<string, AssetFn> = Object.fromEntries(ASSET_MENUS.flatMap((m) => m.items.map((i) => [i.id, { ...i, menu: m }])))
