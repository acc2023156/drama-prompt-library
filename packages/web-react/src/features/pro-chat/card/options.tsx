import type { ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { WZ_OPT } from '../../../domain/wz'
import { HEAT, heatOf } from '../../../domain/yq'
import type { WzSettings } from '../../../domain/types'
import { RATIOS, styles } from '../chat-data'

/** 作品卡的常量与下拉选项（旧 rbIcon、QIXING、qxSide、wcardOpts、WC_SEEDS，site-template.html 第 1736–1762 行）。 */

/** 比例小图标：长边缩到 box 像素。 */
export function RbIcon({ r, box = 18 }: { r?: string; box?: number }) {
  const [a, b] = (r || '9:16').split(':').map(Number), k = box / Math.max(a, b)
  return <i className="rb" style={{ width: Math.round(a * k) + 'px', height: Math.round(b * k) + 'px' }} />
}

/** 七星：投产剧本里最常用的 7 种角色、7 种剧本模式，男频 / 女频各一组。 */
export const QIXING = {
  male: {
    role: ['霸总／上司', '白领／秘书', '逆袭者', '人妻／少妇', '千金／富二代', '主仆／雇佣', '妖／仙'],
    mode: ['支配／臣服', '逆袭打脸', '隐藏身份／掉马', '性觉醒', '后宫', '换伴／多角', '复仇'],
  },
  female: {
    role: ['妖／仙', '逆袭者', '熟女／御姐', '师徒／教练', '主仆／雇佣', '魅魔／恶魔／天使', '霸总／上司'],
    mode: ['逆袭打脸', '支配／臣服', '隐藏身份／掉马', '虐恋', '甜宠', '逆后宫', '复仇'],
  },
}
export const qxSide = (W: Pick<WzSettings, 'aud'>): 'male' | 'female' => (W.aud === '女性向' ? 'female' : 'male')

/** 独家点子的起手句。 */
export const WC_SEEDS = ['主角的秘密是', '最大的反转是', '金手指是', '对手是', '结局想要']

export interface CardOption {
  v: string | number
  l: string
  ic?: ReactNode
}
export interface CardMenu {
  items: CardOption[]
  /** 按钮里文字前的图标。 */
  lead?: (v: unknown) => ReactNode
  /** 按钮文字；缺省取选中项的 l，找不到就显示原值。 */
  label?: (v: unknown) => string
  /** 选项值是数字（集数、时长）。 */
  num?: boolean
}

/** 作品卡上依次出现的 9 个下拉。旧 wcardOpts 另有 depth、genre、ai 三项，卡片上从未渲染，未迁移。 */
export const CARD_PILLS = ['style', 'ratio', 'aud', 'qxRole', 'qxMode', 'heat', 'pair', 'eps', 'mins'] as const
export type CardPill = (typeof CARD_PILLS)[number]

/** 旧 wcardOpts(W)：风格表在调用时读取（含 pl.asm 的自定义画风），七星按受众取男频或女频。 */
export function cardMenus(W: Pick<WzSettings, 'aud'>): Record<CardPill, CardMenu> {
  const st = styles(), Q = QIXING[qxSide(W)]
  const qx = (v: string, i: number) => ({ v, l: v, ic: <i className="qx">{i + 1}</i> })
  return {
    qxRole: { items: Q.role.map(qx), lead: () => <Icon name="user" />, label: (v) => (v as string) || '角色' },
    qxMode: { items: Q.mode.map(qx), lead: () => <Icon name="sparkle" />, label: (v) => (v as string) || '模式' },
    heat: {
      items: HEAT.map((v, i) => ({ v, l: v, ic: <i className={`qx heat h${i}`}>{'♥'.repeat(i + 1)}</i> })),
      lead: (v) => {
        const i = HEAT.indexOf(heatOf({ heat: v as string }))
        return <i className={`heat-lead h${i}`}>{'♥'.repeat(i + 1)}</i>
      },
      label: (v) => heatOf({ heat: v as string }),
    },
    style: { items: st.map((x) => ({ v: x.n, l: x.n, ic: <i style={{ background: x.g }} /> })), lead: () => <Icon name="palette" />, label: (v) => (v && v !== '无' ? (v as string) : '风格') },
    ratio: { items: RATIOS.map((r) => ({ v: r, l: r, ic: <RbIcon r={r} /> })), lead: (v) => <RbIcon r={v as string} box={16} />, label: (v) => (v as string) || '9:16' },
    aud: { items: WZ_OPT.aud.map((v) => ({ v, l: v })) },
    pair: { items: WZ_OPT.pair.map((v) => ({ v, l: v === '男女' ? '男女（CP）' : v })) },
    eps: { num: true, items: WZ_OPT.eps.map((v) => ({ v, l: v + ' 集' })) },
    mins: { num: true, items: WZ_OPT.mins.map((v) => ({ v, l: v + ' 分钟 / 集' })) },
  }
}
