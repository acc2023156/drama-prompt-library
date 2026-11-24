import { type ButtonHTMLAttributes, useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { copyText } from '../../lib/clipboard'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  /** 点击时才取文本（AI 审稿的提示词较长）。 */
  text: string | (() => string)
  /** 开始复制后同步执行（旧页面在 copyText 之后紧接着开新窗口、弹提示）。 */
  after?: () => void
}

/** 复制按钮：同旧 copyText(text, btn)，复制后 1.3 秒内加 done 类并显示“已复制”；可带 id 与 data 属性。 */
export function CopyBtn({ text, after, className, children, ...rest }: Props) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      {...rest}
      className={done ? `${className} done` : className}
      onClick={async () => {
        const p = copyText(typeof text === 'function' ? text() : text)
        after?.()
        await p
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
