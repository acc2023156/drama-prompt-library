import { listingText } from '../../domain/listing'
import { epMat, type VibeSx } from '../../domain/vibe'
import type { Work, WzSettings } from '../../domain/types'
import type { ZipFile } from '../../lib/zip'
import { epText, safeName } from './model'

/**
 * 导出的文件清单（旧 exportFiles，第 3105–3117 行）：项目 ZIP 与 XTASY 导入包是同一份内容，只是文件名不同。
 * 文件顺序、JSON 缩进与键序都与旧页面一致；BOM 由 makeZip 按扩展名加。now 是导出时刻（exportedAt）。
 */
export function exportFiles(w: Work, s: VibeSx, W: WzSettings, eps: string[], now: Date): { safe: string; files: ZipFile[] } {
  const safe = safeName(w.title, '天玑作品')
  const files: ZipFile[] = [
    { name: 'project.json', text: JSON.stringify({ format: 'tianji-project', version: 1, title: w.title, exportedAt: now.toISOString(), settings: W }, null, 2) },
    { name: 'XTASY/manifest.json', text: JSON.stringify({ format: 'xtasy-import', version: 1, project: w.title, aspectRatio: W.ratio || '9:16', episodes: s.outline.map(([title], i) => ({ episode: i + 1, title, promptFile: `../剧本/第${String(i + 1).padStart(2, '0')}集-剧情对话.txt`, storyboardFile: `../分镜/第${String(i + 1).padStart(2, '0')}集.json` })) }, null, 2) },
    { name: 'XTASY/导入说明.txt', text: '此压缩包已按 XTASY 项目交换格式整理。打开 XTASY 后进入项目/画布导入，选择本 ZIP；若当前版本不支持整包导入，可使用剧本目录中的单集文本逐集创建。' },
    { name: '资产/资产清单.json', text: JSON.stringify({ characters: [s.name, s.name2, '对手'], scenes: ['主要场景'], ratio: W.ratio || '9:16' }, null, 2) },
  ]
  if (w.listing) files.unshift({ name: '上架资料.txt', text: listingText(w) })
  s.outline.forEach(([title, outline], i) => {
    const no = String(i + 1).padStart(2, '0'), t = epText(eps, i), m = epMat(t)
    files.push(
      { name: `剧本/第${no}集-大纲.txt`, text: `第 ${i + 1} 集：${title}\n\n${outline}` },
      { name: `剧本/第${no}集-剧情对话.txt`, text: t },
      { name: `分镜/第${no}集.json`, text: JSON.stringify({ episode: i + 1, title, ratio: W.ratio || '9:16', characters: m.people, scenes: m.locs, prompt: t }, null, 2) },
    )
  })
  return { safe, files }
}
