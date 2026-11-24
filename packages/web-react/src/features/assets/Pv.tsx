import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { G } from '../../domain/styles'
import type { AssetPv } from './menus'

/** 输出预览的示意格子（旧 pvHtml 与资产首页悬停卡里的同款格子）；style 为容器的额外样式。 */
export function Pv({ pv, as: Tag = 'div', style }: { pv: AssetPv; as?: 'div' | 'span'; style?: CSSProperties }) {
  return (
    <Tag className="pv" style={{ ...style, gridTemplateColumns: pv.cols }}>
      {pv.tiles.map(([ic, g, span], k) => (
        <i key={k} style={{ '--g': G[g], ...(span ? { gridRow: span } : {}) } as CSSProperties}>
          <Icon name={ic} />
        </i>
      ))}
    </Tag>
  )
}
