import type { MouseEvent } from 'react'
import { Icon } from './Icon'

export interface BackBarProps {
  /** 返回目标；不传时点击优先 history.back()，无历史才回 #/ */
  href?: string
  /** 有未储存的改动：按钮变“储存并返回”，点击先调 onSave 再跳转（旧 backDirty / backClean）。 */
  dirty?: boolean
  onSave?: () => void
}

/** 所有页面共用的“返回”（旧 backBar）：同一个样式、同一个位置。 */
export function BackBar({ href, dirty, onSave }: BackBarProps) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (dirty) {
      onSave?.()
      return
    }
    if (!href && history.length > 1) {
      e.preventDefault()
      history.back()
    }
  }
  return (
    <div className="res-back">
      <a className={dirty ? 'pill dirty' : 'pill'} id="pgBack" href={href || '#/'} onClick={onClick}>
        <Icon name="back" />
        <span>{dirty ? '储存并返回' : '返回'}</span>
      </a>
    </div>
  )
}
