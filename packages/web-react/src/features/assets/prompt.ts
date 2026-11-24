import type { StyleItem } from '../../domain/styles'
import type { AssetItem } from './menus'
import type { AssetState } from './seed'

/**
 * 编辑器拼出的提示词（旧 viewAssetEditor 内的 build）：模板代入名称、档案、选项，再接风格、补充与比例分辨率。
 * 模板替换沿用字符串形式的 replace（只换第一处，替换文本里的 $& 等按 replace 规则解释），与旧页面一致。
 */
export function buildAssetPrompt(f: AssetItem, st: AssetState, styles: StyleItem[]): string {
  let t = f.tpl.replace('{name}', st.name || f.name).replace('{profile}', st.profile || '（未填写）').replace('{opts}', st.opts.join('、') || '（未选择）')
  const s = styles.find((x) => x.n === st.style)
  if (s && s.t) t += '\n风格：' + s.t
  if ((st.extra || '').trim()) t += '\n补充：' + st.extra!.trim()
  t += `\n画面比例 ${st.ratio}，${st.res} 分辨率。`
  return t
}
