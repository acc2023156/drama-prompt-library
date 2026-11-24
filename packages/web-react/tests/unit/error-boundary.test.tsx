import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '../../src/app/ErrorBoundary'

/** 按 page 渲染不同页面；page 为 'bad' 时渲染期抛错，'worse' 抛错且重试也抛错。 */
function Page({ page }: { page: string }) {
  if (page === 'bad' || page === 'worse') throw new Error(`渲染失败:${page}`)
  return <section data-page={page}>页面 {page}</section>
}

/** 与 App 同样的接法：rev 变化即换页并复位。 */
let go: (page: string) => void = () => {}
function Host({ first }: { first: string }) {
  const [state, set] = useState({ page: first, rev: 0 })
  go = (page) => set((s) => ({ page, rev: s.rev + 1 }))
  return (
    <ErrorBoundary resetKey={state.rev}>
      <Page key={state.rev} page={state.page} />
    </ErrorBoundary>
  )
}

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
})

describe('ErrorBoundary', () => {
  it('正常路径不加任何额外节点', () => {
    const { container } = render(
      <ErrorBoundary resetKey={0}>
        <section data-page="a">页面 a</section>
      </ErrorBoundary>,
    )
    expect(container.innerHTML).toBe('<section data-page="a">页面 a</section>')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('页面渲染抛错不白屏：保留上一页，并在控制台记录错误', () => {
    const { container } = render(<Host first="a" />)
    const before = container.innerHTML
    act(() => go('bad'))
    expect(container.innerHTML).toBe(before)
    expect(screen.getByText('页面 a')).toBeInTheDocument()
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('[ErrorBoundary]'))).toBe(true)
  })

  it('连续两次出错仍停在最后一个成功的页面', () => {
    render(<Host first="a" />)
    act(() => go('b'))
    act(() => go('bad'))
    act(() => go('worse'))
    expect(screen.getByText('页面 b')).toBeInTheDocument()
  })

  it('路由变化后复位重试：出错后换到正常页面即正常渲染', () => {
    render(<Host first="a" />)
    act(() => go('bad'))
    act(() => go('c'))
    expect(screen.getByText('页面 c')).toBeInTheDocument()
    expect(screen.queryByText('页面 a')).toBeNull()
  })

  it('没有上一页可保留时显示出错提示与刷新按钮', () => {
    const { container } = render(<Host first="bad" />)
    expect(screen.getByRole('alert')).toHaveTextContent('页面出错了')
    expect(screen.getByRole('button', { name: '刷新页面' })).toBeInTheDocument()
    expect(container.querySelector('[data-page]')).toBeNull()
  })

  it('刷新按钮调用 location.reload', async () => {
    const reload = vi.fn()
    const orig = Object.getOwnPropertyDescriptor(window, 'location')!
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } })
    try {
      render(<Host first="bad" />)
      act(() => screen.getByRole('button', { name: '刷新页面' }).click())
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', orig)
    }
  })

  it('没有上一页时出错提示后，换到正常页面自动复位', () => {
    render(<Host first="bad" />)
    act(() => go('d'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('页面 d')).toBeInTheDocument()
  })

  it('保留的上一页重新渲染也抛错时退回出错提示，不白屏', () => {
    let calls = 0
    function Flaky({ fail }: { fail: boolean }) {
      calls++
      // 第一次成功渲染，之后重渲染都抛错（模拟共用的存储数据损坏）
      if (fail && calls > 1) throw new Error('数据损坏')
      return <section>flaky</section>
    }
    const { rerender } = render(
      <ErrorBoundary resetKey={0}>
        <Flaky fail />
      </ErrorBoundary>,
    )
    expect(screen.getByText('flaky')).toBeInTheDocument()
    rerender(
      <ErrorBoundary resetKey={0}>
        <Flaky fail />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('页面出错了')
  })
})
