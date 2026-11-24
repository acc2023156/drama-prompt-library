import { WZ_DEF } from '../../src/domain/wz'
import type { WzSettings } from '../../src/domain/types'

/** 随机序列：覆盖整个 [0,1)，含边界 0 与接近 1。 */
export const RNG_SEQS: number[][] = [
  [0],
  [0.999999],
  [0.5],
  [0.13, 0.77, 0.31, 0.92, 0.05, 0.64],
  ...Array.from({ length: 40 }, (_, k) => [k / 40 + 0.0123]),
]

/** 一句话卖点：覆盖 wzGuess、wzRollTitle 里的每个分支。 */
export const PITCHES: string[] = [
  '',
  '   ',
  '被退婚的假千金，靠读心系统在豪门翻盘',
  '重生后嫡女她打脸前夫，追妻火葬场',
  '男男耽美 BL 先婚后爱',
  '女女百合 GL 破镜重圆',
  '男男（BL）契约闪婚，前任重逢',
  '战神赘婿回归，被所有人看不起',
  '穿越成古代王妃，修仙宗门里的妖魔',
  '总裁的契约宠妻，被偏爱',
  '公司同事上司职场逆袭翻盘崛起',
  '兵王少年废柴老板',
  '林小满穿成王府嫡女，宫里皇上',
  '张三重生成了战神，开局就有金手指',
  '李四靠系统逆袭，异能读心透视',
  '王五是首富，她杀疯了',
  '陈九的故事',
  '赵六在古代被退婚',
  '沈念的逆袭，影后归来',
  '她被嘲笑看不起，后来打脸',
  '回到十年前，身份真假难辨',
  '千金嫡女庶女王妃皇后女帝公主郡主世子王爷将军少帅总裁首富神医战神赘婿影后保镖秘书娇妻大佬师尊掌门仙尊',
  ...['千金', '嫡女', '庶女', '王妃', '皇后', '女帝', '公主', '郡主', '世子', '王爷', '将军', '少帅', '总裁', '首富', '神医', '战神', '赘婿', '影后', '保镖', '秘书', '娇妻', '大佬', '师尊', '掌门', '仙尊'].map((k) => `她是${k}`),
  ...['千金', '王妃', '嫡女'].map((k) => `穿成古代${k}`),
  '重生之后要报仇',
  '没有任何关键词的一句话',
  'English only pitch with no match',
  '《带书名号的》故事，被退婚',
  '长'.repeat(5000),
  '嫡女'.repeat(2000) + '系统重生古代',
]

const extend = (patch: Partial<WzSettings>): WzSettings => ({ ...WZ_DEF, hooks: [], ...patch })

const SRC = (title: string) => `前言\n剧名：${title}\n正文`

/** 作品设定的各种取值：模式、自定义集数时长、标题来源、小说长度边界、补充设定、撞题避开。 */
export function wzCases(): WzSettings[] {
  const cases: WzSettings[] = [WZ_DEF, extend({})]
  for (const mode of ['paste', 'auto', 'novel'] as const) {
    for (const eps of [10, 20, 80, '自定义'] as const) {
      for (const epsCustom of ['', '0', '25', 'abc', '-3']) {
        if (eps !== '自定义' && epsCustom !== '') continue
        cases.push(extend({ mode, eps, epsCustom, mins: eps === '自定义' ? '自定义' : 3, minsCustom: epsCustom, pitch: '重生嫡女', adult: true, doc: 'D', novel: 'N'.repeat(2500) }))
      }
    }
  }
  for (const mins of [1, 2, 3, 5, 8, 10, '自定义'] as const) {
    for (const minsCustom of ['', '0', '4', 'x', '2.5']) {
      cases.push(extend({ mode: 'auto', mins, minsCustom, pitch: '一句话', adult: true }))
    }
  }
  for (const len of [0, 1, 1999, 2000, 2001, 399999, 400000, 400001]) {
    cases.push(extend({ mode: 'novel', novel: 'n'.repeat(len), adult: len % 2 === 0 }))
  }
  for (const mode of ['paste', 'novel'] as const) {
    cases.push(
      extend({ mode, doc: '《书名》开头', novel: '《另一本》' + 'n'.repeat(2100) }),
      extend({ mode, doc: SRC('冒号剧名'), novel: SRC('小说里的名') + 'n'.repeat(2100) }),
      extend({ mode, doc: '片名：A\n剧名：B', novel: '作品名称：C' + 'n'.repeat(2100) }),
      extend({ mode, doc: '《' + 'x'.repeat(31) + '》', novel: '《' + 'x'.repeat(31) + '》' }),
      extend({ mode, doc: '剧名：' + 'y'.repeat(40), novel: '' }),
      extend({ mode, title: '  自定标题  ', doc: '《被覆盖》' }),
    )
  }
  cases.push(
    extend({ mode: 'paste', doc: '  剧本内容  ', title: '标题', aud: '男性向', pair: '男男（BL）', genre: '霸总', pitch: '  卖点  ', hooks: ['打脸', '追妻'], lang: '台湾用语', glyph: '繁體', wpm: 300, sequel: false, adult: true }),
    extend({ mode: 'paste', doc: 'x', lang: '繁中词库', style: '真人写实', ratio: '9:16', sequel: true, adult: true }),
    extend({ mode: 'auto', pitch: 'p', style: '无', ratio: '', adult: true }),
    extend({ mode: 'auto', pitch: 'p', core: '核心设定', diff: '差异', hero: '主角', rival: '对手', world: '世界观', adult: true }),
    extend({ mode: 'novel', novel: 'n'.repeat(2500), core: ' ', diff: '  差异  ', adult: true }),
    extend({ mode: 'paste', doc: 'x', adult: true, dup: { n: 3, hits: [{ title: '甲', pitch: '甲的卖点', sim: 0.5, same: true }, { title: '乙', sim: 0.31, same: false }] } }),
    extend({ mode: 'auto', pitch: 'p', adult: true, dup: { n: 0, hits: [] } }),
    extend({ mode: 'paste', doc: 'x', wpm: 0, adult: true }),
    extend({ mode: 'paste', doc: 'x', wpm: 1234567, eps: 80, mins: 10, adult: true }),
  )
  return cases
}

/** 作品列表夹具：含回收站作品、同类题材、相同 id、缺字段。 */
export function workList(): any[] {
  const w = (id: string, title: string, W: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id, title, W, time: 1700000000000 + id.length, ...extra })
  return [
    w('w1', '重生嫡女', { pitch: '重生嫡女打脸', core: '系统', genre: '古装', mode: 'auto' }),
    w('w2', '霸总的契约', { pitch: '契约婚姻总裁', core: '', genre: '霸总', mode: 'paste' }, { trashed: 1700000000001 }),
    w('w3', '', { pitch: '重生嫡女打脸前夫', core: '读心', genre: '古装', mode: 'novel' }),
    w('s4', '陆沉，开局逆袭', { pitch: '他把东西摔', genre: '都市', mode: 'auto' }, { kind: 'simple' }),
    w('v5', '氛围', {}, { kind: 'vibe' }),
    w('w6', '无设定', {}),
  ]
}
