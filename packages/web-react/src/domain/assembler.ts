import { WZ_DEF } from './wz'
import type { Work, WzSettings } from './types'

/** build.py 数据里的 core（主模板分段、画风块、可选条款）。 */
export interface AsmCore {
  parts: string[]
  styles: Record<string, string>
  options: Record<string, string>
}

/** 组装器当前选择：style 为画风名或 __custom；opts 为已打开的可选条款。 */
export interface AsmState {
  style: string
  custom: string
  opts: Record<string, boolean>
}

export const OPT_INFO: Record<string, string> = {'成人内容':'6.0【一】第 7 条：成人镜头的详细描写要求。只用于成人线项目，全年龄线不要打开（和第七章合规红线冲突）。'};
/** 旧 asmGenreStyle：分镜默认画风，依作品的题材与故事关键字。 */
export function asmGenreStyle(w: Pick<Work, 'W'>): string {
  const W: WzSettings=Object.assign({},WZ_DEF,w.W), t=`${W.genre} ${W.pitch||''} ${W.core||''}`;
  const R: [RegExp, string][]=[[/末日|废土|丧尸|核战|灾变/,'末日废土写实'],[/医院|医生|护士|急诊|手术/,'都市医疗写实，冷色医院灯光，克制压抑，电影感写实'],
    [/古装|古代|宫廷|王爷|皇|侯府|穿越成.{0,4}(千金|嫡女|王妃)/,'古装写实，宫廷与宅院实景，烛火与自然光，厚重电影感'],
    [/玄幻|修仙|仙|宗门|妖|魔/,'东方玄幻写实，仙山云海与宗门殿宇，光效克制，史诗电影感'],
    [/系统|异能|读心|超能/,'都市奇幻写实，真实城市场景，能力光效克制点到，电影感'],
    [/霸总|总裁|职场|公司|法务|律师/,'都市职场写实，高级写字楼与城市夜景，冷暖对比光，精致电影感']];
  const hit=R.find(([re])=>re.test(t)); return hit?hit[1]:'都市写实，现代城市与室内实景，自然光与夜景霓虹，电影感写实';
}

/**
 * 旧 viewAssembler 里的 assemble()：按画风与可选条款拼出 6.0 视频专用提示词，可选地追加某一集的剧本。
 * 旧实现是闭包，读全局 DATA.core 与闭包变量 st、epTxt；这里全部改成显式参数。
 */
export function assemble(core: AsmCore, st: AsmState, epTxt: string): string {
  const style = st.style==='__custom' ? st.custom : core.styles[st.style];
  let text = core.parts.join('\n');
  text = text.replace(/^\{\{OPT:([^}]+)\}\}\n?/gm,(m: string,n: string)=> st.opts[n] ? core.options[n]+(m.endsWith('\n')?'\n':'') : '');
  return text.replace('{{STYLE}}', style as string) + (epTxt ? '\n\n' + epTxt : '');
}
