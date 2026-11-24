import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from '../parity/legacy'

let mem: MemoryStorage
let fetchMock: ReturnType<typeof vi.fn>
type Api = typeof import('../../src/lib/api')
let api: Api

const AUTH = { token: 'tok', user: { uid: 'u', phone: '13800138000', role: 'free', points: 10, cap: 40 } }
const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? 'not json' : JSON.stringify(body), { status, headers })

beforeEach(async () => {
  vi.resetModules()
  mem = new MemoryStorage()
  vi.stubGlobal('localStorage', mem)
  vi.stubGlobal('window', { TJ_API_BASE: 'https://api.example.test' })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  api = await import('../../src/lib/api')
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api()', () => {
  it('基址 + 路径；未登录不带 Authorization；默认 GET', async () => {
    fetchMock.mockResolvedValue(res(200, { ok: 1 }))
    expect(await api.api('/me')).toStrictEqual({ ok: 1 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.test/me')
    expect(init).toStrictEqual({ method: 'GET', headers: { 'Content-Type': 'application/json' }, body: undefined })
  })

  it('已登录带 Bearer；调用方 headers 合并在后', async () => {
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    fetchMock.mockResolvedValue(res(200, {}))
    await api.api('/works/a', { method: 'POST', body: '{}', headers: { 'X-A': '1' } })
    expect(fetchMock.mock.calls[0][1]).toStrictEqual({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok', 'X-A': '1' }, body: '{}' })
  })

  it('空基址 = 同源', async () => {
    vi.stubGlobal('window', { TJ_API_BASE: '' })
    fetchMock.mockResolvedValue(res(200, {}))
    await api.api('/hot')
    expect(fetchMock.mock.calls[0][0]).toBe('/hot')
  })

  it('401 且已登录：登出（删 pl.auth）并抛带 status 的错误', async () => {
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    fetchMock.mockResolvedValue(res(401, { error: '未登录' }))
    await expect(api.api('/me')).rejects.toMatchObject({ message: '未登录', status: 401 })
    expect(mem.getItem('pl.auth')).toBeNull()
  })

  it('401 + noLogout：不登出', async () => {
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    fetchMock.mockResolvedValue(res(401, { error: 'x' }))
    await expect(api.api('/admin/users', { noLogout: true })).rejects.toMatchObject({ status: 401 })
    expect(mem.getItem('pl.auth')).not.toBeNull()
  })

  it('非 2xx：消息取 error 字段；无 JSON 体为 HTTP <状态码>；error 为对象时取 message', async () => {
    fetchMock.mockResolvedValueOnce(res(403, { error: '密码不对' }))
    await expect(api.api('/admin/users')).rejects.toMatchObject({ message: '密码不对', status: 403 })
    fetchMock.mockResolvedValueOnce(res(502, undefined))
    await expect(api.api('/x')).rejects.toMatchObject({ message: 'HTTP 502', status: 502 })
    fetchMock.mockResolvedValueOnce(res(400, { error: { message: '手机号格式不对', issues: [] } }))
    await expect(api.api('/auth/login')).rejects.toMatchObject({ message: '手机号格式不对', status: 400 })
  })

  it('adminApi：X-Admin-Key、noLogout，覆盖调用方 headers（同旧 viewAdmin 的 A()）', async () => {
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    fetchMock.mockResolvedValue(res(401, {}))
    await expect(api.adminApi('/admin/points', 'secret', { method: 'POST', body: '{}', headers: { 'X-B': '1' } })).rejects.toMatchObject({ status: 401 })
    expect(fetchMock.mock.calls[0][1].headers).toStrictEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok', 'X-Admin-Key': 'secret' })
    expect(mem.getItem('pl.auth')).not.toBeNull()
  })
})

describe('tjApi() 与通行码', () => {
  it('GET 只带 X-Tianji-Code；有 body 时 POST + JSON', async () => {
    mem.setItem('pl.tjCode', JSON.stringify('c1'))
    fetchMock.mockResolvedValue(res(200, { id: 'j' }))
    await api.tjApi('/jobs/j')
    expect(fetchMock.mock.calls[0][1]).toStrictEqual({ method: 'GET', headers: { 'X-Tianji-Code': 'c1' }, body: undefined })
    await api.tjApi('/jobs', { a: 1 })
    expect(fetchMock.mock.calls[1][1]).toStrictEqual({ method: 'POST', headers: { 'X-Tianji-Code': 'c1', 'Content-Type': 'application/json' }, body: '{"a":1}' })
    fetchMock.mockResolvedValue(res(500, {}))
    const e = await api.tjApi('/jobs/j').catch((x) => x)
    expect(e.message).toBe('HTTP 500')
    expect(e.status).toBeUndefined()
  })

  it('?k= 存入 pl.tjCode 并从地址栏移除查询串，保留 hash', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { search: '?k=abc&x=1', pathname: '/site/', hash: '#/script' })
    vi.stubGlobal('history', { replaceState })
    api.captureCodeFromUrl()
    expect(mem.getItem('pl.tjCode')).toBe('"abc"')
    expect(replaceState).toHaveBeenCalledWith(null, '', '/site/#/script')
  })

  it('没有 ?k= 时什么都不做', () => {
    const replaceState = vi.fn()
    vi.stubGlobal('location', { search: '?x=1', pathname: '/', hash: '' })
    vi.stubGlobal('history', { replaceState })
    api.captureCodeFromUrl()
    expect(mem.length).toBe(0)
    expect(replaceState).not.toHaveBeenCalled()
  })
})

describe('yqPost()', () => {
  it('请求头与请求体；X-Points 回写积分', async () => {
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    mem.setItem('pl.tjCode', JSON.stringify('c1'))
    fetchMock.mockResolvedValue(res(200, {}, { 'X-Points': '7' }))
    const body = { model: 'm', messages: [{ role: 'user', content: 'hi' }], max_tokens: 3000, temperature: 0.8, stream: true }
    const ac = new AbortController()
    await api.yqPost(body, ac.signal)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.test/yq/v1/chat/completions')
    expect(init).toStrictEqual({ method: 'POST', signal: ac.signal, headers: { 'X-Tianji-Code': 'c1', 'Content-Type': 'application/json', Authorization: 'Bearer tok' }, body: JSON.stringify(body) })
    expect(JSON.parse(mem.getItem('pl.auth')!).user.points).toBe(7)
  })

  it('未登录不写 pl.auth；没有 X-Points 头不改积分', async () => {
    fetchMock.mockResolvedValue(res(200, {}, { 'X-Points': '7' }))
    await api.yqPost({})
    expect(mem.getItem('pl.auth')).toBeNull()
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    fetchMock.mockResolvedValue(res(200, {}))
    await api.yqPost({})
    expect(JSON.parse(mem.getItem('pl.auth')!).user.points).toBe(10)
  })

  it('网络失败抛可重试错误“网路中断”', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(api.yqPost({})).rejects.toMatchObject({ message: '网路中断', retry: true })
  })
})

describe('getPublic()', () => {
  it('成功返回 JSON；非 2xx 与网络失败返回 null；无鉴权头', async () => {
    mem.setItem('pl.auth', JSON.stringify(AUTH))
    fetchMock.mockResolvedValueOnce(res(200, { topics: [1] }))
    expect(await api.getPublic('/hot')).toStrictEqual({ topics: [1] })
    expect(fetchMock.mock.calls[0]).toStrictEqual(['https://api.example.test/hot'])
    fetchMock.mockResolvedValueOnce(res(500, {}))
    expect(await api.getPublic('/hot')).toBeNull()
    fetchMock.mockRejectedValueOnce(new Error('x'))
    expect(await api.getPublic('/words')).toBeNull()
  })
})
