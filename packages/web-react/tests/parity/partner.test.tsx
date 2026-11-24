import { act } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PartnerBanner } from '../../src/features/partner/PartnerBanner'
import { PartnerPage } from '../../src/features/partner/PartnerPage'
import { type Mounted, countNodes, firstDiff, legacyPages, loadLegacyPages, mountLegacy, mountNew, snapChildren } from './static-pages-dom'

/** 在 Element 上记录 scrollIntoView 调用（jsdom 没有这个方法）。 */
let scrolls: { id: string; arg: unknown }[] = []
let backCalls = 0
let historyLength = 1

beforeAll(async () => {
  await loadLegacyPages()
})

beforeEach(() => {
  scrolls = []
  backCalls = 0
  historyLength = 1
  ;(Element.prototype as any).scrollIntoView = function (this: Element, arg: unknown) {
    scrolls.push({ id: this.id, arg })
  }
  Object.defineProperty(history, 'length', { configurable: true, get: () => historyLength })
  vi.spyOn(history, 'back').mockImplementation(() => {
    backCalls++
  })
  location.hash = ''
})
afterEach(() => {
  delete (Element.prototype as any).scrollIntoView
  delete (history as any).length
  vi.restoreAllMocks()
})

/** 派发可取消、可冒泡的 click，返回是否被 preventDefault。 */
const click = (el: Element | null): boolean => {
  expect(el).not.toBeNull()
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
  act(() => {
    el!.dispatchEvent(ev)
  })
  return ev.defaultPrevented
}

/** 同一套交互场景：两边各跑一遍，观察结果必须相等。 */
function scenario(m: Mounted) {
  const out: Record<string, unknown> = {}
  scrolls = []
  // 锚点：报名与评审 → 阻止默认跳转，平滑滚到 #pt-join
  location.hash = ''
  out.join = { prevented: click(m.view.querySelector('#ptJoin')), scrolls: scrolls.slice(), hash: location.hash }
  // 返回：无历史 → 走链接 #/；有历史 → history.back() 且阻止默认
  location.hash = '#/x'
  historyLength = 1
  backCalls = 0
  out.backNoHistory = { prevented: click(m.view.querySelector('#pgBack')), back: backCalls, hash: location.hash }
  location.hash = '#/x'
  historyLength = 2
  backCalls = 0
  out.backWithHistory = { prevented: click(m.view.querySelector('#pgBack')), back: backCalls, hash: location.hash }
  // 开始创作按钮：普通链接，不阻止
  out.create = [...m.view.querySelectorAll('a.magic')].map((a) => ({ href: a.getAttribute('href'), prevented: click(a) }))
  // 旧页面的 { behavior } 对象来自 vm 另一个 realm，经 JSON 复制后再比较
  return JSON.parse(JSON.stringify(out))
}

describe('伙伴计划页：新旧 DOM 与交互对照', () => {
  it('旧页面沙箱可用：viewPartner 与 partnerBanner 存在', () => {
    expect(legacyPages().run("typeof viewPartner+','+typeof partnerBanner")).toBe('function,function')
  })

  it('PartnerPage 渲染的 DOM 树与旧 viewPartner 逐节点相等（标签、属性、文本）', () => {
    const old = snapChildren(mountLegacy('viewPartner').view)
    const nu = snapChildren(mountNew(<PartnerPage />).view)
    const nodes = countNodes(old)
    expect(nodes).toBeGreaterThan(250)
    expect(firstDiff(old, nu)).toBeNull()
    expect(countNodes(nu)).toBe(nodes)
  })

  it('对照有效：改一个字、一个属性、删一个节点都会被发现', () => {
    const old = snapChildren(mountLegacy('viewPartner').view)
    const mut = (f: (root: Element) => void) => {
      const m = mountNew(<PartnerPage />)
      f(m.view)
      return snapChildren(m.view)
    }
    expect(firstDiff(old, mut((r) => (r.querySelector('.pt-note')!.textContent = '本页为天玑计划说明，报名表以正式公告为准'))) ).not.toBeNull()
    expect(firstDiff(old, mut((r) => r.querySelector('#ptJoin')!.setAttribute('href', '#pt-joins')))).not.toBeNull()
    expect(firstDiff(old, mut((r) => r.querySelector('.pt-prize .pz')!.remove()))).not.toBeNull()
    expect(firstDiff(old, mut((r) => r.querySelector<HTMLElement>('.pt-fr')!.style.setProperty('left', '5%')))).not.toBeNull()
  })

  it('交互：报名与评审锚点、返回键、开始创作链接，新旧观察结果相等', () => {
    const old = scenario(mountLegacy('viewPartner'))
    const nu = scenario(mountNew(<PartnerPage />))
    expect(nu).toStrictEqual(old)
    // 旧行为本身（防止两边同时失效而“相等”）
    expect(old.join).toEqual({ prevented: true, scrolls: [{ id: 'pt-join', arg: { behavior: 'smooth' } }], hash: '' })
    expect(old.backNoHistory).toMatchObject({ prevented: false, back: 0 })
    expect(old.backWithHistory).toMatchObject({ prevented: true, back: 1 })
    expect(old.create).toEqual([
      { href: '#/', prevented: false },
      { href: '#/', prevented: false },
    ])
  })

  it('PartnerBanner：默认形态与旧 partnerBanner() 的 DOM 相等，big 形态与旧页面头图相等', () => {
    // 默认：旧 partnerBanner() 的返回值直接放进 #view
    document.body.innerHTML = '<div id="view"></div>'
    ;(console as any).__tjHost = { document, history, location }
    legacyPages().run('(globalThis.document=console.__tjHost.document,0)')
    document.getElementById('view')!.innerHTML = legacyPages().run<string>('partnerBanner()')
    const old = snapChildren(document.getElementById('view')!)
    const nu = snapChildren(mountNew(<PartnerBanner />).view)
    expect(countNodes(old)).toBeGreaterThanOrEqual(30)
    expect(firstDiff(old, nu)).toBeNull()
    // big：旧页面 viewPartner 里 .pt-hero 的第一个子元素
    const hero = snapChildren(mountLegacy('viewPartner').view.querySelector('.pt-hero > .pt-banner')!.parentElement!)[0]
    const bigNew = snapChildren(mountNew(<PartnerBanner big />).view)[0]
    expect(firstDiff(hero, bigNew)).toBeNull()
  })

  it('PartnerBanner 默认形态是指向 #/partner 的链接，大图形态没有“了解计划”', () => {
    const a = mountNew(<PartnerBanner />).view.querySelector('a.pt-banner')!
    expect(a.getAttribute('href')).toBe('#/partner')
    expect(a.querySelector('.pt-go')?.textContent).toBe('了解计划 ')
    const big = mountNew(<PartnerBanner big />).view
    expect(big.querySelector('a')).toBeNull()
    expect(big.querySelector('.pt-go')).toBeNull()
    expect(big.querySelector('.pt-banner.big')).not.toBeNull()
  })
})
