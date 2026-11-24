import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWritingEngine, type WritingEngine, type WritingState } from '../../src/features/writing'
import { WorkPage } from '../../src/features/work/WorkPage'
import { exportFiles } from '../../src/features/work/export'
import { vibeData } from '../../src/domain/vibe'
import { WZ_DEF } from '../../src/domain/wz'
import { getNavOverride } from '../../src/lib/nav'
import { get, remove, set } from '../../src/lib/storage'
import { AUTH, allEps, baseW, genData, NOW, seedOf, WID, work, yqGen } from '../parity/work-harness'

/** 作品页组件测试：StrictMode 不重复开写、写作刷新重新进入、卸载不停止、等待页秒表、弹层与滚动、导出清单。写作引擎打桩。 */

const H = vi.hoisted(() => ({ eng: null as unknown as WritingEngine, calls: [] as unknown[][], yq: 0 }))
vi.mock('../../src/features/writing', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/features/writing')>()
  const rec = (name: 'enterWork' | 'redoEpisode' | 'resumeWriting' | 'retryWork' | 'showDraft' | 'stopYq') => (...a: unknown[]) => {
    H.calls.push([name, ...a])
    return (H.eng[name] as (...x: unknown[]) => unknown)(...a)
  }
  return {
    ...real,
    enterWork: rec('enterWork'), redoEpisode: rec('redoEpisode'), resumeWriting: rec('resumeWriting'), retryWork: rec('retryWork'), showDraft: rec('showDraft'), stopYq: rec('stopYq'),
    getState: (wid: string) => H.eng.getState(wid),
    subscribe: (wid: string, fn: () => void) => H.eng.subscribe(wid, fn),
  }
})

const realEngine = () =>
  createWritingEngine({
    fetch: () => {
      H.yq++
      return new Promise(() => {})
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () => NOW,
    storage: { get, set, remove } as never,
    apiBase: () => '',
    openLogin: () => {},
    toast: () => {},
  })

const seed = (local: Record<string, string>) => {
  localStorage.clear()
  for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v)
}
const W = baseW()
const flush = () => act(async () => {})

beforeEach(() => {
  H.calls = []
  H.yq = 0
  H.eng = realEngine()
  location.hash = `#/script/v/${WID}`
})
afterEach(() => {
  H.eng.stopAll()
  vi.useRealTimers()
  localStorage.clear()
})

describe('WorkPage', () => {
  it('StrictMode 下重复挂载只开写一次', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    seed(seedOf([work()], { auth: AUTH }))
    render(
      <StrictMode>
        <WorkPage wid={WID} />
      </StrictMode>,
    )
    await flush()
    expect(H.calls.filter((c) => c[0] === 'enterWork').length).toBeGreaterThanOrEqual(2)
    expect(H.yq).toBe(1)
    expect(get('works')![0].gen).toMatchObject({ status: 'outline', at: NOW })
    expect(screen.getByText('AI 正在排大纲')).toBeInTheDocument()
  })

  it('卸载不调用 stopYq，重新挂载接着写', async () => {
    seed(seedOf([work({ gen: yqGen(W, { data: genData([allEps()[0], null, null]) }) })], { auth: AUTH }))
    const a = render(<WorkPage wid={WID} />)
    await flush()
    a.unmount()
    expect(H.calls).toEqual([['enterWork', WID]])
    expect(H.eng.isRunning(WID)).toBe(true)
    render(<WorkPage wid={WID} />)
    await flush()
    expect(H.calls).toEqual([['enterWork', WID], ['enterWork', WID]])
    expect(H.yq).toBe(1)
  })

  it('写作引擎刷新（旧 yqRefresh）时按地址里的分页重新进入：等待页 → 作品页', async () => {
    let st: WritingState = { running: true, refresh: 0 }
    const subs = new Set<() => void>()
    const fake = {
      enterWork: () => ((get('works') || [])[0].gen!.status === 'outline' ? 'wait' : 'ready'),
      getState: () => st,
      subscribe: (_: string, fn: () => void) => (subs.add(fn), () => subs.delete(fn)),
      stopAll: () => {},
    }
    H.eng = fake as unknown as WritingEngine
    seed(seedOf([work({ gen: yqGen(W, { status: 'outline' }) })], { auth: AUTH }))
    location.hash = `#/script/v/${WID}/board`
    render(<WorkPage wid={WID} vtab="board" />)
    await flush()
    expect(screen.getByText('AI 正在排大纲')).toBeInTheDocument()
    // 引擎写好大纲、改了状态，再刷新
    set('works', [work({ gen: yqGen(W, { status: 'writing', data: genData([null, null, null]) }) })])
    st = { running: true, refresh: 1 }
    act(() => subs.forEach((fn) => fn()))
    await flush()
    expect(H.calls).toEqual([['enterWork', WID], ['enterWork', WID]])
    expect(document.querySelector('[data-t="board"]')).toHaveClass('on')
    expect(screen.getByText('正在写第 1 / 3 集')).toBeInTheDocument()
    // 只有 running 变化、refresh 不变时不重新进入
    st = { running: false, refresh: 1 }
    act(() => subs.forEach((fn) => fn()))
    await flush()
    expect(H.calls.length).toBe(2)
  })

  it('等待页秒表每秒更新（距 gen.at）', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(NOW)
    seed(seedOf([work({ gen: yqGen(W, { status: 'outline' }) })], { auth: AUTH }))
    render(<WorkPage wid={WID} />)
    await flush()
    expect(document.getElementById('gwT')).toHaveTextContent('00:00')
    act(() => vi.advanceTimersByTime(1000))
    expect(document.getElementById('gwT')).toHaveTextContent('01:06')
  })

  it('分页切换写 pl.vibeTab、改地址不重画、侧栏进入作品上下文', async () => {
    seed(seedOf([work({ gen: yqGen(W, { status: 'done', data: genData(allEps()) }) })]))
    render(<WorkPage wid={WID} />)
    await flush()
    expect(getNavOverride()).toEqual({ view: 'tool', tool: 'script', sub: 'vibe', wid: WID, vibe: { id: WID, title: '读心千金', tab: 'outline' } })
    fireEvent.click(screen.getByText('分镜图'))
    await flush()
    expect(localStorage.getItem('pl.vibeTab')).toBe('"board"')
    expect(location.hash).toBe(`#/script/v/${WID}/board`)
    expect(getNavOverride()).toMatchObject({ tool: 'storyboard', vibe: { tab: 'board' } })
    expect(document.getElementById('vtAI')).toHaveStyle({ display: 'none' })
  })

  it('“剧情对话”跳到那一集并滚动；弹层 Esc 关闭并恢复页面滚动', async () => {
    const seen: string[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      seen.push(this.id)
    }
    seed(seedOf([work({ gen: yqGen(W, { status: 'done', data: genData(allEps()) }) })]))
    render(<WorkPage wid={WID} />)
    await flush()
    fireEvent.click(document.querySelector('[data-sc="2"]')!)
    expect(seen).toEqual(['ep2'])
    expect(document.querySelector('[data-t="script"]')).toHaveClass('on')
    fireEvent.click(screen.getByText('分镜图'))
    fireEvent.click(document.querySelector('[data-pv="1"]')!)
    expect(document.querySelector('.vm .vm-seg')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.vm')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('导出清单：上架资料在最前，每集三个文件', () => {
    const w = work({ gen: yqGen(W, { status: 'done', data: genData(allEps()) }), listing: { at: NOW, data: { titles: [{ t: 'a' }], oneLine: '', intro: 'b', tags: { evergreen: [], timely: [] }, keywords: { short: [], long: [] } } } })
    const { s, eps } = vibeData(w)
    const x = exportFiles(w, s, Object.assign({}, WZ_DEF, w.W), eps, new Date(NOW))
    expect(x.files.map((f) => f.name)).toEqual([
      '上架资料.txt', 'project.json', 'XTASY/manifest.json', 'XTASY/导入说明.txt', '资产/资产清单.json',
      '剧本/第01集-大纲.txt', '剧本/第01集-剧情对话.txt', '分镜/第01集.json',
      '剧本/第02集-大纲.txt', '剧本/第02集-剧情对话.txt', '分镜/第02集.json',
      '剧本/第03集-大纲.txt', '剧本/第03集-剧情对话.txt', '分镜/第03集.json',
    ])
    expect(JSON.parse(x.files[1].text).exportedAt).toBe(new Date(NOW).toISOString())
  })
})
