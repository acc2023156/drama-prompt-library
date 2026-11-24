import { nfmt } from '../../domain/text'
import type { WzSettings } from '../../domain/types'
import { MODE, SUPP, wzEps, wzMins, wzNeeds, wzScore, wzTitle } from '../../domain/wz'

/**
 * 五步表单里随输入刷新的部分（旧 viewScriptNew 的 update()，site-template.html 第 1987–2014 行）：
 * 规格换算、辨识度、就差提示、预览、进度。纯函数，输入是 update() 当时的设定（dup 已算好）。
 */
export interface FormView {
  eps: number
  mins: number
  per: number
  score: number
  scoreHint: string
  needs: string[]
  go: string
  goSub: string
  novelInfo: string
  title: string
  cheer: string
  /** 第 1 步右侧的“✓ 已就绪”。 */
  s1Ready: boolean
  /** 进度：[步骤名, 是否完成, 说明]。 */
  prog: [string, boolean, string][]
}

export function formView(W: WzSettings): FormView {
  const eps = wzEps(W), mins = wzMins(W), per = mins * W.wpm, score = wzScore(W), needs = wzNeeds(W)
  // 提示文案里的直角引号写成转义序列，输出与旧页面逐字相同
  const miss = ([['core', '核心设定与规则'], ['rival', '对手的动机'], ['diff', '与参考作品的差异']] as const)
    .filter(([k]) => !W[k].trim())
    .map(([, l], i) => '①②③'[i] + ' ' + l)
  const scoreHint = !miss.length
    ? '设定很完整，这部会很有记忆点 ✦'
    : score >= 5
      ? `辨识度不错，可以开写了。想更出彩，再补「${miss[0].slice(2)}」`
      : `再补一句「${miss[0].slice(2)}」，故事会更有记忆点（跳过也行）`
  const filled = SUPP.filter(([k]) => W[k].trim()).length
  const s1: [boolean, string] =
    W.mode === 'paste' ? (W.doc.trim() ? [true, `已贴上，约 ${nfmt(W.doc.length)} 字`] : [false, '还没选'])
      : W.mode === 'auto' ? (W.pitch.trim() ? [true, '故事已带入'] : [false, '说一句就好'])
        : W.novel.length >= 2000 && W.novel.length <= 400000 ? [true, `小说约 ${nfmt(W.novel.length)} 字`] : [false, '放进小说就好']
  if (W.mode === 'paste' && !W.doc.trim()) s1[1] = '贴上就好'
  const prog: [string, boolean, string][] = [
    [MODE[W.mode].step, ...s1],
    ['骨架', !!W.pitch.trim(), W.pitch.trim() ? '卖点已填' : '一句话卖点'],
    ['第一季规格', !!(eps && mins), `${eps} 集 × ${mins} 分钟`],
    ['补充设定', !!filled, filled ? `已补 ${filled} 项` : '选填，跳过也行'],
    ['确认与建立', !!W.adult, W.adult ? '可以开写了' : '勾一下就好'],
  ]
  const done = prog.filter((x) => x[1]).length
  return {
    eps, mins, per, score, scoreHint, needs,
    go: MODE[W.mode].btn,
    goSub: needs.length ? '就差：' + needs.join('、') : MODE[W.mode].sub,
    novelInfo: W.novel ? `约 ${nfmt(W.novel.length)} 字${W.novel.length < 2000 ? '（太短）' : W.novel.length > 400000 ? '（太长）' : ''}` : '',
    title: wzTitle(W),
    cheer: !needs.length ? '全部就绪，按最底下的按钮就开写' : done >= 3 ? `已完成 ${done} / 5，快好了` : `已完成 ${done} / 5，一步一步来`,
    s1Ready: s1[0],
    prog,
  }
}

/** “AI 帮我想”卖点提示词（旧 aiPitch 的 showModal 正文）。 */
export function pitchPrompt(W: WzSettings, main: string, sup: string): string {
  return `请为下面这部短剧想 5 个一句话卖点，每个不超过 25 字，要有人物关系和反差，能让观众一眼想点开。逐条列出，并各用一句话说明爽点在哪里。\n\n${main}${sup ? '\n' + sup : ''}${W.doc.trim() ? '\n\n【策划文件摘录】\n' + W.doc.trim().slice(0, 3000) : ''}${W.novel.trim() ? '\n\n【小说开头】\n' + W.novel.trim().slice(0, 3000) : ''}`
}
