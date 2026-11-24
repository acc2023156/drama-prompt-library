import { act } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MembershipPage } from '../../src/features/membership/MembershipPage'
import { type Mounted, countNodes, firstDiff, legacyPages, loadLegacyPages, mountLegacy, mountNew, snapChildren } from './static-pages-dom'

let backCalls = 0
let historyLength = 1

beforeAll(async () => {
  await loadLegacyPages()
})

beforeEach(() => {
  vi.useFakeTimers()
  backCalls = 0
  historyLength = 1
  Object.defineProperty(history, 'length', { configurable: true, get: () => historyLength })
  vi.spyOn(history, 'back').mockImplementation(() => {
    backCalls++
  })
  location.hash = ''
})
afterEach(() => {
  delete (history as any).length
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const click = (el: Element | null): boolean => {
  expect(el).not.toBeNull()
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
  act(() => {
    el!.dispatchEvent(ev)
  })
  return ev.defaultPrevented
}

/** 让上一个用例遗留的新页面提示条（lib/toast 是模块级状态）先消失，保证两边都从“未显示”开始。 */
const settleToast = () => act(() => void vi.advanceTimersByTime(2000))

const classesOf = (els: Element[]) => els.map((e) => [...e.classList].sort().join(' '))

/** 同一套交互场景：两边各跑一遍，观察结果必须相等。 */
function scenario(m: Mounted) {
  const out: Record<string, unknown> = {}
  const tabs = [...m.view.querySelectorAll('#billingTabs button')]
  const links = [...m.view.querySelectorAll('.billing-links button')]
  out.initial = { tabs: classesOf(tabs), links: classesOf(links), toast: m.toast() }

  // 计费周期页签：每次点击后的 on 状态与提示条
  out.tabs = [0, 1, 2, 3, 2, 2].map((i) => {
    click(tabs[i])
    return { i, classes: classesOf(tabs), toast: m.toast() }
  })
  // 页脚三个链接按钮没有事件：状态不变
  out.links = links.map((l) => ({ prevented: click(l), classes: classesOf(links) }))

  // 购买 / 选择方案：9 个 data-plan 按钮的提示文案（相邻两次文案互不相同，能确认是这次点击设置的）
  out.plans = [...m.view.querySelectorAll('[data-plan]')].map((b) => {
    click(b)
    return { plan: b.getAttribute('data-plan'), text: b.textContent, toast: m.toast() }
  })

  // 关闭：无历史回 #/，有历史 history.back()
  location.hash = '#/membership'
  historyLength = 1
  backCalls = 0
  click(m.view.querySelector('#membershipClose'))
  out.closeNoHistory = { hash: location.hash, back: backCalls }
  location.hash = '#/membership'
  historyLength = 2
  backCalls = 0
  click(m.view.querySelector('#membershipClose'))
  out.closeWithHistory = { hash: location.hash, back: backCalls }
  return JSON.parse(JSON.stringify(out))
}

describe('会员页：新旧 DOM 与交互对照', () => {
  it('旧页面沙箱可用：viewMembership 存在', () => {
    expect(legacyPages().run('typeof viewMembership')).toBe('function')
  })

  it('MembershipPage 渲染的 DOM 树与旧 viewMembership 逐节点相等（标签、属性、文本）', () => {
    const old = snapChildren(mountLegacy('viewMembership').view)
    const nu = snapChildren(mountNew(<MembershipPage />).view)
    const nodes = countNodes(old)
    expect(nodes).toBeGreaterThan(350)
    expect(firstDiff(old, nu)).toBeNull()
    expect(countNodes(nu)).toBe(nodes)
  })

  it('四档价格、折算月价、积分、权益与对比表单元格逐项相等', () => {
    const grab = (m: Mounted) => ({
      plans: [...m.view.querySelectorAll('.plan')].map((p) => [p.className.trim(), p.textContent]),
      cells: [...m.view.querySelectorAll('.compare-head, .compare-section, .compare-row')].map((r) => [r.className, r.textContent]),
    })
    const old = JSON.parse(JSON.stringify(grab(mountLegacy('viewMembership'))))
    const nu = JSON.parse(JSON.stringify(grab(mountNew(<MembershipPage />))))
    expect(old.plans).toHaveLength(4)
    expect(old.cells).toHaveLength(1 + 4 + 11)
    expect(nu).toEqual(old)
    // 旧页面自身的价格文案（防止两边同时写错）
    expect(old.plans.map((p: string[]) => p[1])).toEqual([
      expect.stringContaining('¥113每季¥188折算 ¥38/月'),
      expect.stringContaining('¥341每季¥568折算 ¥114/月'),
      expect.stringContaining('¥1227每季¥2798折算 ¥409/月'),
      expect.stringContaining('¥4999每季¥11699折算 ¥1666/月'),
    ])
  })

  it('对照有效：改一个字、一个属性、删一个节点都会被发现', () => {
    const old = snapChildren(mountLegacy('viewMembership').view)
    const mut = (f: (root: Element) => void) => {
      const m = mountNew(<MembershipPage />)
      f(m.view)
      return snapChildren(m.view)
    }
    expect(firstDiff(old, mut((r) => (r.querySelector('.plan-price b')!.textContent = '114')))).not.toBeNull()
    expect(firstDiff(old, mut((r) => r.querySelector('.buy-plan')!.setAttribute('data-plan', 'x')))).not.toBeNull()
    expect(firstDiff(old, mut((r) => r.querySelector('.compare-row')!.remove()))).not.toBeNull()
    expect(firstDiff(old, mut((r) => r.querySelector('.compare-row span:nth-child(2)')!.classList.add('yes')))).not.toBeNull()
  })

  it('交互：计费页签、购买 / 选择方案提示、关闭，新旧观察结果相等', () => {
    const old = scenario(mountLegacy('viewMembership'))
    settleToast()
    const nu = scenario(mountNew(<MembershipPage />))
    expect(nu).toEqual(old)
    // 旧行为本身（防止两边同时失效而“相等”）
    const o = old as any
    expect(o.initial.tabs).toEqual(['', '', 'hot on', ''])
    expect(o.tabs[0].classes).toEqual(['on', '', 'hot', ''])
    expect(o.tabs[0].toast).toEqual({ text: '已切换计费周期', show: true })
    expect(o.tabs[4].classes).toEqual(['', '', 'hot on', ''])
    expect(o.links.every((l: any) => !l.prevented)).toBe(true)
    expect(o.plans.map((p: any) => p.toast.text)).toEqual([
      '已选择基础会员，支付功能暂未开放',
      '已选择标准会员，支付功能暂未开放',
      '已选择高级会员，支付功能暂未开放',
      '已选择超级会员，支付功能暂未开放',
      '当前为免费计划',
      '已选择基础会员，支付功能暂未开放',
      '已选择标准会员，支付功能暂未开放',
      '已选择高级会员，支付功能暂未开放',
      '已选择超级会员，支付功能暂未开放',
    ])
    expect(o.closeNoHistory).toEqual({ hash: '#/', back: 0 })
    expect(o.closeWithHistory).toEqual({ hash: '#/membership', back: 1 })
  })
})
