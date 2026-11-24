import type { Entry, TjData } from '../data'

/** 提示词目录（旧 NAV，site-template.html 第 1095 行）。 */
export interface NavChapter {
  key: string
  icon: string
  label: string
  subs?: [string, string][]
}
export const NAV: NavChapter[] = [
  { key: '01-outline', icon: 'bulb', label: '立项与大纲' },
  { key: '02-adaptation', icon: 'fileText', label: '小说转剧本' },
  { key: '03-revision', icon: 'pen', label: '剧本精修', subs: [
    ['03-revision/dialogue', '对白与台词'], ['03-revision/de-ai', '去 AI 味'], ['03-revision/trim', '删减'],
    ['03-revision/review', '审核与检查'], ['03-revision/shootability', '可拍性 / OS·VO'], ['03-revision/craft', '其他手法']] },
  { key: '06-video', icon: 'film', label: '视频生成', subs: [
    ['06-video/core', '6.0 主模板'], ['06-video/patches', '6.0 补丁'], ['06-video/styles', '画风块'], ['06-video/reference', '参考与示例']] },
  { key: '07-compliance', icon: 'shield', label: '合规' },
  { key: 'archive', icon: 'box', label: '归档' },
]

/** 提示词编号比较：'2.10' 排在 '2.9' 后（旧 cmpId；domain/library 有同名函数，lib 不依赖 domain，这里保留一份私有实现，结果由对照测试保证）。 */
function cmpId(a: string, b: string): number {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  return x[0] - y[0] || x[1] - y[1]
}

export const chapterOf = (folder: string | undefined): NavChapter | null =>
  folder ? NAV.find((n) => folder === n.key || folder.startsWith(n.key + '/')) ?? null : null

export interface ContentIndex {
  /** 按编号排序的全部提示词（旧 ENTRIES）。 */
  entries: Entry[]
  byId: Map<string, Entry>
  groupLabel: Record<string, string>
  /** 某目录及其子目录下的提示词（旧 inFolder）。 */
  inFolder(k: string): Entry[]
}

export function indexContent(data: TjData): ContentIndex {
  const entries = data.entries.slice().sort((a, b) => cmpId(a.id, b.id))
  return {
    entries,
    byId: new Map(entries.map((e) => [e.id, e])),
    groupLabel: Object.fromEntries(data.groups.map((g) => [g.key, g.label])),
    inFolder: (k) => entries.filter((e) => e.folder === k || e.folder.startsWith(k + '/')),
  }
}
