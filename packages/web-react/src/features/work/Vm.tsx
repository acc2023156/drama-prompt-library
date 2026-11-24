import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'

/** 分镜图分页的弹层播放器（旧 openVm / closeVm）：挂在 body 下，打开时锁住页面滚动；点遮罩、带 data-close 的按钮或 Esc 关闭。 */
export function Vm({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return createPortal(
    <div
      className="vm"
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as Element).closest('[data-close]')) onClose()
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
