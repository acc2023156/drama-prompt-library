import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { copyText } from '../lib/clipboard'
import { Icon } from './Icon'

/** 复制按钮：点击后 1.3 秒内显示“已复制”并加 done 类（旧 copyText 的按钮反馈）。 */
export function CopyButton({ text, className = 'copy', style, children }: { text: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      className={done ? `${className} done` : className}
      style={style}
      onClick={async () => {
        await copyText(text)
        setDone(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setDone(false), 1300)
      }}
    >
      {done ? (
        <>
          <Icon name="check" />
          已复制
        </>
      ) : (
        children
      )}
    </button>
  )
}
