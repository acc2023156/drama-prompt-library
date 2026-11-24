import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { NotImplemented } from '../../src/components/NotImplemented'

describe('组件测试链路（jsdom + testing-library）', () => {
  it('渲染占位页：标题、任务包与 data-placeholder', () => {
    const { container } = render(<NotImplemented title="资产库" pkg="P4-D" />)
    expect(screen.getByRole('heading', { name: '资产库' })).toBeInTheDocument()
    expect(screen.getByText(/任务包 P4-D/)).toBeVisible()
    expect(container.querySelector('[data-placeholder="P4-D"]')).not.toBeNull()
  })

  it('user-event 点击后状态更新', async () => {
    function Counter() {
      const [n, setN] = useState(0)
      return <button onClick={() => setN(n + 1)}>点了 {n} 次</button>
    }
    render(<Counter />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('点了 1 次')
  })

  it('用例之间自动清理：上一个用例渲染的内容不残留', () => {
    expect(screen.queryByRole('heading', { name: '资产库' })).toBeNull()
    expect(document.body.children.length).toBe(0)
  })
})
