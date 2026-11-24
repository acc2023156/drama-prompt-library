import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminPage } from '../../src/features/account/AdminPage'
import { HotwordsPage } from '../../src/features/account/HotwordsPage'
import { TrashPage } from '../../src/features/account/TrashPage'
import { getToast } from '../../src/lib/toast'
import { type FetchRoutes, makeFetch, settle } from '../parity/legacy-page'

/**
 * 真实交互（user-event）下的字面值断言：localStorage 原文、sessionStorage、请求的路径 / 方法 / 头 / 体逐字符写死。
 * 与 tests/parity/account.test.tsx 互补：那边证明“和旧页面一致”，这边证明“旧页面约定的具体值”本身没有被一起改掉。
 */

const NOW = Date.UTC(2027, 0, 15, 4, 0, 0)
const DAY = 864e5
const LQ = String.fromCharCode(0x300c) // 旧页面起手话两侧的直角引号，源码里不写字面字符
const RQ = String.fromCharCode(0x300d)
const flush = () => act(async () => void (await settle()))

let calls: ReturnType<typeof makeFetch>['calls']
function stub(routes: FetchRoutes, answers: boolean[] = []) {
  const f = makeFetch('', routes)
  calls = f.calls
  vi.stubGlobal('fetch', f.fn)
  vi.stubGlobal('confirm', vi.fn(() => (answers.length ? answers.shift()! : true)))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  window.TJ_API_BASE = ''
  localStorage.clear()
  sessionStorage.clear()
  location.hash = '#/x'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete window.TJ_API_BASE
  localStorage.clear()
  sessionStorage.clear()
  location.hash = ''
})

describe('热词页：真实点击', () => {
  const words = { at: 't', words: [{ word: '重生复仇', cat: '情感', heat: 98, trend: '↑' }, { word: '悬疑反转', cat: '悬疑', heat: 49 }, { word: '末日', cat: '情感', heat: 10 }] }

  it('请求只有一次 GET /words，不带任何头与选项', async () => {
    stub(() => ({ body: words }))
    render(<HotwordsPage />)
    await flush()
    expect(calls).toEqual([{ url: '/words', init: undefined }])
  })

  it('分类切换后只显示该类，序号与热度条按当前列表重排', async () => {
    stub(() => ({ body: words }))
    render(<HotwordsPage />)
    await flush()
    expect(screen.getAllByRole('button').filter((b) => b.classList.contains('hw-row'))).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: '悬疑' }))
    const rows = document.querySelectorAll('.hw-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].querySelector('i')!.textContent).toBe('01')
    // 热度条宽度按全部词里的最高热度（98）折算：49 / 98 = 50%
    expect((rows[0].querySelector('.hw-bar s') as HTMLElement).style.width).toBe('50%')
    expect(screen.getByRole('button', { name: '悬疑' })).toHaveClass('on')
  })

  it('点词条：pl.chat 保留已有字段并按旧键序写回，vibeCard 写 null，pro 写 true，跳到 #/script', async () => {
    localStorage.setItem('pl.chat', '{"ai":"GPT","depth":"深"}')
    localStorage.setItem('pl.vibeCard', '{"pitch":"x"}')
    localStorage.setItem('pl.pro', 'false')
    stub(() => ({ body: words }))
    render(<HotwordsPage />)
    await flush()
    await userEvent.click(document.querySelector('.hw-row')!)
    expect(localStorage.getItem('pl.chat')).toBe(
      `{"tab":"auto","doc":"","pitch":"以${LQ}重生复仇${RQ}为题材，","novel":"","editing":false,"style":"无","ratio":"9:16","ai":"GPT","depth":"深"}`,
    )
    expect(localStorage.getItem('pl.vibeCard')).toBe('null')
    expect(localStorage.getItem('pl.pro')).toBe('true')
    expect(location.hash).toBe('#/script')
    expect(getToast()).toMatchObject({ text: '补完这句故事就能开写', show: true })
  })

  it('读取失败：只显示提示，没有词条', async () => {
    stub(() => ({ status: 503, body: { error: 'no data' } }))
    render(<HotwordsPage />)
    await flush()
    expect(screen.getByText('暂时读不到，稍后再试')).toBeInTheDocument()
    expect(document.querySelectorAll('.hw-row')).toHaveLength(0)
  })

  it('组件卸载后迟到的响应不再更新页面', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    vi.stubGlobal('fetch', async () => {
      await gate
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => words }
    })
    const { unmount } = render(<HotwordsPage />)
    unmount()
    release()
    await flush()
    expect(document.body.textContent).toBe('')
  })
})

describe('回收站：真实点击', () => {
  const work = (id: string, trashed: number, extra: Record<string, unknown> = {}) => ({ id, title: 'T' + id, W: {}, time: 1, trashed, ...extra })
  const auth = '{"token":"tk","user":{"uid":"u9","phone":"13800138000","role":"free","points":1}}'

  it('还原：pl.works 原文逐字节为去掉 trashed、time=当前时间的 JSON；提示 已还原', async () => {
    localStorage.setItem('pl.works', JSON.stringify([{ id: 'a', title: 'A', W: {}, time: 1, trashed: NOW - DAY }]))
    stub(() => ({ status: 404, body: {} }))
    render(<TrashPage />)
    await userEvent.click(screen.getByRole('button', { name: /还原/ }))
    expect(localStorage.getItem('pl.works')).toBe(`[{"id":"a","title":"A","W":{},"time":${NOW}}]`)
    expect(getToast()).toMatchObject({ text: '已还原', show: true })
    expect(screen.getByText('回收桶是空的。')).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('永久删除：已登录发 DELETE /works/<编码后的 id>，头为 Content-Type + Bearer，无请求体', async () => {
    localStorage.setItem('pl.auth', auth)
    localStorage.setItem('pl.works', JSON.stringify([work('w 1/é', NOW - DAY), work('keep', NOW - 2 * DAY)]))
    stub(() => ({ body: { ok: true } }))
    render(<TrashPage />)
    await userEvent.click(within(screen.getByText('《Tw 1/é》').closest('.acard') as HTMLElement).getByRole('button', { name: '永久删除' }))
    expect(confirm).toHaveBeenCalledWith('永久删除这部作品？删除后无法复原。')
    expect(calls).toEqual([{ url: '/works/w%201%2F%C3%A9', init: { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tk' } } }])
    expect(JSON.parse(localStorage.getItem('pl.works')!).map((w: { id: string }) => w.id)).toEqual(['keep'])
    expect(getToast().text).toBe('已永久删除')
  })

  it('永久删除：取消确认什么都不发生', async () => {
    localStorage.setItem('pl.auth', auth)
    const raw = JSON.stringify([work('a', NOW - DAY)])
    localStorage.setItem('pl.works', raw)
    stub(() => ({ body: {} }), [false])
    render(<TrashPage />)
    await userEvent.click(screen.getByRole('button', { name: '永久删除' }))
    expect(localStorage.getItem('pl.works')).toBe(raw)
    expect(calls).toEqual([])
  })

  it('清空回收桶：提问带部数，确认后删光并逐个 DELETE，不弹 toast', async () => {
    localStorage.setItem('pl.auth', auth)
    localStorage.setItem('pl.works', JSON.stringify([work('a', NOW - DAY), work('b', NOW - 2 * DAY), { id: 'live', title: 'L', W: {}, time: 1 }]))
    stub(() => ({ body: {} }))
    const before = getToast().text
    render(<TrashPage />)
    await userEvent.click(screen.getByRole('button', { name: '清空回收桶' }))
    expect(confirm).toHaveBeenCalledWith('永久删除回收桶里全部 2 部作品？删除后无法复原。')
    expect(calls.map((c) => c.url)).toEqual(['/works/a', '/works/b'])
    expect(localStorage.getItem('pl.works')).toBe('[{"id":"live","title":"L","W":{},"time":1}]')
    expect(getToast().text).toBe(before)
  })

  it('进入页面清理 30 天前的作品：写回本地，已登录对每个发 DELETE；整 30 天的保留', async () => {
    localStorage.setItem('pl.auth', auth)
    localStorage.setItem('pl.works', JSON.stringify([work('old', NOW - 30 * DAY - 1), work('edge', NOW - 30 * DAY)]))
    stub(() => ({ body: {} }))
    render(<TrashPage />)
    await flush()
    expect(JSON.parse(localStorage.getItem('pl.works')!).map((w: { id: string }) => w.id)).toEqual(['edge'])
    expect(calls.map((c) => `${c.init && (c.init as { method: string }).method} ${c.url}`)).toEqual(['DELETE /works/old'])
    expect(screen.getByText(/剩 0 天/)).toBeInTheDocument()
  })

  it('页面显示的作品随 pl.works 其他来源的写入刷新（如云同步拉取后）', async () => {
    localStorage.setItem('pl.works', JSON.stringify([work('a', NOW - DAY)]))
    stub(() => ({ body: {} }))
    render(<TrashPage />)
    expect(screen.getByText('《Ta》')).toBeInTheDocument()
    const { set } = await import('../../src/lib/storage')
    act(() => set('works', [work('a', NOW - DAY), work('z', NOW - 3 * DAY)] as never))
    expect(screen.getByText('《Tz》')).toBeInTheDocument()
  })
})

describe('会员后台：真实交互', () => {
  const users = { day: '2027-01-15', users: [{ uid: 'u1', phone: '13800138000', role: 'free', points: 30, used_today: 2, used_total: 10, works: 3, last_login: NOW }] }
  const H = (key: string, bearer?: string) => ({ 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), 'X-Admin-Key': key })

  it('提交口令：sessionStorage.tjAdmin 写入去空格后的口令，GET /admin/users 与 /admin/stats 带 X-Admin-Key，无 Bearer 也不登出', async () => {
    stub((p) => (p === '/admin/users' ? { body: users } : { body: { today: {}, lastHour: {}, models: [] } }))
    render(<AdminPage />)
    expect(calls).toEqual([])
    await userEvent.type(screen.getByPlaceholderText('管理员密码'), '  pw  ')
    await userEvent.click(screen.getByRole('button', { name: '进入' }))
    await flush()
    expect(sessionStorage.getItem('tjAdmin')).toBe('pw')
    expect(calls).toEqual([
      { url: '/admin/users', init: { method: 'GET', headers: H('pw') } },
      { url: '/admin/stats', init: { method: 'GET', headers: H('pw') } },
    ])
    expect(screen.getByText('1 位 · 2027-01-15')).toBeInTheDocument()
  })

  it('403：提示密码不对；已登录时 Bearer 仍带上但不登出', async () => {
    localStorage.setItem('pl.auth', '{"token":"tk","user":{"uid":"u9","phone":"1","role":"free","points":1}}')
    sessionStorage.setItem('tjAdmin', 'bad')
    stub(() => ({ status: 403, body: { error: 'forbidden' } }))
    render(<AdminPage />)
    await flush()
    expect(screen.getByText('密码不对')).toBeInTheDocument()
    expect(calls).toEqual([{ url: '/admin/users', init: { method: 'GET', headers: H('bad', 'tk') } }])
    expect(localStorage.getItem('pl.auth')).not.toBeNull()
  })

  it('加点：POST /admin/points 体为 {uid,delta,note}；成功后 toast 带正负号并重新读取用户', async () => {
    sessionStorage.setItem('tjAdmin', 'pw')
    stub((p) => (p === '/admin/users' ? { body: users } : p === '/admin/stats' ? { body: {} } : { body: { ok: true } }))
    render(<AdminPage />)
    await flush()
    const row = document.querySelector('.adm-r[data-uid="u1"]') as HTMLElement
    await userEvent.type(row.querySelector('[data-n]')!, '5')
    await userEvent.type(row.querySelector('[data-note]')!, '活动')
    await userEvent.click(within(row).getByRole('button', { name: '加点' }))
    await flush()
    const post = calls.find((c) => c.url === '/admin/points')!
    expect(post).toEqual({ url: '/admin/points', init: { method: 'POST', headers: H('pw'), body: '{"uid":"u1","delta":5,"note":"活动"}' } })
    expect(calls.map((c) => c.url)).toEqual(['/admin/users', '/admin/stats', '/admin/points', '/admin/users', '/admin/stats'])
    expect(getToast().text).toBe('u1 +5')
    // 重新读取后输入框被清空
    expect((document.querySelector('.adm-r[data-uid="u1"] [data-n]') as HTMLInputElement).value).toBe('')
  })

  it('改身份：POST /admin/role 体为 {uid,role}', async () => {
    sessionStorage.setItem('tjAdmin', 'pw')
    stub((p) => (p === '/admin/users' ? { body: users } : p === '/admin/stats' ? { body: {} } : { body: { ok: true } }))
    render(<AdminPage />)
    await flush()
    await userEvent.selectOptions(document.querySelector('[data-role]') as HTMLSelectElement, 'tester')
    await flush()
    expect(calls.find((c) => c.url === '/admin/role')).toEqual({ url: '/admin/role', init: { method: 'POST', headers: H('pw'), body: '{"uid":"u1","role":"tester"}' } })
    expect(getToast().text).toBe('已改身份')
  })

  it('调用统计面板：成功率、平均耗时、忙线、逾时、近 1 小时与分模型明细', async () => {
    sessionStorage.setItem('tjAdmin', 'pw')
    stub((p) =>
      p === '/admin/users'
        ? { body: users }
        : { body: { today: { n: 8, ok: 6, avg_ms: 2500, busy: 1, timeout: 1 }, lastHour: { n: 3 }, models: [{ model: 'm1', n: 8, ok: 6, avg_ms: 2500 }] } },
    )
    render(<AdminPage />)
    await flush()
    const box = document.querySelector('.adm-stats') as HTMLElement
    expect(box.textContent).toBe('8今日调用75%成功率3s平均耗时1忙线 4291逾时3近 1 小时m1：8 次 · 成功 6 · 3s')
    expect(box.nextElementSibling).toHaveClass('adm-table')
  })

  it('统计请求失败：不显示统计面板', async () => {
    sessionStorage.setItem('tjAdmin', 'pw')
    stub((p) => (p === '/admin/users' ? { body: users } : { status: 500, body: {} }))
    render(<AdminPage />)
    await flush()
    expect(document.querySelector('.adm-stats')).toBeNull()
    expect(document.querySelector('.adm-table')).not.toBeNull()
  })
})
