import type { IconName } from '../components/icons'

/** 顶栏四大功能（旧 FUNCS，site-template.html 第 3205 行）。 */
export const FUNCS: { k: string; icon: IconName; label: string; href: string }[] = [
  { k: 'script', icon: 'script', label: '剧本', href: '#/script' },
  { k: 'assets', icon: 'assets', label: '资产库', href: '#/assets' },
  { k: 'storyboard', icon: 'play', label: '分镜', href: '#/storyboard' },
  { k: 'prompts', icon: 'grid', label: '提示词', href: '#/prompts' },
]

/**
 * 资产库侧栏目录：旧 ASSET_MENUS（第 1193 行）中侧栏用到的字段。完整菜单（预览、模板）归 features/assets；
 * 两边的 id、标题、图标与旧页面一致由对照测试保证。
 */
export const ASSET_NAV: { key: string; title: string; items: { id: string; icon: IconName; label: string }[] }[] = [
  { key: 'role', title: '创建角色', items: [
    { id: 'role-new', icon: 'plus', label: '新建角色节点' },
    { id: 'role-board', icon: 'board', label: '角色设定板' },
    { id: 'role-close', icon: 'user', label: '角色特写' },
    { id: 'role-split', icon: 'split', label: '脸身分离图' },
  ] },
  { key: 'scene', title: '创建场景', items: [
    { id: 'scene-new', icon: 'plus', label: '新建场景节点' },
    { id: 'scene-board', icon: 'board', label: '场景设定板' },
    { id: 'scene-var', icon: 'sun', label: '昼夜天气变体' },
    { id: 'scene-empty', icon: 'frame', label: '无人物空镜' },
  ] },
]
/** 资产功能 id → {label, 所属菜单 key}（旧 FN 的侧栏部分）。 */
export const ASSET_FN: Record<string, { label: string; menu: string }> = Object.fromEntries(
  ASSET_NAV.flatMap((m) => m.items.map((i) => [i.id, { label: i.label, menu: m.key }])),
)
