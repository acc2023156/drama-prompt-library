import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app/App'

vi.mock('../../src/data', async () => {
  const { loadData } = await import('../parity/data')
  return { DATA: loadData(), API_BASE: '', parseData: JSON.parse }
})

// 让 #/f/boom 渲染时抛错，其余路由渲染一个简单标记，验证 App 已接入错误边界
vi.mock('../../src/app/RouteView', () => ({
  // 只按 route 属性渲染（保留的上一页重渲染时不能读全局 hash）
  RouteView: ({ route }: { route: { folder?: string } }) => {
    if (route.folder === 'boom') throw new Error('渲染失败')
    return <main data-testid="page">页面 {route.folder}</main>
  },
}))

const go = (hash: string) =>
  act(() => {
    location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() // jsdom 没有实现，Nav 与换页后会调用
  window.scrollTo = vi.fn()
  localStorage.clear()
  location.hash = '#/f/a'
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

describe('App 接入错误边界', () => {
  it('某个路由渲染抛错时应用不白屏：停在上一页，换路由后恢复', () => {
    render(<App />)
    go('#/f/a')
    expect(screen.getByTestId('page')).toHaveTextContent('页面 a')
    go('#/f/boom')
    expect(screen.getByTestId('page')).toHaveTextContent('页面 a')
    go('#/f/c')
    expect(screen.getByTestId('page')).toHaveTextContent('页面 c')
  })
})
