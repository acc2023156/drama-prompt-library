import { createElement as h, Fragment, StrictMode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadData } from './data'
import { installDom } from './dom-env'
import { type Tree, childrenTree, tree } from './dom-tree'
import { type LegacyPage, loadLegacyPage } from './result-legacy'
import { RecBlob, newCalls, patchWindow } from './result-stubs'

/**
 * P3-B 标准版结果页对照：旧 viewScriptResult 在 node:vm + 独立 jsdom 文档里实跑，
 * 与新 SimpleResultPage 的渲染 DOM 逐节点比较；交互后比较 DOM、localStorage 原文、提示条、
 * 下载与剪贴板内容、location.hash。随机数、时间、剪贴板、下载、confirm、滚动两边同样打桩。
 */

// 新页面所在的 DOM 全局：必须在导入 react-dom、testing-library、组件之前装好
installDom()
const data = loadData()
{
  // src/data.ts 在模块加载时读 #tj-data
  const s = document.createElement('script')
  s.id = 'tj-data'
  s.type = 'application/json'
  s.textContent = JSON.stringify(data)
  document.head.appendChild(s)
}
const { act, fireEvent, render, cleanup } = await import('@testing-library/react')
const { renderToStaticMarkup } = await import('react-dom/server')
const M = {
  page: await import('../../src/features/simple/result/SimpleResultPage'),
  sx: await import('../../src/domain/sx'),
  modal: await import('../../src/components/TextModal'),
  toast: await import('../../src/components/Toast'),
}

const NOW = 1_700_000_000_000
const RAND = [0.137, 0.862, 0.5, 0.0421, 0.9999, 0.31, 0.77, 0.2, 0.6543, 0.05, 0.9]

const calls = newCalls()
const blobs = new Map<string, RecBlob>()
let blobN = 0
let randN = 0
let confirmAnswer = true
let origCreate: unknown, origRevoke: unknown, origRandom: () => number, origNow: () => number

beforeAll(() => {
  patchWindow(window, calls, blobs)
  vi.stubGlobal('Blob', RecBlob)
  vi.stubGlobal('confirm', (m: string) => {
    calls.confirm.push(m)
    return confirmAnswer
  })
  origCreate = (URL as any).createObjectURL
  origRevoke = (URL as any).revokeObjectURL
  ;(URL as any).createObjectURL = (b: RecBlob) => {
    const u = `blob:new/${++blobN}`
    blobs.set(u, b)
    return u
  }
  ;(URL as any).revokeObjectURL = (u: string) => void calls.revoked.push(u)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void calls.clipboard.push(t) } })
  origRandom = Math.random
  origNow = Date.now
})
afterAll(() => {
  vi.unstubAllGlobals()
  ;(URL as any).createObjectURL = origCreate
  ;(URL as any).revokeObjectURL = origRevoke
  Math.random = origRandom
  Date.now = origNow
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  localStorage.clear()
  location.hash = ''
  document.body.className = ''
  Object.assign(calls, newCalls())
  randN = 0
  Math.random = () => RAND[randN++ % RAND.length]
  Date.now = () => NOW
  confirmAnswer = true
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------- 夹具 ----------
type G = 'male' | 'female'
function makeWork(g: G, ri: number, o: { seed?: number; kind?: string; title?: string; id?: string; idea?: string } = {}) {
  const role = data.roles[g][ri]
  const name = M.sx.SX_NAMES[g][ri % M.sx.SX_NAMES[g].length]
  const title = o.title ?? M.sx.SX_TITLES[g][ri % 5].replace('{n}', name)
  const id = o.id ?? `s${g}${ri}`
  const sx: any = { id, g, role, name, title, idea: o.idea ?? (ri % 2 ? '加一个反转' : ''), outline: M.sx.sxOutline(role, name, g) }
  if (o.seed !== undefined) sx.seed = o.seed
  const item: any = M.sx.sxBuildWork([], sx, NOW - 5000).item
  if (o.kind !== undefined) item.kind = o.kind
  return item
}
const store = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => ['pl.' + k, JSON.stringify(v)]))

/** 新旧两边各挂一份：同一份 localStorage 种子，各自渲染。 */
function mount(seed: Record<string, unknown>, id: string, fresh: boolean) {
  const raw = store(seed)
  const legacy = loadLegacyPage({ data, storage: raw, rand: RAND, now: NOW, confirmAnswer: undefined })
  legacy.setConfirm(confirmAnswer)
  legacy.render(id, fresh)
  for (const [k, v] of Object.entries(raw)) localStorage.setItem(k, v)
  randN = 0 // 新旧两边从同一随机序起点开始
  const r = render(h(Fragment, null, h(M.page.SimpleResultPage, { sid: id, fresh }), h(M.modal.TextModalHost), h(M.toast.Toast)))
  return { legacy, r, raw }
}

/** 新页面的结果区：去掉 TextModalHost 与 Toast，只剩页面自己渲染的部分。 */
function newView(r: ReturnType<typeof render>): Tree[] {
  const c = r.container
  const host = document.createElement('div')
  for (const n of Array.from(c.childNodes)) if (!(n instanceof HTMLElement && (n.classList.contains('modal') || n.id === 'toast'))) host.appendChild(n.cloneNode(true))
  return childrenTree(host)
}
const legacyView = (l: LegacyPage) => childrenTree(l.view())

/** 新页面的服务端渲染 HTML（React 写出的原始 style 字符串）解析成节点树，用 raw 模式与旧页面模板原文比较。 */
function ssrView(id: string, fresh: boolean): Tree[] {
  randN = 0
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(h(M.page.SimpleResultPage, { sid: id, fresh }))
  return childrenTree(host, { raw: true })
}

const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)))
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

/** 两边做同一个点击，然后比较 DOM。 */
async function both(l: LegacyPage, r: ReturnType<typeof render>, sel: string) {
  l.click(sel)
  const el = r.container.querySelector(sel) as HTMLElement
  expect(el, `新页面里找不到 ${sel}`).not.toBeNull()
  await act(async () => void fireEvent.click(el))
  await flush()
}
const sameView = (l: LegacyPage, r: ReturnType<typeof render>) => expect(newView(r)).toStrictEqual(legacyView(l))
const sameStore = (l: LegacyPage, keys = ['works', 'pro']) => {
  for (const k of keys) expect(localStorage.getItem('pl.' + k), 'pl.' + k).toBe(l.storage.getItem('pl.' + k))
}

// ---------- 初始渲染 ----------
describe('结果页初始渲染与旧 viewScriptResult 逐节点相等', () => {
  const cases: [string, G, number, number | undefined, boolean][] = []
  for (const g of ['male', 'female'] as G[])
    for (let ri = 0; ri < 10; ri++) {
      cases.push([`${g}[${ri}] fresh 无种子（大纲页）`, g, ri, undefined, true])
      cases.push([`${g}[${ri}] 非 fresh 有种子（台词页）`, g, ri, 100 + ri * 977, false])
    }
  it('覆盖男频 10 + 女频 10 个角色类型', () => {
    expect(data.roles.male).toHaveLength(10)
    expect(data.roles.female).toHaveLength(10)
    expect(new Set(cases.map((c) => c[1] + c[2])).size).toBe(20)
  })
  it.each(cases)('%s', (_n, g, ri, seed, fresh) => {
    const w = makeWork(g, ri, { seed })
    const { legacy, r } = mount({ works: [w] }, w.id, fresh)
    const a = newView(r)
    const b = legacyView(legacy)
    expect(a.length).toBe(3)
    expect(a).toStrictEqual(b)
    // 渲染本身不写存储
    sameStore(legacy)
    expect(localStorage.getItem('pl.works')).toBe(JSON.stringify([w]))
  })

  const w0 = makeWork('female', 3)
  const extra: [string, Record<string, unknown>, string, boolean][] = [
    ['fresh + 已有种子（台词页带撒花）', { works: [makeWork('male', 2, { seed: 555 })] }, 'smale2', true],
    ['非 fresh 无种子', { works: [w0] }, w0.id, false],
    ['标准版（pro=false）返回链接指向 #/', { works: [w0], pro: false }, w0.id, false],
    ['PRO 开（pro=true）返回链接指向 #/script', { works: [w0], pro: true }, w0.id, false],
    ['kind 不是 simple 的作品（有 sx）返回 #/script', { works: [makeWork('male', 1, { kind: 'vibe' })], pro: false }, 'smale1', false],
    ['标题含 & < > " 与特殊字符', { works: [makeWork('male', 0, { title: '<b>&"剧"</b>' })], pro: false }, 'smale0', true],
    ['点子为空与非空都不影响页面', { works: [makeWork('female', 0, { idea: '' }), makeWork('female', 1, { idea: 'x' })] }, 'sfemale1', false],
    ['种子为 0 视为没有种子', { works: [makeWork('male', 4, { seed: 0 })] }, 'smale4', false],
    ['同时有多个作品，取 id 匹配的那个', { works: [makeWork('male', 0), makeWork('female', 5, { seed: 9 }), makeWork('male', 6)] }, 'sfemale5', false],
  ]
  it.each(extra)('%s', (_n, seed, id, fresh) => {
    const { legacy, r } = mount(seed, id, fresh)
    expect(newView(r)).toStrictEqual(legacyView(legacy))
  })

  it('React 服务端渲染的原始 HTML 与旧页面原文逐字符一致（style 数值、颜色写法不经 CSSOM）', () => {
    const picks: [G, number, number | undefined, boolean][] = [['male', 0, undefined, true], ['female', 3, 4242, true], ['male', 9, 77, false], ['female', 9, undefined, false]]
    for (const [g, ri, seed, fresh] of picks) {
      const w = makeWork(g, ri, { seed })
      const { legacy, r } = mount({ works: [w] }, w.id, fresh)
      const a = ssrView(w.id, fresh)
      const b = childrenTree(legacy.view(), { raw: true })
      expect(a).toStrictEqual(b)
      r.unmount()
    }
  })

  it('作品不存在：旧页面的空状态', () => {
    const { legacy, r } = mount({ works: [w0] }, 'snone', false)
    expect(legacy.view().innerHTML).toBe('<div class="empty">找不到这部剧本，可能已在别的浏览器里。</div>')
    expect(newView(r)).toStrictEqual(legacyView(legacy))
  })
  it('没有 works 键：空状态', () => {
    const { legacy, r } = mount({}, 'snone', true)
    expect(newView(r)).toStrictEqual(legacyView(legacy))
  })
  it('works 为 null（旧 store(null) 写出的字符串 null）：空状态', () => {
    const { legacy, r } = mount({ works: null }, 'snone', true)
    expect(newView(r)).toStrictEqual(legacyView(legacy))
  })

  it('撒花：60 片，left、animation-delay 依次取随机序（先 left 后 delay），颜色循环 6 色（服务端渲染原文）', () => {
    const w = makeWork('male', 0)
    localStorage.setItem('pl.works', JSON.stringify([w]))
    randN = 0
    const html = renderToStaticMarkup(h(M.page.SimpleResultPage, { sid: w.id, fresh: true }))
    const colors = ['#731dfb', '#3fb6ff', '#ffd23f', '#3ddc97', '#ff5d6c', '#ffffff']
    const pieces = [...html.matchAll(/<i style="([^"]*)"><\/i>/g)].map((m) => m[1])
    expect(pieces).toHaveLength(60)
    pieces.forEach((p, i) => {
      expect(p).toBe(`left:${RAND[(2 * i) % RAND.length] * 100}%;background:${colors[i % 6]};animation-delay:${RAND[(2 * i + 1) % RAND.length] * 0.6}s`)
    })
    expect(randN).toBe(120)
  })
  it('非 fresh 没有撒花，也没有 confetti 节点；徽章文字不同', () => {
    const w = makeWork('male', 0)
    const { r } = mount({ works: [w] }, w.id, false)
    expect(r.container.querySelector('.confetti')).toBeNull()
    expect(r.container.querySelector('.badge')!.textContent).toBe('我的剧本')
    r.unmount()
    const m2 = mount({ works: [w] }, w.id, true)
    expect(m2.r.container.querySelector('.badge')!.textContent).toBe('剧本大纲完成！')
  })
  it('头像底色：按角色在频道里的位置取色（取模 10），不在列表里回落 #4a5d78', () => {
    const w = makeWork('female', 7)
    const { legacy, r } = mount({ works: [w] }, w.id, false)
    expect(newView(r)).toStrictEqual(legacyView(legacy))
    expect(legacy.view().querySelector('.av')!.getAttribute('style')).toBe('background:linear-gradient(160deg,#4f5f8a,#1a1a1d)')
    expect(ssrView(w.id, false)).toStrictEqual(childrenTree(legacy.view(), { raw: true }))
    const w2 = { ...makeWork('female', 7), sx: { ...makeWork('female', 7).sx, role: { ...data.roles.female[7], type: '不存在的类型' } } }
    r.unmount()
    const m2 = mount({ works: [w2] }, w2.id, false)
    expect(m2.legacy.view().querySelector('.av')!.getAttribute('style')).toBe('background:linear-gradient(160deg,#4a5d78,#1a1a1d)')
    expect(ssrView(w2.id, false)).toStrictEqual(childrenTree(m2.legacy.view(), { raw: true }))
    expect(newView(m2.r)).toStrictEqual(legacyView(m2.legacy))
  })
})

// ---------- 比较方法本身有效：人为改动必须被发现 ----------
describe('变异检验：对旧页面 DOM 的任何一处改动都能被逐节点比较发现', () => {
  const w = makeWork('male', 0, { seed: 77 })
  const mutate: [string, (root: HTMLElement) => void][] = [
    ['改一个字', (v) => void (v.querySelector('h3')!.textContent += '！')],
    ['删一个属性', (v) => v.querySelector('#redo')!.removeAttribute('id')],
    ['改 href', (v) => v.querySelector('#resBack')!.setAttribute('href', '#/x')],
    ['改内联样式', (v) => ((v.querySelector('.av') as HTMLElement).style.background = 'red')],
    ['改类名', (v) => v.querySelector('.ep')!.classList.add('x')],
    ['删一个节点', (v) => v.querySelector('.kv span')!.remove()],
    ['改台词高亮标签', (v) => v.querySelector('.scr pre span')!.setAttribute('class', 'z')],
    ['改图标', (v) => void (v.querySelector('svg path')!.setAttribute('d', 'M0 0'))],
    ['交换两个节点顺序', (v) => v.querySelector('.rtabs')!.prepend(v.querySelector('#redo')!)],
  ]
  it.each(mutate)('%s', (_n, fn) => {
    const { legacy, r } = mount({ works: [w] }, w.id, false)
    expect(newView(r)).toStrictEqual(legacyView(legacy))
    fn(legacy.view())
    expect(newView(r)).not.toStrictEqual(legacyView(legacy))
  })
})

// ---------- 交互 ----------
describe('交互：新旧两边做同一操作，DOM 与 localStorage 原文逐字节相等', () => {
  it('无种子 fresh：切到完整台词 → 写入种子；再切回大纲 → 不再写', async () => {
    const w = makeWork('male', 0)
    const { legacy, r } = mount({ works: [w] }, w.id, true)
    await both(legacy, r, '#rtab [data-t="script"]')
    sameView(legacy, r)
    sameStore(legacy)
    // 防止两边都没响应点击而“相等”：旧页面确实切到了台词页，新页面也是
    expect(legacy.view().querySelector('#rtab .on')!.getAttribute('data-t')).toBe('script')
    expect(r.container.querySelector('#rtab .on')!.getAttribute('data-t')).toBe('script')
    const written = JSON.parse(localStorage.getItem('pl.works')!)
    expect(written[0].sx.seed).toBe(Math.floor(RAND[120 % RAND.length] * 1e9) + 1) // fresh 渲染撒花先取走 120 个随机数
    expect(written[0].time).toBe(NOW)
    expect(written[0].kind).toBe('simple')
    const afterFirst = localStorage.getItem('pl.works')
    await both(legacy, r, '#rtab [data-t="outline"]')
    sameView(legacy, r)
    expect(localStorage.getItem('pl.works')).toBe(afterFirst)
    sameStore(legacy)
    await both(legacy, r, '#rtab [data-t="script"]') // 已有种子：不再取随机数
    sameView(legacy, r)
    expect(localStorage.getItem('pl.works')).toBe(afterFirst)
  })

  it('“完整台词”大按钮：写种子、切台词页、滚动到结果区；台词页上该按钮隐藏', async () => {
    const w = makeWork('female', 2)
    const { legacy, r } = mount({ works: [w] }, w.id, false)
    await both(legacy, r, '#toScript')
    sameView(legacy, r)
    sameStore(legacy)
    expect(calls.scroll).toStrictEqual([{ id: 'rbody', arg: { behavior: 'smooth', block: 'start' } }])
    expect(JSON.parse(JSON.stringify(legacy.calls.scroll))).toStrictEqual(calls.scroll) // 旧页面沙箱里建的对象原型不同，经 JSON 比较内容
    expect((r.container.querySelector('#toScript') as HTMLElement).style.display).toBe('none')
    expect(r.container.querySelector('#nxH')!.textContent).toBe('10 集完整台词已生成')
  })

  it('重写：每次换种子并写回，提示条“已重写一版台词”，重写两次种子不同', async () => {
    const w = makeWork('male', 3, { seed: 12345 })
    const { legacy, r } = mount({ works: [w] }, w.id, false)
    const seeds: number[] = []
    for (let i = 0; i < 3; i++) {
      await both(legacy, r, '#redo')
      sameView(legacy, r)
      sameStore(legacy)
      seeds.push(JSON.parse(localStorage.getItem('pl.works')!)[0].sx.seed)
      expect(r.container.querySelector('#toast')!.textContent).toBe('已重写一版台词')
      expect(r.container.querySelector('#toast')!.className).toBe(legacy.toast().className)
      expect(legacy.toast().textContent).toBe('已重写一版台词')
    }
    expect(new Set(seeds).size).toBe(3)
    // 重写后台词页的每集条目带错开的动画延迟 i*0.07s
    const eps = Array.from(r.container.querySelectorAll('.scr .ep')) as HTMLElement[]
    expect(eps).toHaveLength(10)
    expect(parseFloat(eps[3].style.animationDelay)).toBeCloseTo(3 * 0.07, 10)
    expect(eps[0].style.animationDelay).toBe('0s')
    // 提示条 1.4 秒后收起
    await advance(1400)
    expect(r.container.querySelector('#toast')!.className).toBe(legacy.toast().className)
    expect(r.container.querySelector('#toast')!.className).toBe('toast')
  })

  it('重写后再点切到大纲：条目动画延迟归零，之后再点台词不重写', async () => {
    const w = makeWork('male', 3, { seed: 5 })
    const { legacy, r } = mount({ works: [w] }, w.id, false)
    await both(legacy, r, '#redo')
    await both(legacy, r, '#rtab [data-t="outline"]')
    sameView(legacy, r)
    expect((r.container.querySelectorAll('.eps .ep')[4] as HTMLElement).style.animationDelay).toBe('0s')
    const before = localStorage.getItem('pl.works')
    await both(legacy, r, '#rtab [data-t="script"]')
    sameView(legacy, r)
    expect(localStorage.getItem('pl.works')).toBe(before)
    sameStore(legacy)
  })

  it('重写会重新挂载条目（旧页面 innerHTML 重画，CSS 动画重播）', async () => {
    const w = makeWork('male', 3, { seed: 5 })
    const { r } = mount({ works: [w] }, w.id, false)
    const first = r.container.querySelector('.scr .ep')
    await act(async () => void fireEvent.click(r.container.querySelector('#redo')!))
    expect(r.container.querySelector('.scr .ep')).not.toBe(first)
    const outline = r.container.querySelector('#rtab [data-t="outline"]')!
    await act(async () => void fireEvent.click(outline))
    const o1 = r.container.querySelector('.eps .ep')
    await act(async () => void fireEvent.click(outline)) // 点当前页签也重画
    expect(r.container.querySelector('.eps .ep')).not.toBe(o1)
  })

  it('复制全部：剪贴板文本相等，提示条，按钮 1.3 秒内显示“已复制”后还原', async () => {
    const w = makeWork('female', 4, { seed: 31337 })
    const { legacy, r } = mount({ works: [w] }, w.id, false)
    await both(legacy, r, '#scCopy')
    expect(calls.clipboard).toStrictEqual(legacy.calls.clipboard)
    expect(calls.clipboard).toStrictEqual([M.sx.sxScriptText(w.sx)])
    expect(r.container.querySelector('#toast')!.textContent).toBe('已复制到剪贴板')
    expect(legacy.toast().textContent).toBe('已复制到剪贴板')
    sameView(legacy, r) // 含 done 状态
    expect(r.container.querySelector('#scCopy')!.className).toBe('btn-o done')
    await advance(1299) // 1.3 秒之前两边都还是“已复制”
    sameView(legacy, r)
    expect(r.container.querySelector('#scCopy')!.className).toBe('btn-o done')
    await advance(1)
    sameView(legacy, r)
    expect(r.container.querySelector('#scCopy')!.className).toBe('btn-o')
  })

  it('下载 .txt：文件名、BOM、正文与类型逐字相等，1 秒后释放地址', async () => {
    const w = makeWork('male', 5, { seed: 88, title: '含 空格 的 标题' })
    const { legacy, r } = mount({ works: [w] }, w.id, false)
    await both(legacy, r, '#scDl')
    // 地址前缀不同（blob:new / blob:legacy），其余字段逐项相等
    const strip = (c: typeof calls) => c.downloads.map(({ download, text, type }) => ({ download, text, type }))
    expect(strip(calls)).toStrictEqual(strip(legacy.calls))
    expect(calls.downloads).toHaveLength(1)
    const a = calls.downloads[0]
    expect(a.download).toBe('含 空格 的 标题-10集完整台词.txt')
    expect(a.text).toBe('\uFEFF' + M.sx.sxScriptText(w.sx))
    expect(a.text.startsWith('\uFEFF《含 空格 的 标题》10 集完整台词\n主角：')).toBe(true)
    expect(a.type).toBe('text/plain;charset=utf-8')
    expect(calls.revoked).toHaveLength(0)
    expect(legacy.calls.revoked).toHaveLength(0)
    await advance(1000)
    expect(calls.revoked).toStrictEqual([a.href])
    expect(legacy.calls.revoked).toStrictEqual([legacy.calls.downloads[0].href])
  })

  it('AI 精写提示词弹窗：与旧 showModal 的 DOM 相等，点遮罩与“关闭”都能关', async () => {
    const w = makeWork('female', 6, { seed: 3 })
    const { legacy, r } = mount({ works: [w] }, w.id, false)
    await both(legacy, r, '#seePrompt')
    const lm = legacy.modals()
    expect(lm).toHaveLength(1)
    const nm = r.container.querySelector('.modal') as HTMLElement
    expect(nm).not.toBeNull()
    const lt = tree(lm[0])
    const nt = tree(nm)
    expect(nt).toStrictEqual(lt)
    expect(nm.querySelector('h3')!.textContent).toBe(`《${w.sx.title}》10 集剧本提示词`)
    expect(nm.querySelector('pre')!.textContent).toContain('【固定规格】共 10 集')
    // 点遮罩关闭
    await act(async () => void fireEvent.click(nm))
    expect(r.container.querySelector('.modal')).toBeNull()
    // 再开，点“关闭”
    await both(legacy, r, '#seePrompt')
    const close = Array.from(r.container.querySelectorAll('.modal .mf button')).find((b) => b.textContent === '关闭')!
    await act(async () => void fireEvent.click(close))
    expect(r.container.querySelector('.modal')).toBeNull()
  })

  it('弹窗里“下载 .txt”文件名为 <剧名>-10集剧本提示词.txt', async () => {
    const w = makeWork('male', 7)
    const { r } = mount({ works: [w] }, w.id, false)
    await act(async () => void fireEvent.click(r.container.querySelector('#seePrompt')!))
    const dl = Array.from(r.container.querySelectorAll('.modal .mf button')).find((b) => b.textContent?.includes('下载'))!
    await act(async () => void fireEvent.click(dl))
    expect(calls.downloads.at(-1)!.download).toBe(`${w.sx.title}-10集剧本提示词.txt`)
  })

  it('到 PRO 版细修：pl.pro 写 true，hash 跳 #/script/w/<id>', async () => {
    const w = makeWork('male', 8)
    const { legacy, r } = mount({ works: [w], pro: false }, w.id, false)
    await both(legacy, r, '#toPro')
    expect(localStorage.getItem('pl.pro')).toBe('true')
    expect(localStorage.getItem('pl.pro')).toBe(legacy.storage.getItem('pl.pro'))
    expect(location.hash).toBe(legacy.location.hash)
    expect(location.hash).toBe('#/script/w/' + w.id)
    // 作品列表原样没动
    expect(localStorage.getItem('pl.works')).toBe(legacy.storage.getItem('pl.works'))
  })

  it('删除：confirm 取消不动；确认后从 works 删掉（不进回收站），hash 回 #/script', async () => {
    const keep = makeWork('female', 0, { seed: 9 })
    const del = makeWork('male', 9)
    const { legacy, r } = mount({ works: [keep, del] }, del.id, false)
    confirmAnswer = false
    legacy.setConfirm(false)
    const before = localStorage.getItem('pl.works')
    await both(legacy, r, '#delWork')
    expect(calls.confirm).toStrictEqual(['删除这部剧本？'])
    expect(calls.confirm).toStrictEqual(legacy.calls.confirm)
    expect(localStorage.getItem('pl.works')).toBe(before)
    expect(location.hash).toBe('')
    sameStore(legacy)

    confirmAnswer = true
    legacy.setConfirm(true)
    await both(legacy, r, '#delWork')
    expect(localStorage.getItem('pl.works')).toBe(legacy.storage.getItem('pl.works'))
    expect(JSON.parse(localStorage.getItem('pl.works')!)).toStrictEqual([keep])
    expect(location.hash).toBe('#/script')
    expect(legacy.location.hash).toBe('#/script')
  })

  it('删除的是 works 里最后一个：写出空数组 []', async () => {
    const only = makeWork('male', 9)
    const { legacy, r } = mount({ works: [only] }, only.id, false)
    await both(legacy, r, '#delWork')
    expect(localStorage.getItem('pl.works')).toBe('[]')
    expect(legacy.storage.getItem('pl.works')).toBe('[]')
  })

  it('写作品时读取的是写入瞬间的最新 works：别处新增的作品不被覆盖丢失', async () => {
    const w = makeWork('male', 0)
    const other = makeWork('female', 1, { id: 'sother' })
    const { legacy, r } = mount({ works: [w] }, w.id, false)
    // 页面打开后，另一处（如云同步）写入了新作品
    const next = JSON.stringify([other, w])
    localStorage.setItem('pl.works', next)
    legacy.storage.setItem('pl.works', next)
    await both(legacy, r, '#redo')
    sameStore(legacy)
    expect(JSON.parse(localStorage.getItem('pl.works')!).map((x: any) => x.id)).toStrictEqual(['sother', 'smale0'])
  })

  it('StrictMode（应用入口在用）下重写只写一次 works，种子合法', async () => {
    const w = makeWork('male', 3, { seed: 5 })
    localStorage.setItem('pl.works', JSON.stringify([w]))
    const writes: string[] = []
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'pl.works') writes.push(v)
      return orig.call(this, k, v)
    }
    try {
      const r = render(h(StrictMode, null, h(M.page.SimpleResultPage, { sid: w.id, fresh: false })))
      await act(async () => void fireEvent.click(r.container.querySelector('#redo')!))
      expect(writes).toHaveLength(1)
      const saved = JSON.parse(writes[0])
      expect(saved).toHaveLength(1)
      expect(Number.isInteger(saved[0].sx.seed) && saved[0].sx.seed >= 1 && saved[0].sx.seed <= 1e9).toBe(true)
      expect(r.container.querySelectorAll('.scr .ep')).toHaveLength(10)
    } finally {
      Storage.prototype.setItem = orig
    }
  })

  it('静态链接：返回、再来一部、伙伴计划', () => {
    const w = makeWork('male', 0)
    const { r } = mount({ works: [w], pro: false }, w.id, false)
    const hrefs = Array.from(r.container.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')])
    expect(hrefs).toStrictEqual([['返回', '#/'], ['再来一部', '#/script'], ['AI短剧伙伴计划', '#/partner']])
  })

  it('换 sid 重新挂载：显示新作品并重置页内状态', async () => {
    const a = makeWork('male', 0, { seed: 1 })
    const b = makeWork('female', 1)
    localStorage.setItem('pl.works', JSON.stringify([a, b]))
    const r = render(h(M.page.SimpleResultPage, { sid: a.id, fresh: false }))
    expect(r.container.querySelector('h1')!.textContent).toBe(`《${a.sx.title}》`)
    expect(r.container.querySelector('#rtab .on')!.getAttribute('data-t')).toBe('script')
    r.rerender(h(M.page.SimpleResultPage, { sid: b.id, fresh: false }))
    expect(r.container.querySelector('h1')!.textContent).toBe(`《${b.sx.title}》`)
    expect(r.container.querySelector('#rtab .on')!.getAttribute('data-t')).toBe('outline')
  })

  it('作品存在但没有 sx：显示找不到（旧页面此处抛异常，站内链接不会走到）', () => {
    localStorage.setItem('pl.works', JSON.stringify([{ id: 'wform', title: '五步表单作品', W: {} }]))
    const r = render(h(M.page.SimpleResultPage, { sid: 'wform', fresh: false }))
    expect(r.container.querySelector('.empty')!.textContent).toBe('找不到这部剧本，可能已在别的浏览器里。')
  })
})
