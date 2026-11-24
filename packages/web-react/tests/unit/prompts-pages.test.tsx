import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDataDom } from '../parity/prompts-legacy'

/** 提示词库页面的交互：筛选、复制、相关功能点击、侧栏高亮（jsdom + testing-library）。 */
const data = loadDataDom()
let App: typeof import('../../src/app/App')
let List: typeof import('../../src/features/prompts/PromptListPage')
let Entry: typeof import('../../src/features/prompts/PromptEntryPage')
let Filter: typeof import('../../src/features/prompts/filter-state')
let Toast: typeof import('../../src/lib/toast')
const written: string[] = []

beforeAll(async () => {
  const s = document.createElement('script')
  s.id = 'tj-data'
  s.type = 'application/json'
  s.textContent = JSON.stringify(data)
  document.head.appendChild(s)
  // jsdom 没有实现这两个，外壳（Layout、SideNav）会调用
  window.scrollTo = vi.fn() as any
  Element.prototype.scrollIntoView = vi.fn()
  App = await import('../../src/app/App')
  List = await import('../../src/features/prompts/PromptListPage')
  Entry = await import('../../src/features/prompts/PromptEntryPage')
  Filter = await import('../../src/features/prompts/filter-state')
  Toast = await import('../../src/lib/toast')
})
beforeEach(() => {
  localStorage.clear()
  location.hash = ''
  Filter.resetPromptFilter()
  written.length = 0
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void written.push(t) }, configurable: true })
})
afterEach(() => {
  vi.useRealTimers()
})

const entryOf = (id: string) => data.entries.find((e: any) => e.id === id)
const firstCode = (md: string) => (md.match(/```[^\n]*\n([\s\S]*?)\n```/) || [])[1]

describe('筛选', () => {
  it('搜索：计数随输入更新，无结果显示空提示，清空后回到全部', async () => {
    const { container } = render(<List.PromptListPage home />)
    expect(container.querySelector('#cnt')!.textContent).toBe('90 / 90 条')
    const q = screen.getByPlaceholderText(/搜索，如/)
    await userEvent.type(q, '6.0')
    const n = Number(container.querySelector('#cnt')!.textContent!.split(' / ')[0])
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThan(90)
    expect(container.querySelectorAll('.card').length).toBe(n)
    await userEvent.clear(q)
    await userEvent.type(q, 'zzzz-no-such-text')
    expect(container.querySelector('#cnt')!.textContent).toBe('0 / 90 条')
    expect(screen.getByText('没有符合条件的提示词')).toBeInTheDocument()
    await userEvent.clear(q)
    expect(container.querySelector('#cnt')!.textContent).toBe('90 / 90 条')
    expect(container.querySelectorAll('.card').length).toBe(90)
  })

  it('来源筛选：按钮高亮切换，结果只含对应来源', async () => {
    const { container } = render(<List.PromptListPage home />)
    const all = screen.getByRole('button', { name: '全部来源' })
    const ref = screen.getByRole('button', { name: '仅参考' })
    expect(all).toHaveClass('on')
    await userEvent.click(ref)
    expect(ref).toHaveClass('on')
    expect(all).not.toHaveClass('on')
    const want = data.entries.filter((e: any) => e.license.includes('仅参考')).length
    expect(want).toBeGreaterThan(0)
    expect(container.querySelectorAll('.card').length).toBe(want)
    for (const t of container.querySelectorAll('.card .tag:not(.prod)')) expect(t.textContent).toContain('仅参考')
    // 有筛选时不再按目录分组
    expect(container.querySelector('#cards > .sec-head')).toBeNull()
  })

  it('只看已用于生产：开关高亮，数量与数据一致', async () => {
    const { container } = render(<List.PromptListPage home />)
    const prod = screen.getByRole('button', { name: /只看已用于生产/ })
    expect(prod).not.toHaveClass('on')
    await userEvent.click(prod)
    expect(prod).toHaveClass('on')
    expect(container.querySelectorAll('.card').length).toBe(data.entries.filter((e: any) => (e.status || '').includes('已用于生产')).length)
    await userEvent.click(prod)
    expect(prod).not.toHaveClass('on')
    expect(container.querySelectorAll('.card').length).toBe(90)
  })

  it('首页无筛选时按 15 个目录分组，目录页不分组且计数为目录内条数', () => {
    const a = render(<List.PromptListPage home />)
    expect(a.container.querySelectorAll('#cards > .sec-head').length).toBe(15)
    a.unmount()
    const b = render(<List.PromptListPage folder="03-revision" home={false} />)
    expect(b.container.querySelector('#cards > .sec-head')).toBeNull()
    const n = data.entries.filter((e: any) => e.folder === '03-revision' || e.folder.startsWith('03-revision/')).length
    expect(b.container.querySelector('#cnt')!.textContent).toBe(`${n} / ${n} 条`)
  })

  it('筛选条件跨页面保留，目录页也能继续筛选', async () => {
    const a = render(<List.PromptListPage home />)
    await userEvent.type(screen.getByPlaceholderText(/搜索，如/), '角色')
    a.unmount()
    render(<List.PromptListPage folder="01-outline" home={false} />)
    expect(screen.getByPlaceholderText(/搜索，如/)).toHaveValue('角色')
  })
})

describe('搜索命中相关功能', () => {
  it('搜 男主：显示相关功能，最多 9 项，点击角色类型写 pro=false 与 sxPick', async () => {
    const { container } = render(<List.PromptListPage home />)
    await userEvent.type(screen.getByPlaceholderText(/搜索，如/), '男主')
    const box = container.querySelector('#fhits')!
    expect(within(box as HTMLElement).getByText('相关功能')).toBeInTheDocument()
    const hits = box.querySelectorAll('a.fhit')
    expect(hits.length).toBe(9)
    expect(box.textContent).toContain('显示前 9 项')
    const roleHit = Array.from(hits).find((a) => a.textContent!.includes('男频'))!
    expect(roleHit).toBeTruthy()
    // 阻止 jsdom 真跳转，只看点击写入的存储
    roleHit.addEventListener('click', (e) => e.preventDefault())
    await userEvent.click(roleHit)
    expect(JSON.parse(localStorage.getItem('pl.pro')!)).toBe(false)
    const pick = JSON.parse(localStorage.getItem('pl.sxPick')!)
    expect(pick).toMatchObject({ g: 'male', name: '', title: '', q: '' })
    expect(typeof pick.idx).toBe('number')
  })

  it('点击“新增作品”写 pro=true，不写 sxPick；点击无 pick 的资产功能什么也不写', async () => {
    render(<List.PromptListPage home />)
    await userEvent.type(screen.getByPlaceholderText(/搜索，如/), '策划')
    const add = screen.getByText('新增作品').closest('a')!
    add.addEventListener('click', (e) => e.preventDefault())
    await userEvent.click(add)
    expect(JSON.parse(localStorage.getItem('pl.pro')!)).toBe(true)
    expect(localStorage.getItem('pl.sxPick')).toBeNull()
    localStorage.clear()
    await userEvent.clear(screen.getByPlaceholderText(/搜索，如/))
    await userEvent.type(screen.getByPlaceholderText(/搜索，如/), '昼夜')
    const asset = screen.getByText('昼夜天气变体').closest('a')!
    expect(asset).toHaveAttribute('href', '#/assets/scene-var')
    asset.addEventListener('click', (e) => e.preventDefault())
    await userEvent.click(asset)
    expect(localStorage.getItem('pl.pro')).toBeNull()
  })

  it('目录页搜索不显示相关功能（旧 drawFuncHits 只在首页开）', async () => {
    const { container } = render(<List.PromptListPage folder="01-outline" home={false} />)
    await userEvent.type(screen.getByPlaceholderText(/搜索，如/), '男主')
    expect(container.querySelector('#fhits')!.children.length).toBe(0)
  })
})

describe('详情页复制', () => {
  it('点击“复制提示词正文”：复制第一个代码块、提示条、按钮 1.3 秒内显示已复制并带 done', async () => {
    const e = entryOf('2.5')
    const want = firstCode(e.body)
    expect(want).toBeTruthy()
    render(<Entry.PromptEntryPage id="2.5" />)
    const btn = screen.getByRole('button', { name: /复制提示词正文/ })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await act(async () => {
      btn.click()
    })
    expect(written).toEqual([want])
    expect(Toast.getToast()).toMatchObject({ text: '已复制到剪贴板', show: true })
    expect(btn).toHaveClass('done')
    expect(btn).toHaveTextContent('已复制')
    await act(async () => {
      vi.advanceTimersByTime(1400)
    })
    expect(btn).not.toHaveClass('done')
    expect(btn).toHaveTextContent('复制提示词正文')
  })

  it('没有代码块的条目不显示复制按钮；6.0 显示“在组装器里调整”', () => {
    const none = data.entries.find((x: any) => !firstCode(x.body))
    if (none) {
      const a = render(<Entry.PromptEntryPage id={none.id} />)
      expect(screen.queryByRole('button', { name: /复制提示词正文/ })).toBeNull()
      a.unmount()
    }
    render(<Entry.PromptEntryPage id="6.0" />)
    expect(screen.getByRole('link', { name: /在组装器里调整/ })).toHaveAttribute('href', '#/assembler')
  })

  it('正文里每个代码卡有自己的复制按钮，复制该卡的内容', async () => {
    render(<Entry.PromptEntryPage id="6.0" />)
    const cards = document.querySelectorAll<HTMLElement>('.md .code')
    expect(cards.length).toBeGreaterThan(0)
    await act(async () => {
      cards[0].querySelector<HTMLElement>('.copy')!.click()
    })
    expect(written).toEqual([cards[0].querySelector('pre')!.textContent])
  })

  it('上一条 / 下一条链接指向同目录的相邻条目；首尾缺一侧用占位', () => {
    const e = entryOf('2.5')
    const sib = data.entries.filter((x: any) => x.folder === e.folder || x.folder.startsWith(e.folder + '/')).sort((a: any, b: any) => {
      const x = a.id.split('.').map(Number), y = b.id.split('.').map(Number)
      return x[0] - y[0] || x[1] - y[1]
    })
    const i = sib.findIndex((x: any) => x.id === '2.5')
    const { container } = render(<Entry.PromptEntryPage id="2.5" />)
    const links = container.querySelectorAll<HTMLAnchorElement>('.pager a')
    const hrefs = Array.from(links).map((a) => a.getAttribute('href'))
    if (sib[i - 1]) expect(hrefs).toContain('#/e/' + sib[i - 1].id)
    if (sib[i + 1]) expect(hrefs).toContain('#/e/' + sib[i + 1].id)
    expect(container.querySelectorAll('.pager > *').length).toBe(2)
  })
})

describe('侧栏联动（整个 App：Layout + 路由 + 页面）', () => {
  const sideOn = () => Array.from(document.querySelectorAll('#pside a.on')).map((a) => a.getAttribute('href'))
  const go = async (hash: string) => {
    await act(async () => {
      location.hash = hash
    })
    await waitFor(() => expect(location.hash).toBe(hash))
  }

  it('打开详情 #/e/2.5：侧栏只高亮该条（章节目录展开但不高亮，同旧 drawNav），顶栏“提示词”高亮；点上一条后高亮跟着变', async () => {
    location.hash = '#/e/2.5'
    const { container } = render(<App.App />)
    await waitFor(() => expect(container.querySelector('article.detail h1')).toHaveTextContent('2.5'))
    expect(sideOn()).toEqual(['#/e/2.5'])
    expect(container.querySelector('#tbSeg a.on')!.getAttribute('href')).toBe('#/prompts')
    const prev = container.querySelector<HTMLAnchorElement>('.pager a:not(.r)')!
    expect(prev).not.toBeNull()
    const href = prev.getAttribute('href')!
    await userEvent.click(prev)
    await waitFor(() => expect(sideOn()).toEqual([href]))
  })

  it('首页点卡片进详情，再点面包屑回目录：高亮与页面随 hash 变化', async () => {
    location.hash = '#/prompts'
    const { container } = render(<App.App />)
    await waitFor(() => expect(container.querySelectorAll('#view .card').length).toBe(90))
    expect(sideOn()).toEqual(['#/prompts'])
    await userEvent.click(container.querySelector<HTMLElement>('#view .card[href="#/e/3.1"]')!)
    await waitFor(() => expect(container.querySelector('article.detail h1')).toHaveTextContent('3.1'))
    expect(sideOn()).toContain('#/e/3.1')
    const crumb = container.querySelector<HTMLAnchorElement>('.crumb a:nth-child(2)')!
    await userEvent.click(crumb)
    await waitFor(() => expect(container.querySelector('#view .sec-head h2')).toBeInTheDocument())
    expect(location.hash).toBe(crumb.getAttribute('href'))
  })

  it('目录页 #/f/03-revision/dialogue：该子目录高亮；更新记录页：侧栏“更新记录”高亮并渲染正文', async () => {
    location.hash = '#/f/03-revision/dialogue'
    const { container } = render(<App.App />)
    await waitFor(() => expect(container.querySelectorAll('#view .card').length).toBeGreaterThan(0))
    expect(sideOn()).toContain('#/f/03-revision/dialogue')
    await go('#/changelog')
    await waitFor(() => expect(container.querySelector('#view article.detail h1')).toHaveTextContent('更新记录'))
    expect(sideOn()).toEqual(['#/changelog'])
    expect(container.querySelector('#view .md strong')).toBeInTheDocument()
  })

  it('不存在的编号：显示“找不到这条提示词”，侧栏不高亮任何条目', async () => {
    location.hash = '#/e/999.9'
    const { container } = render(<App.App />)
    await waitFor(() => expect(container.querySelector('#view .empty')).toHaveTextContent('找不到这条提示词'))
    expect(sideOn().filter((h) => h!.startsWith('#/e/'))).toEqual([])
  })
})
