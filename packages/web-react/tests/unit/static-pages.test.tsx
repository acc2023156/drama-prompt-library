import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Route } from '../../src/app/routes'
import { Toast } from '../../src/components/Toast'
import { MembershipPage } from '../../src/features/membership/MembershipPage'
import { PartnerBanner } from '../../src/features/partner/PartnerBanner'
import { PartnerPage } from '../../src/features/partner/PartnerPage'
import { siteDataJson } from '../parity/static-pages-dom'

let historyLength = 1
const scrollIntoView = vi.fn()
let RouteView: typeof import('../../src/app/RouteView').RouteView

// RouteView 会连带加载其他页面，其中 src/data.ts 在模块加载时读 #tj-data：先放进真实数据再动态加载
beforeAll(async () => {
  const s = document.createElement('script')
  s.id = 'tj-data'
  s.type = 'application/json'
  s.textContent = siteDataJson()
  document.head.appendChild(s)
  ;({ RouteView } = await import('../../src/app/RouteView'))
})

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  historyLength = 1
  scrollIntoView.mockReset()
  ;(Element.prototype as any).scrollIntoView = scrollIntoView
  Object.defineProperty(history, 'length', { configurable: true, get: () => historyLength })
  vi.spyOn(history, 'back').mockImplementation(() => {})
  location.hash = ''
})
afterEach(() => {
  act(() => void vi.advanceTimersByTime(2000))
  vi.useRealTimers()
  delete (Element.prototype as any).scrollIntoView
  delete (history as any).length
  vi.restoreAllMocks()
})

describe('路由挂载：占位页已被真实页面替换', () => {
  it('#/partner 渲染伙伴计划页', () => {
    const { container } = render(<RouteView route={{ view: 'partner' } as Route} />)
    expect(container.querySelector('[data-placeholder]')).toBeNull()
    expect(container.querySelector('article.pt')).not.toBeNull()
    expect(screen.getByRole('heading', { name: '1谁可以参加' })).toBeInTheDocument()
  })

  it('#/membership 渲染会员页', () => {
    const { container } = render(<RouteView route={{ view: 'membership' } as Route} />)
    expect(container.querySelector('[data-placeholder]')).toBeNull()
    expect(screen.getByRole('heading', { name: '订阅天玑会员，畅享专业 AI 创作能力' })).toBeInTheDocument()
  })
})

describe('伙伴计划页交互', () => {
  it('“报名与评审”：阻止默认跳转，平滑滚动到 #pt-join，地址不变', async () => {
    render(<PartnerPage />)
    const join = screen.getByRole('link', { name: '报名与评审' })
    expect(join).toHaveAttribute('href', '#pt-join')
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(join)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById('pt-join'))
    expect(location.hash).toBe('')
  })

  it('返回：有历史记录时 history.back() 并阻止跳转；没有历史记录时走 #/', async () => {
    render(<PartnerPage />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const back = screen.getByRole('link', { name: '返回' })
    expect(back).toHaveAttribute('href', '#/')
    historyLength = 2
    await user.click(back)
    expect(history.back).toHaveBeenCalledTimes(1)
    expect(location.hash).toBe('')
    historyLength = 1
    await user.click(back)
    expect(history.back).toHaveBeenCalledTimes(1)
    expect(location.hash).toBe('#/')
  })

  it('两处“现在开始创作”指向 #/；各章节标题齐全', () => {
    render(<PartnerPage />)
    const links = screen.getAllByRole('link', { name: '现在开始创作' })
    expect(links).toHaveLength(2)
    for (const a of links) expect(a).toHaveAttribute('href', '#/')
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titles).toEqual(['1谁可以参加', '2两个赛道', '3作品要求', '4伙伴激励', '5报名与评审', '6权益与规则', '让你的故事被全世界看见'])
  })
})

describe('PartnerBanner', () => {
  it('链接形态指向 #/partner；big 形态是不可点击的头图', () => {
    const { container, rerender } = render(<PartnerBanner />)
    expect(screen.getByRole('link', { name: '天玑 AI短剧伙伴计划' })).toHaveAttribute('href', '#/partner')
    expect(container.querySelectorAll('.pt-fr')).toHaveLength(6)
    rerender(<PartnerBanner big />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('.pt-banner.big')).not.toBeNull()
  })
})

describe('会员页交互', () => {
  it('四档会员与对照表五列的价格', () => {
    const { container } = render(<MembershipPage />)
    const plans = [...container.querySelectorAll('.plan')]
    expect(plans.map((p) => p.querySelector('h2')!.textContent)).toEqual(['基础会员', '标准会员', '高级会员', '超级会员'])
    expect(plans.map((p) => p.querySelector('.plan-price b')!.textContent)).toEqual(['113', '341', '1227', '4999'])
    expect(plans.map((p) => p.className.trim())).toEqual(['plan', 'plan', 'plan pro', 'plan max'])
    const head = container.querySelectorAll('.compare-plan')
    expect([...head].map((h) => h.querySelector('strong')!.textContent)).toEqual(['¥0 每月', '¥113 每季', '¥341 每季', '¥1227 每季', '¥4999 每季'])
  })

  it('关闭：有历史记录时后退，否则回 #/', async () => {
    render(<MembershipPage />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const close = screen.getByRole('button', { name: '关闭' })
    historyLength = 2
    await user.click(close)
    expect(history.back).toHaveBeenCalledTimes(1)
    expect(location.hash).toBe('')
    historyLength = 1
    await user.click(close)
    expect(history.back).toHaveBeenCalledTimes(1)
    expect(location.hash).toBe('#/')
  })

  it('计费周期页签：默认选中“连续包季”，点击切换 on 并提示', async () => {
    render(
      <>
        <MembershipPage />
        <Toast />
      </>,
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const tabs = within(document.getElementById('billingTabs')!).getAllByRole('button')
    expect(tabs.map((t) => t.className)).toEqual(['', '', 'on hot', ''])
    await user.click(tabs[0])
    expect(tabs.map((t) => t.className)).toEqual(['on', '', 'hot', ''])
    expect(document.getElementById('toast')).toHaveTextContent('已切换计费周期')
    expect(document.getElementById('toast')).toHaveClass('show')
  })

  it('购买与选择方案只弹提示，不发请求', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(
      <>
        <MembershipPage />
        <Toast />
      </>,
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByRole('button', { name: '¥341 首季优惠' }))
    expect(document.getElementById('toast')).toHaveTextContent('已选择标准会员，支付功能暂未开放')
    await user.click(screen.getByRole('button', { name: '当前计划' }))
    expect(document.getElementById('toast')).toHaveTextContent('当前为免费计划')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
