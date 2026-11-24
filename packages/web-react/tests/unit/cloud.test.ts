import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from '../parity/legacy'

let mem: MemoryStorage
let fetchMock: ReturnType<typeof vi.fn>
let dispatch: ReturnType<typeof vi.fn>
type Cloud = typeof import('../../src/app/cloud')
type Store = typeof import('../../src/lib/storage')
let cloud: Cloud
let S: Store

const AUTH = { token: 'tok', user: { uid: 'u', phone: '13800138000', role: 'free', points: 10, cap: 40 } }
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const calls = () => fetchMock.mock.calls.map(([u, i]) => `${i?.method || 'GET'} ${u}`)

async function load(hash = '#/script') {
  vi.resetModules()
  mem = new MemoryStorage()
  vi.stubGlobal('localStorage', mem)
  vi.stubGlobal('window', { TJ_API_BASE: '' })
  vi.stubGlobal('location', { hash, search: '', pathname: '/' })
  fetchMock = vi.fn(async () => ok({}))
  vi.stubGlobal('fetch', fetchMock)
  dispatch = vi.fn()
  vi.stubGlobal('dispatchEvent', dispatch)
  vi.stubGlobal('HashChangeEvent', class extends Event {})
  S = await import('../../src/lib/storage')
  cloud = await import('../../src/app/cloud')
}

beforeEach(async () => {
  vi.useFakeTimers()
  await load()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('cloudPush', () => {
  it('未登录不推送', async () => {
    S.set('works', [{ id: 'a' }] as never)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('写 works 后防抖 1.5 秒，连续写只推一次；只推指纹变化的作品', async () => {
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    S.set('works', [{ id: 'a', time: 1 }] as never)
    await vi.advanceTimersByTimeAsync(1000)
    S.set('works', [{ id: 'a', time: 2 }, { id: 'b/c', time: 1 }] as never)
    await vi.advanceTimersByTimeAsync(1499)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(calls()).toStrictEqual(['POST /works/a', 'POST /works/b%2Fc'])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toStrictEqual({ id: 'a', time: 2 })
    fetchMock.mockClear()
    S.set('works', [{ id: 'a', time: 2 }, { id: 'b/c', time: 5 }] as never)
    await vi.advanceTimersByTimeAsync(1500)
    expect(calls()).toStrictEqual(['POST /works/b%2Fc'])
  })

  it('某个作品推送失败即停止本轮，下次重推', async () => {
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    S.set('works', [{ id: 'a' }, { id: 'b' }] as never)
    await vi.advanceTimersByTimeAsync(1500)
    expect(calls()).toStrictEqual(['POST /works/a'])
    cloud.cloudPush()
    await vi.advanceTimersByTimeAsync(1500)
    expect(calls()).toStrictEqual(['POST /works/a', 'POST /works/a', 'POST /works/b'])
  })

  it('登出清空指纹后会全部重推（旧登出按钮的 cloudHash={}）', async () => {
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    S.set('works', [{ id: 'a' }] as never)
    await vi.advanceTimersByTimeAsync(1500)
    cloud.resetCloudHash()
    cloud.cloudPush(true)
    await vi.advanceTimersByTimeAsync(50)
    expect(calls()).toStrictEqual(['POST /works/a', 'POST /works/a'])
  })
})

describe('cloudPull', () => {
  it('合并、按 time 倒序原文写回（不经推送钩子），50 毫秒后只推本地较新的；在剧本页时刷新路由', async () => {
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    mem.setItem('pl.works', JSON.stringify([{ id: 'a', time: 5 }, { id: 'b', time: 1 }]))
    fetchMock.mockResolvedValueOnce(ok({ works: [{ id: 'a', data: { id: 'a', time: 4 } }, { id: 'b', data: { id: 'b', time: 9 } }, { id: 'c', data: { id: 'c', time: 3 } }] }))
    await cloud.cloudPull()
    expect(JSON.parse(mem.getItem('pl.works')!)).toStrictEqual([{ id: 'b', time: 9 }, { id: 'a', time: 5 }, { id: 'c', time: 3 }])
    expect(dispatch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(49)
    expect(calls()).toStrictEqual(['GET /works'])
    await vi.advanceTimersByTimeAsync(1)
    expect(calls()).toStrictEqual(['GET /works', 'POST /works/a'])
  })

  it.each([
    ['', true], ['#/', true], ['#/script', true], ['#/script/v/w', true], ['#/prompts', false], ['#/assets', false],
  ])('当前 hash %j 时刷新路由：%s', async (hash, refresh) => {
    await load(hash)
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    fetchMock.mockResolvedValueOnce(ok({ works: [] }))
    await cloud.cloudPull()
    expect(dispatch).toHaveBeenCalledTimes(refresh ? 1 : 0)
  })

  it('未登录不请求；请求失败静默不改本地', async () => {
    await cloud.cloudPull()
    expect(fetchMock).not.toHaveBeenCalled()
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    mem.setItem('pl.works', '[{"id":"a"}]')
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    await expect(cloud.cloudPull()).resolves.toBeUndefined()
    expect(mem.getItem('pl.works')).toBe('[{"id":"a"}]')
  })
})

describe('purgeTrash', () => {
  it('删除回收站超过 30 天的作品；已登录时云端 DELETE 并推送剩余', async () => {
    const now = Date.UTC(2026, 10, 24)
    const day = 864e5
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    mem.setItem('pl.works', JSON.stringify([{ id: 'old', trashed: now - 31 * day }, { id: 'new', trashed: now - 29 * day }, { id: 'live' }]))
    cloud.purgeTrash(now)
    expect(JSON.parse(mem.getItem('pl.works')!).map((w: { id: string }) => w.id)).toStrictEqual(['new', 'live'])
    expect(calls()).toStrictEqual(['DELETE /works/old'])
    await vi.advanceTimersByTimeAsync(1500)
    expect(calls()).toStrictEqual(['DELETE /works/old', 'POST /works/new', 'POST /works/live'])
  })

  it('没有过期作品时不写存储', () => {
    mem.setItem('pl.works', '[{"id":"a","trashed":1}]')
    const spy = vi.spyOn(mem, 'setItem')
    cloud.purgeTrash(1 + 29 * 864e5)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('登录、刷新与登出', () => {
  it('手机号位数不对只提示，不请求', async () => {
    const { doLogin } = await import('../../src/app/session')
    const { getToast } = await import('../../src/lib/toast')
    expect(await doLogin('1234567')).toBe(false)
    expect(await doLogin('138-0013-80001')).toBe(false)
    expect(getToast().text).toBe('请输入 8–11 码手机号')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('登录成功：只发数字、存登录态、拉取作品', async () => {
    const { doLogin } = await import('../../src/app/session')
    const { getToast } = await import('../../src/lib/toast')
    fetchMock.mockResolvedValueOnce(ok({ token: 't2', user: AUTH.user, extra: 1 })).mockResolvedValueOnce(ok({ works: [] }))
    expect(await doLogin('138 0013 8000')).toBe(true)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toStrictEqual({ phone: '13800138000' })
    expect(JSON.parse(mem.getItem('pl.auth')!)).toStrictEqual({ token: 't2', user: AUTH.user })
    expect(calls()).toStrictEqual(['POST /auth/login', 'GET /works'])
    expect(getToast().text).toBe('已登录')
  })

  it('登录失败提示后端错误', async () => {
    const { doLogin } = await import('../../src/app/session')
    const { getToast } = await import('../../src/lib/toast')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: '太频繁' }), { status: 429 }))
    expect(await doLogin('13800138000')).toBe(false)
    expect(getToast().text).toBe('太频繁')
  })

  it('refreshMe 用 /me 的 user 覆盖本地；登出删除登录态并提示', async () => {
    const { refreshMe, logout } = await import('../../src/app/session')
    const { getToast } = await import('../../src/lib/toast')
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    fetchMock.mockResolvedValueOnce(ok({ user: { ...AUTH.user, points: 3 } }))
    await refreshMe()
    expect(JSON.parse(mem.getItem('pl.auth')!)).toStrictEqual({ token: 'tok', user: { ...AUTH.user, points: 3 } })
    logout()
    expect(mem.getItem('pl.auth')).toBeNull()
    expect(getToast().text).toBe('已登出')
  })
})

describe('启动顺序', () => {
  it('?k= 入库 → GET /me → GET /works → purgeTrash 的 DELETE', async () => {
    const day = 864e5
    vi.stubGlobal('location', { hash: '#/prompts', search: '?k=code', pathname: '/' })
    vi.stubGlobal('history', { replaceState: vi.fn() })
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    mem.setItem('pl.works', JSON.stringify([{ id: 'old', trashed: Date.now() - 40 * day }]))
    const { boot } = await import('../../src/app/boot')
    boot()
    expect(mem.getItem('pl.tjCode')).toBe('"code"')
    expect(calls()).toStrictEqual(['GET /me', 'GET /works', 'DELETE /works/old'])
  })
})
