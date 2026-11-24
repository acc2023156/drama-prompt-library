import { Component, type ReactNode } from 'react'

/**
 * 旧 route() 里某个 view 渲染抛异常时，旧页面停在上一页、不崩溃（控制台报错）。
 * 这里保持同样的行为：捕获渲染期错误后继续显示上一次成功渲染的页面；没有上一页时显示出错提示与刷新按钮。
 * resetKey 变化（路由变化）时自动复位，重新尝试渲染新页面。
 * 正常路径不产生额外 DOM：只直接渲染 children，不加包裹节点。
 */

function Notice() {
  return (
    <div className="empty" role="alert">
      页面出错了，请刷新后重试。
      <div style={{ marginTop: 16 }}>
        <button className="btn-dark" onClick={() => location.reload()}>
          刷新页面
        </button>
      </div>
    </div>
  )
}

/** 保留的上一页本身再抛错（例如共用的存储数据已损坏）时，退回出错提示，避免白屏。 */
class Retained extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary] 保留的上一页重新渲染失败', error)
  }
  render() {
    return this.state.failed ? <Notice /> : this.props.children
  }
}

interface Props {
  /** 变化时复位错误状态（传路由版本号）。 */
  resetKey: unknown
  children: ReactNode
}
interface State {
  failed: boolean
  resetKey: unknown
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey }
  /** 最近一次成功提交的 children（页面元素），出错时继续渲染它。 */
  private lastGood: ReactNode = null

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey }
  }

  componentDidMount() {
    this.remember()
  }
  componentDidUpdate() {
    this.remember()
  }
  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary] 页面渲染出错', error)
  }

  private remember() {
    if (!this.state.failed) this.lastGood = this.props.children
  }

  render() {
    if (!this.state.failed) return this.props.children
    return this.lastGood == null ? <Notice /> : <Retained>{this.lastGood}</Retained>
  }
}
