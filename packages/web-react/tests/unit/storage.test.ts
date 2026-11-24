import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from '../parity/legacy'

type Storage = typeof import('../../src/lib/storage')
let S: Storage
let mem: MemoryStorage

beforeEach(async () => {
  vi.resetModules()
  mem = new MemoryStorage()
  vi.stubGlobal('localStorage', mem)
  S = await import('../../src/lib/storage')
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('works 推送钩子', () => {
  it('只有 set("works") 触发，其他键与原文写入不触发', () => {
    const hook = vi.fn()
    S.setWorksPushHook(hook)
    S.set('works', [{ id: 'a' }] as never)
    expect(hook).toHaveBeenCalledTimes(1)
    S.set('works', null)
    expect(hook).toHaveBeenCalledTimes(2)
    S.set('chat', { tab: 'auto' })
    S.set('lastVibe', 'a')
    S.writeWorksRaw([{ id: 'b' }] as never)
    expect(hook).toHaveBeenCalledTimes(2)
    expect(S.readWorksRaw()).toStrictEqual([{ id: 'b' }])
  })

  it('推送钩子抛错与写入失败都被吞掉（同旧 store 的 try/catch）', () => {
    S.setWorksPushHook(() => {
      throw new Error('x')
    })
    expect(() => S.set('works', [] as never)).not.toThrow()
    vi.spyOn(mem, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    const hook = vi.fn()
    S.setWorksPushHook(hook)
    expect(() => S.set('works', [{ id: 'z' }] as never)).not.toThrow()
    expect(hook).not.toHaveBeenCalled()
  })

  it('注销后不再触发；注销旧钩子不影响新钩子', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = S.setWorksPushHook(a)
    S.setWorksPushHook(b)
    offA()
    S.set('works', [] as never)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })
})

describe('订阅与跨标签页通知', () => {
  it('同页 set / remove / writeWorksRaw 通知对应键的订阅者', () => {
    const w = vi.fn()
    const a = vi.fn()
    S.subscribe('works', w)
    S.subscribe('auth', a)
    S.set('works', [] as never)
    S.writeWorksRaw([] as never)
    S.remove('auth')
    expect(w).toHaveBeenCalledTimes(2)
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('其他标签页的 storage 事件：pl.* 通知对应键；非 pl. 前缀与其他存储区忽略；key 为 null 通知全部', () => {
    const w = vi.fn()
    const p = vi.fn()
    S.subscribe('works', w)
    S.subscribe('pro', p)
    S.handleStorageEvent({ key: 'pl.works', storageArea: mem as unknown as globalThis.Storage })
    expect(w).toHaveBeenCalledTimes(1)
    expect(p).toHaveBeenCalledTimes(0)
    S.handleStorageEvent({ key: 'works', storageArea: mem as unknown as globalThis.Storage })
    S.handleStorageEvent({ key: 'pl.works', storageArea: new MemoryStorage() as unknown as globalThis.Storage })
    expect(w).toHaveBeenCalledTimes(1)
    S.handleStorageEvent({ key: null, storageArea: mem as unknown as globalThis.Storage })
    expect(w).toHaveBeenCalledTimes(2)
    expect(p).toHaveBeenCalledTimes(1)
  })

  it('取消订阅后不再通知', () => {
    const fn = vi.fn()
    const off = S.subscribe('pro', fn)
    off()
    S.set('pro', false)
    expect(fn).not.toHaveBeenCalled()
  })

  it('浏览器里模块加载时注册 window storage 监听', async () => {
    vi.resetModules()
    const add = vi.fn()
    vi.stubGlobal('window', { addEventListener: add })
    const S2: Storage = await import('../../src/lib/storage')
    expect(add).toHaveBeenCalledWith('storage', S2.handleStorageEvent)
  })
})

describe('快照（useStored 用）', () => {
  it('原文不变时返回同一对象；其他标签页改了原文后返回新值', () => {
    S.set('chat', { tab: 'auto' })
    const a = S.snapshot('chat')
    expect(S.snapshot('chat')).toBe(a)
    mem.setItem('pl.chat', JSON.stringify({ tab: 'paste' }))
    const b = S.snapshot('chat')
    expect(b).not.toBe(a)
    expect(b).toStrictEqual({ tab: 'paste' })
  })

  it('localStorage 不可用时读为 null、写不抛错', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(S.get('works')).toBeNull()
    expect(S.snapshot('works')).toBeNull()
    expect(() => S.set('pro', true)).not.toThrow()
    expect(() => S.remove('auth')).not.toThrow()
  })
})

describe('sessionStorage.tjAdmin', () => {
  it('读写管理员口令，缺省为空串', () => {
    const ss = new MemoryStorage()
    vi.stubGlobal('sessionStorage', ss)
    expect(S.adminKey.get()).toBe('')
    S.adminKey.set('k1')
    expect(ss.getItem('tjAdmin')).toBe('k1')
    expect(S.adminKey.get()).toBe('k1')
    expect(mem.length).toBe(0)
  })
})
