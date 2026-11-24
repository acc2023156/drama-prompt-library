import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { genReq } from '../../src/domain/gen'
import type { Work, WzSettings } from '../../src/domain/types'
import { isStopped, WritingStopped } from '../../src/features/writing/request'
import { freshEngine, type FreshEngine, type Reply, settle, sseReply, storyServer, T0 } from '../parity/writing-harness'

/* 写作引擎新增的接口（旧页面没有对应物）：订阅与状态快照、单飞、停止、默认依赖与单例、引擎核心不依赖框架与全局。 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '../../src/features/writing')
const AUTH = { token: 't', user: { uid: 'u', phone: '13800138000', role: 'free', points: 9 } }
const W: Partial<WzSettings> = { pitch: '她重生了', eps: 2, mins: 5, depth: '轻度', heat: '正常' }
const seed = (gen: Record<string, unknown> = {}) => ({ auth: AUTH, works: [{ id: 'w1', title: 't', W, vname: '甲', seed: 1, gen: { engine: 'yq', status: 'outline', at: T0, req: genReq(W), data: null, err: null, ...gen } }] })
const works = (F: FreshEngine) => JSON.parse(F.storage.getItem('pl.works') as string) as Work[]

let F: FreshEngine | null = null
afterEach(() => {
  F?.dispose()
  F = null
  vi.unstubAllGlobals()
})

describe('getState / subscribe', () => {
  it('未知作品返回同一个空闲快照；运行中 running 为真；结束后为假；没有变化时快照是同一个对象', async () => {
    F = freshEngine({ storage: seed() })
    const idle = F.engine.getState('w1')
    expect(idle).toEqual({ running: false, refresh: 0 })
    expect(F.engine.getState('nope')).toBe(idle)
    const seen: unknown[] = []
    const off = F.engine.subscribe('w1', () => seen.push(F!.engine.getState('w1')))
    const p = F.engine.driveYq('w1')
    expect(F.engine.getState('w1')).toEqual({ running: true, refresh: 0 })
    const s1 = F.engine.getState('w1')
    expect(F.engine.getState('w1')).toBe(s1)
    expect(Object.isFrozen(s1)).toBe(true)
    await settle(F, p)
    expect(F.engine.getState('w1')).toMatchObject({ running: false })
    // 大纲写好 1 次 + 每集写完 1 次 + 全部完成 1 次
    expect(F.engine.getState('w1').refresh).toBe(4)
    expect(seen[0]).toEqual({ running: true, refresh: 0 })
    expect(seen.at(-1)).toEqual({ running: false, refresh: 4 })
    off()
    F.engine.driveYq('w1')
    await settle(F, Promise.resolve())
    expect(seen.at(-1)).toEqual({ running: false, refresh: 4 })
  })
  it('各作品的订阅互不干扰', async () => {
    F = freshEngine({ storage: seed() })
    const a = vi.fn()
    const b = vi.fn()
    F.engine.subscribe('w1', a)
    F.engine.subscribe('w2', b)
    await settle(F, F.engine.driveYq('w1'))
    expect(a).toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })
})

describe('单飞', () => {
  it('同一作品重复 driveYq / enterWork 只发一份请求；跑完后再调才会重新开始', async () => {
    F = freshEngine({ storage: seed() })
    const p = F.engine.driveYq('w1')
    expect(F.engine.driveYq('w1')).toBe(p)
    expect(F.engine.enterWork('w1')).toBe('wait')
    expect(F.engine.enterWork('w1')).toBe('wait')
    await settle(F, p)
    const once = F.trace.of('fetch').length
    const F2 = freshEngine({ storage: seed() })
    await settle(F2, F2.engine.driveYq('w1'))
    expect(F2.trace.of('fetch').length).toBe(once)
    F2.dispose()
    // 已完成：再调不发请求
    await settle(F, F.engine.driveYq('w1'))
    expect(F.trace.of('fetch').length).toBe(once)
    expect(F.engine.isRunning('w1')).toBe(false)
  })
})

describe('stopYq', () => {
  it('没有任务时返回 false；stopAll 停掉全部', async () => {
    F = freshEngine({ storage: seed() })
    expect(F.engine.stopYq('w1')).toBe(false)
    F.engine.driveYq('w1')
    F.engine.stopAll()
    expect(F.engine.isRunning('w1')).toBe(false)
    expect(F.engine.getState('w1').running).toBe(false)
  })
  it('停在 3 路批次在途时：3 个请求的 signal 都被中止，之后无请求、无写入', async () => {
    const signals: AbortSignal[] = []
    F = freshEngine({
      storage: seed(),
      server: () => storyServer({ step: 4000, override: (req, kind) => (kind === 'batch' && req.init?.signal && signals.push(req.init.signal), undefined) }),
    })
    void F.engine.driveYq('w1')
    // 大纲约 20 秒、分场约 16 秒，之后 3 路批次同时在途
    await F.clock.advance(40000)
    expect(signals).toHaveLength(3)
    expect(signals.some((s) => s.aborted)).toBe(false)
    const n = F.trace.events.length
    F.engine.stopYq('w1')
    expect(signals.every((s) => s.aborted)).toBe(true)
    await F.clock.run(() => false, 3600e3)
    expect(F.trace.events.slice(n).filter((e) => e.k !== 'clear')).toEqual([])
    expect(F.clock.pending()).toBe(0)
  })
  it('停在重试等待中：等待取消，不再请求', async () => {
    F = freshEngine({ storage: seed(), server: () => () => ({ status: 429, json: { error: '忙' } }) })
    void F.engine.driveYq('w1')
    await F.clock.advance(1000)
    expect(F.trace.of('fetch')).toHaveLength(1)
    F.engine.stopYq('w1')
    await F.clock.run(() => false, 3600e3)
    expect(F.trace.of('fetch')).toHaveLength(1)
    expect(works(F)[0].gen!.status).toBe('outline')
  })
  it('停止后才到的 401 / 402 回应：不登出、不弹登录、不提示、不改积分', async () => {
    for (const reply of [{ status: 401, json: {}, delay: 5000 }, { status: 402, json: {}, delay: 5000, headers: { 'X-Points': '0' } }] as Reply[]) {
      const S = freshEngine({ storage: seed(), server: () => () => reply })
      void S.engine.driveYq('w1')
      await S.clock.advance(100)
      S.engine.stopYq('w1')
      await S.clock.run(() => false, 3600e3)
      expect(S.trace.events.filter((e) => e.k === 'ev' || e.k === 'write' || e.k === 'remove')).toEqual([])
      expect(JSON.parse(S.storage.getItem('pl.auth') as string)).toEqual(AUTH)
      S.dispose()
    }
  })
  it('停止后立刻重新开写：旧任务收尾不影响新任务的单飞登记', async () => {
    F = freshEngine({ storage: seed() })
    const p1 = F.engine.driveYq('w1')
    await F.clock.advance(1500)
    F.engine.stopYq('w1')
    const p2 = F.engine.driveYq('w1')
    expect(p2).not.toBe(p1)
    await F.clock.drain()
    expect(F.engine.isRunning('w1')).toBe(true)
    expect(F.engine.driveYq('w1')).toBe(p2)
    await settle(F, p2)
    expect(works(F)[0].gen!.status).toBe('done')
    expect(F.engine.isRunning('w1')).toBe(false)
  })
})

describe('yqChat（公开入口，给上架资料等用）', () => {
  it('与引擎共用依赖；signal 中止后以 WritingStopped 结束', async () => {
    F = freshEngine({ storage: { auth: AUTH }, server: () => () => sseReply('上架资料', { step: 1000 }) })
    let got: unknown
    F.engine.yqChat('m', '提示').then((v) => (got = v))
    await F.clock.run(() => got !== undefined)
    expect(got).toBe('上架资料')
    expect(JSON.parse((F.trace.of('fetch')[0].init as { body: string }).body).max_tokens).toBe(3000)
    const ac = new AbortController()
    let err: unknown
    F.engine.yqChat('m', '提示', 2500, { signal: ac.signal }).catch((e) => (err = e))
    await F.clock.advance(1500)
    ac.abort()
    await F.clock.run(() => err !== undefined)
    expect(err).toBeInstanceOf(WritingStopped)
    expect(isStopped(err)).toBe(true)
    expect((err as { retry?: boolean }).retry).toBeUndefined()
  })
})

describe('默认依赖与模块单例', () => {
  it('defaultDeps 接到 lib 层：fetch 以一个或两个参数调全局 fetch；存储读写 pl.*；后端地址取 window.TJ_API_BASE', async () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) })
    vi.stubGlobal('window', { TJ_API_BASE: 'https://api.example.test' })
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    const mod = await import('../../src/features/writing/index')
    const d = mod.defaultDeps()
    await d.fetch('/a')
    await d.fetch('/b', { method: 'POST' })
    expect(fetchMock.mock.calls).toEqual([['/a'], ['/b', { method: 'POST' }]])
    expect(d.apiBase()).toBe('https://api.example.test')
    d.storage.set('auth', AUTH as never)
    expect(mem.get('pl.auth')).toBe(JSON.stringify(AUTH))
    expect(d.storage.get('auth')).toEqual(AUTH)
    d.storage.remove('auth')
    expect(mem.has('pl.auth')).toBe(false)
    expect(typeof d.now()).toBe('number')
    let fired = false
    d.clearTimeout(d.setTimeout(() => (fired = true), 1))
    await new Promise((r) => setTimeout(r, 5))
    expect(fired).toBe(false)
    expect(mod.writing.startYq).toBe(mod.startYq)
    expect(mod.driveYq).toBe(mod.writing.driveYq)
    expect(Object.keys(mod.writing).sort()).toEqual(
      ['driveYq', 'enterWork', 'getState', 'isRunning', 'listingSources', 'redoEpisode', 'resumeWriting', 'retryWork', 'showDraft', 'startYq', 'stopAll', 'stopYq', 'subscribe', 'yqChat'],
    )
  })
})

describe('引擎核心不依赖框架与全局', () => {
  const CORE = ['engine.ts', 'episode.ts', 'request.ts', 'deps.ts']
  it.each(CORE)('%s 不 import React 与 lib 运行时，不读全局', (file) => {
    const src = readFileSync(path.join(SRC, file), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const m of code.matchAll(/^import\s+(type\s+)?[^'"]*from\s+'([^']+)'/gm)) {
      expect(m[2]).not.toBe('react')
      if (m[2].includes('/lib/')) expect(m[1]).toBe('type ')
    }
    expect(code).not.toMatch(/\b(document|window|localStorage|sessionStorage|globalThis|Date\.now|Math\.random|location)\b/)
    expect(code).not.toMatch(/(^|[^.\w])(fetch|setTimeout|clearTimeout|setInterval)\(/m)
  })
  it('index.ts 只做接线：默认依赖与单例', () => {
    const src = readFileSync(path.join(SRC, 'index.ts'), 'utf8')
    expect(src).not.toMatch(/from 'react'/)
    expect(src).toMatch(/export const writing = createWritingEngine\(defaultDeps\(\)\)/)
  })
})
