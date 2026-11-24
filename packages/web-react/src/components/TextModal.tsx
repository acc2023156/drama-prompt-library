import { useSyncExternalStore } from 'react'
import { saveText } from '../lib/download'
import { CopyButton } from './CopyButton'
import { Icon } from './Icon'

/** 文本弹窗（旧 showModal，site-template.html 第 1528 行）：复制全部、下载 .txt、点遮罩或“关闭”关掉。 */
interface ModalState {
  title: string
  text: string
  fname: string
}

let modal: ModalState | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function showModal(title: string, text: string, fname: string): void {
  modal = { title, text, fname }
  emit()
}
export function closeModal(): void {
  modal = null
  emit()
}
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const getModal = () => modal

const nfmt = (n: number) => n.toLocaleString('en-US')

/** 挂在 Layout 里，全站只有一个。 */
export function TextModalHost() {
  const m = useSyncExternalStore(subscribe, getModal, getModal)
  if (!m) return null
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="box">
        <div className="mh">
          <h3>{m.title}</h3>
          <span className="tag tool">{nfmt(m.text.length)} 字</span>
        </div>
        <pre>{m.text}</pre>
        <div className="mf">
          <button className="btn-o" onClick={closeModal}>
            关闭
          </button>
          <button className="btn-o" onClick={() => saveText(m.text, m.fname)}>
            <Icon name="dl" />
            下载 .txt
          </button>
          <CopyButton text={m.text} style={{ height: 40, padding: '0 16px' }}>
            <Icon name="copy" />
            复制全部
          </CopyButton>
        </div>
      </div>
    </div>
  )
}
