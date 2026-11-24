import { afterEach, describe, expect, it, vi } from 'vitest'
import { getHot, loadHot, resetHot, subscribeHot } from '../../src/features/simple/home/hot'

/** /hot 页面级缓存（旧 window._hotLive / _hotLoading）的语义。 */
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
const reply = (ok: boolean, body: unknown) => vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) }))

afterEach(() => {
  resetHot()
  vi.unstubAllGlobals()
})

describe('loadHot', () => {
  it('请求进行中不重复请求；成功且 topics 非空后缓存、通知、不再请求', async () => {
    const f = reply(true, { topics: [{ t: 'a' }], works: [] })
    vi.stubGlobal('fetch', f)
    const seen = vi.fn()
    const off = subscribeHot(seen)
    loadHot()
    loadHot()
    expect(f).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledWith('/hot')
    await flush()
    expect(getHot()).toEqual({ topics: [{ t: 'a' }], works: [] })
    expect(seen).toHaveBeenCalledTimes(1)
    loadHot()
    expect(f).toHaveBeenCalledTimes(1)
    off()
  })
  it.each([
    ['503', reply(false, { error: 'x' })],
    ['topics 为空', reply(true, { topics: [] })],
    ['没有 topics', reply(true, {})],
    ['JSON 解析失败', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('bad')) }))],
    ['网络失败', vi.fn(() => Promise.reject(new Error('net')))],
  ])('%s：不缓存、清掉加载标记，下次再请求', async (_, f) => {
    vi.stubGlobal('fetch', f)
    loadHot()
    await flush()
    expect(getHot()).toBeNull()
    loadHot()
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('后端地址前缀取 window.TJ_API_BASE', async () => {
    const f = reply(false, {})
    vi.stubGlobal('fetch', f)
    vi.stubGlobal('window', { TJ_API_BASE: 'https://api.example.test' })
    loadHot()
    expect(f).toHaveBeenCalledWith('https://api.example.test/hot')
    await flush()
  })
})
