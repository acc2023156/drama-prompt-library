import { act, render } from '@testing-library/react'
import { Account } from '../../src/app/Account'
import { closeModal, TextModalHost } from '../../src/components/TextModal'
import { genReq } from '../../src/domain/gen'
import type { Gen, GenData, Work, WzSettings } from '../../src/domain/types'
import { WorkPage } from '../../src/features/work/WorkPage'
import { getNavOverride, setNavRoute } from '../../src/lib/nav'
import { getToast, subscribeToast } from '../../src/lib/toast'
import { isAccountOpen, setAccount } from '../../src/lib/ui'
import { loadData } from './data'
import { type FetchCall, type FetchRoutes, loadLegacyPage, makeFetch, settle } from './legacy-page'

/**
 * 作品页（旧 viewVibeScript）新旧行为对照的公共部分：种子作品、两边的桩与“关键可观察结果”的快照。
 * 写作引擎两边都打桩：旧页面替换全局 yqDrive / yqChat / listingSources（startYq 保留原函数并记录），
 * 新组件那边由测试文件 vi.mock 写作引擎模块（见 work.test.tsx）。
 */

export const NOW = Date.UTC(2027, 0, 15, 4, 0, 0)
export const WID = 'wk1'
export const RAND = [0.42, 0.137, 0.9, 0.31, 0.77, 0.05]

export const baseW = (over: Partial<WzSettings> = {}): Partial<WzSettings> => ({
  mode: 'auto', title: '', aud: '女性向', pair: '男女', genre: '都市', pitch: '被退婚的千金靠读心系统翻盘', hooks: ['逆袭'], eps: 3, mins: 1,
  ratio: '9:16', style: '无', depth: '轻度', heat: '正常', ai: 'Claude', core: '读心每天只能用三次', ...over,
})

const EP = [
  '# 第1集 退婚\n场景：夜内 · 宴会厅 · 夜\n出场人物：苏晚、陆沉\n苏晚：“你说什么？”\n△ 她放下酒杯\n1-1 近景／宴会厅／苏晚、陆沉\n陆沉：“婚约取消。”',
  '## 场 1｜咖啡馆（白天）\n出场人物：苏晚\n苏晚：“我听得见你在想什么。”\n音乐提示：低音',
  '## 场 1｜董事会\n## 场 2｜天台\n陆沉：“你赢了。”\n【字幕】三个月后',
]

export function genData(eps: (string | null)[], over: Partial<GenData> = {}): GenData {
  return {
    title: '读心千金', logline: '被退婚的千金听得见人心',
    outline: [
      { title: '退婚', event: '当众退婚', hook: '读心觉醒', body: '当众退婚\n\n钩子：读心觉醒' },
      { title: '交易', event: '与总裁谈条件', hook: '', body: '与总裁谈条件' },
      { title: '翻盘', event: '董事会翻盘', hook: '天台告白', body: '董事会翻盘\n\n钩子：天台告白' },
    ],
    eps, fixed: [0, 2, 0],
    cast: [{ name: '苏晚', role: '女主·千金', bio: '24 岁，被退婚的千金', look: '白裙' }, { name: '陆沉', role: '男主 总裁', bio: '冷面总裁', look: '' }, { name: '许曼', role: '女配', bio: '闺蜜', look: '' }],
    card: null,
    ...over,
  }
}
export const allEps = () => [...EP]
export const CARD = { mystery: '谁才是真千金', rules: { power: '董事会', stakes: '三成股权', evidence: '一段录音' }, cast: [{ name: '苏晚', role: '女主', age: 24, look: '白裙', want: '翻盘', flaw: '心软', voice: '说话慢' }] }

export function work(over: Partial<Work> = {}, W = baseW()): Work {
  return { id: WID, title: '读心千金', kind: 'vibe', W, time: NOW - 1000, vname: '苏晚', seed: 77, ...over }
}
export const yqGen = (W: Partial<WzSettings>, over: Partial<Gen>): Gen => ({ engine: 'yq', status: 'writing', at: NOW - 65000, req: genReq(W), data: null, err: null, ...over })

export const AUTH = { token: 'tk', user: { uid: 'u1', phone: '13800138000', role: 'free', points: 20 } }
export const seedOf = (works: Work[], extra: Record<string, unknown> = {}): Record<string, string> => {
  const o: Record<string, string> = { 'pl.works': JSON.stringify(works) }
  for (const [k, v] of Object.entries(extra)) o['pl.' + k] = JSON.stringify(v)
  return o
}

export const routes: FetchRoutes = (path, init) => {
  if (path === '/auth/login') return { body: { token: 'tk', user: AUTH.user } }
  if (path === '/works' && (!init || !init.method || init.method === 'GET')) return { body: { works: [] } }
  if (path.startsWith('/jobs/')) return { body: { status: 'done', result: { x_gateway: { framework: { title: '旧版作业', episodes: [{ title: '甲', event: '事件甲', hook: '钩甲' }, { title: '乙', event: '事件乙' }] }, episodes: [{ ep: 1, text: '苏晚：“旧版第一集”' }], cards: '**苏晚（女主）**\n千金' } } } }
  return { body: {} }
}

/* ---------- 步骤与快照 ---------- */

export type Sel = string | { legacy: string; react: string }
export type Step =
  | { click: Sel; nth?: number; nav?: boolean; doc?: boolean }
  | { type: string; value: string }
  | { submit: string }
  | { wait: number }
  | { release: true }
  /** 站内跳到别的页面再回来（旧页面重新 route；新组件卸载后重新挂载）。 */
  | { away: string }

/** 上架资料桩：listingSources 要等 release 步骤才返回，便于看到“正在生成…”的中间状态。 */
export interface ListingStub {
  gate?: boolean
  src: { words: string[]; topics: string[]; at: string }
  reply?: string
  error?: string
}

export interface Snap {
  dom: Record<string, string[]> | null
  text: string | null
  local: Record<string, string>
  hash: string
  toasts: string[]
  clip: string[]
  downloads: { name: string; bytes: string }[]
  opens: unknown[][]
  nav: unknown
  driving: boolean
  account: boolean
  overlay: { modal: string | null; vm: string | null }
  reqs: FetchCall[]
  /** 写作引擎入口（旧：yqChat / listingSources 的调用与参数；新：同名桩） */
  chat: unknown[][]
}
export interface Run {
  frames: Snap[]
  errors: string[]
  /** 旧页面调用 yqDrive 的次数（新组件一侧不适用，为 0） */
  drives: number
}

const norm = (s: string | null | undefined) => (s || '').replace(/\s+/g, '')
const normStyle = (s: string | null) => (s || '').split(';').map((x) => x.trim().replace(/\s*:\s*/, ':')).filter(Boolean).join(';')

/** 关键可观察结果：各区块的文字、分页高亮、进度条、按钮状态、导出菜单、剧本高亮 HTML。 */
const PROBES: [string, (e: Element) => string][] = [
  ['.res-back a', (e) => `${e.getAttribute('href')}|${e.id}|${norm(e.textContent)}`],
  ['.done-hero h1', (e) => norm(e.textContent)],
  ['.gen-wait', (e) => norm(e.textContent)],
  ['#gatePhone', (e) => `${e.getAttribute('maxlength')}|${e.getAttribute('placeholder')}`],
  ['.gen-prog', (e) => `${e.className.trim()}|${norm(e.textContent)}|${normStyle(e.querySelector('i')?.getAttribute('style') || '')}`],
  ['.stats span', (e) => norm(e.textContent)],
  ['#vtTabs button', (e) => `${e.getAttribute('data-t')}|${e.classList.contains('on')}|${norm(e.textContent)}`],
  ['#vtEdit', (e) => `${e.getAttribute('href')}|${norm(e.textContent)}`],
  ['#vtAI', (e) => `${(e as HTMLElement).style.display}|${e.classList.contains('done')}|${norm(e.textContent)}`],
  ['#exportMenu', (e) => `${e.classList.contains('open')}|${norm(e.textContent)}`],
  ['.pcard', (e) => `${e.hasAttribute('open')}|${norm(e.textContent)}`],
  ['.vr', (e) => norm(e.textContent)],
  ['.ep', (e) => `${e.id}|${norm(e.querySelector('.h')?.textContent)}|${e.querySelector('pre')?.innerHTML}`],
  ['.vak button', (e) => `${e.classList.contains('on')}|${e.getAttribute('data-ak')}|${norm(e.textContent)}`],
  ['.vp', (e) => `${e.getAttribute('data-as')}|${normStyle(e.querySelector('.vtile')?.getAttribute('style') || '')}|${e.querySelector('svg') ? 'svg' : ''}|${norm(e.textContent)}`],
  ['.vep', (e) => `${normStyle(e.querySelector('.vep-th')?.getAttribute('style') || '')}|${norm(e.textContent)}`],
  ['.lst-r', (e) => `${norm(e.textContent)}|${e.querySelector('button')?.className || ''}`],
  ['#lstGo', (e) => `${(e as HTMLButtonElement).disabled}|${e.className}|${norm(e.textContent)}`],
  ['#lstCp, #lstDl', (e) => `${e.id}|${e.className}|${norm(e.textContent)}`],
  ['.empty', (e) => norm(e.textContent)],
]

function probe(root: ParentNode): Record<string, string[]> {
  const o: Record<string, string[]> = {}
  for (const [sel, fn] of PROBES) {
    const xs = Array.from(root.querySelectorAll(sel)).map(fn)
    if (xs.length) o[sel] = xs
  }
  return o
}
function overlays(doc: Document) {
  const m = doc.querySelector('.modal'), v = doc.querySelector('.vm')
  return {
    modal: m ? `${norm(m.querySelector('h3')?.textContent)}|${norm(m.querySelector('.tag')?.textContent)}|${m.querySelector('pre')?.textContent}` : null,
    vm: v ? `${norm(v.textContent)}|${Array.from(v.querySelectorAll('[style]')).map((x) => normStyle(x.getAttribute('style'))).join(',')}|${v.querySelectorAll('[data-gen]').length}|${v.querySelectorAll('[data-close]').length}` : null,
  }
}

/** 记录 Blob 内容（下载文件逐字节对照用）。旧页面的 Uint8Array 来自另一个 realm，不能用 instanceof。 */
export function recBlobClass() {
  return class RecBlob {
    constructor(public parts: unknown[], public opt?: { type?: string }) {}
  }
}
function blobHex(b: { parts: unknown[]; opt?: { type?: string } } | undefined): string {
  if (!b) return ''
  const bytes: number[] = []
  for (const p of b.parts) {
    if (typeof p === 'string') bytes.push(...new TextEncoder().encode(p))
    else bytes.push(...Array.from(p as ArrayLike<number>))
  }
  return (b.opt?.type || '') + ':' + Buffer.from(bytes).toString('hex')
}

interface Rec {
  toasts: string[]
  clip: string[]
  downloads: { name: string; bytes: string }[]
  opens: unknown[][]
  chat: unknown[][]
}
const newRec = (): Rec => ({ toasts: [], clip: [], downloads: [], opens: [], chat: [] })

/** 装在 window（旧页面的 jsdom 窗口或测试环境的全局）上的剪贴板、下载、新窗口、随机数桩。 */
function patchEnv(win: any, rec: Rec) {
  const blobs = new Map<string, { parts: unknown[]; opt?: { type?: string } }>()
  let n = 0
  win.Blob = recBlobClass()
  win.URL.createObjectURL = (b: any) => {
    const u = 'blob:rec/' + n++
    blobs.set(u, b)
    return u
  }
  win.URL.revokeObjectURL = () => {}
  win.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    rec.downloads.push({ name: this.download, bytes: blobHex(blobs.get(this.href)) })
  }
  Object.defineProperty(win.navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void rec.clip.push(t) } })
  win.open = (...a: unknown[]) => void rec.opens.push(a)
  let r = 0
  win.Math.random = () => RAND[r++ % RAND.length]
  win.Element.prototype.scrollIntoView = () => {}
}

function makeListing(stub: ListingStub | undefined, rec: Rec) {
  let release: () => void = () => {}
  const gate = new Promise<void>((res) => (release = res))
  return {
    release: () => release(),
    listingSources: async (heat: string) => {
      rec.chat.push(['listingSources', heat])
      if (stub?.gate) await gate
      return JSON.parse(JSON.stringify(stub?.src || { words: [], topics: [], at: '' }))
    },
    yqChat: async (...a: unknown[]) => {
      rec.chat.push(['yqChat', ...a])
      if (stub?.error) throw new Error(stub.error)
      return stub?.reply ?? ''
    },
  }
}

export interface Scenario {
  name: string
  hash: string
  local: Record<string, string>
  steps?: Step[]
  listing?: ListingStub
  /** 旧页面终态文字必须包含这些（避免两边都是空白时“相等”）。 */
  has?: string[]
  /** 旧页面预期抛出的异常（匹配 jsdom 记录的错误文本）。 */
  legacyThrows?: RegExp
}

const pick = (s: Sel, side: 'legacy' | 'react') => (typeof s === 'string' ? s : s[side])
const q = (root: ParentNode, sel: string, nth = 0): HTMLElement => {
  const el = root.querySelectorAll<HTMLElement>(sel)[nth]
  if (!el) throw new Error(`找不到 ${sel}[${nth}]`)
  return el
}
/**
 * 不比较的请求：写作引擎自己的 /yq 请求（引擎打桩，归 P5-A）与云端推送 POST /works/:id（归 P1-A；旧页面一侧 cloudPush 已换成空函数，
 * 新页面的 1.5 秒防抖推送可能在下一个场景里才触发）。
 */
const skipReq = (c: FetchCall) => c.url.includes('/yq/') || (c.url.startsWith('/works/') && (c.init as { method?: string } | undefined)?.method === 'POST')

export async function runLegacy(sc: Scenario): Promise<Run> {
  const f = makeFetch('', routes)
  const page = loadLegacyPage({ data: loadData(), apiBase: '', now: NOW, fetch: f.fn, confirm: () => true })
  const w = page.window
  const rec = newRec()
  try {
    patchEnv(w, rec)
    const origToast = w.toast
    w.toast = (t: string) => {
      rec.toasts.push(t)
      return origToast(t)
    }
    const navs: unknown[] = []
    const origNav = w.drawNav
    // 只记成功画完的一次（地址里分页不存在时旧 drawNav 抛错，侧栏停在上一版）
    w.drawNav = (r: unknown) => {
      const out = origNav(r)
      navs.push(JSON.parse(JSON.stringify(r)))
      return out
    }
    const driven = new Set<string>()
    let drives = 0
    w.yqDrive = (wid: string) => {
      driven.add(wid)
      drives++
      return Promise.resolve()
    }
    w.cloudPush = () => {}
    const L = makeListing(sc.listing, rec)
    w.listingSources = L.listingSources
    w.yqChat = L.yqChat
    const snap = (dom: boolean): Snap => ({
      dom: dom ? probe(page.view) : null,
      text: dom ? norm(page.view.textContent) : null,
      local: page.local(),
      hash: w.location.hash,
      toasts: [...rec.toasts],
      clip: [...rec.clip],
      downloads: [...rec.downloads],
      opens: [...rec.opens],
      // route() 先按地址画一次侧栏，页面自己再画带作品上下文的一次；只取后者
      nav: dom ? (navs.length > 1 ? navs[navs.length - 1] : null) : null,
      driving: driven.has(WID),
      account: w.document.getElementById('account').classList.contains('open'),
      overlay: overlays(w.document),
      reqs: f.calls.filter((c) => !skipReq(c)),
      chat: [...rec.chat],
    })
    navs.length = 0
    await page.go(sc.hash, { local: sc.local })
    const frames = [snap(true)]
    for (const s of sc.steps || []) {
      if ('away' in s) {
        w.location.hash = s.away
        await settle()
        navs.length = 0
        w.location.hash = sc.hash
        await settle()
        frames.push(snap(true))
      } else frames.push(await stepLegacy(s, page, w, L, snap))
    }
    return { frames, errors: [...page.errors], drives }
  } finally {
    page.close()
  }
}

async function stepLegacy(s: Exclude<Step, { away: string }>, page: any, w: any, L: { release: () => void }, snap: (dom: boolean) => Snap): Promise<Snap> {
  if ('wait' in s) {
    await new Promise((r) => setTimeout(r, s.wait))
    await settle()
    return snap(true)
  }
  if ('release' in s) {
    L.release()
    await settle(10)
    return snap(true)
  }
  if ('type' in s) {
    ;(q(page.view, s.type) as HTMLInputElement).value = s.value
    return snap(true)
  }
  if ('submit' in s) {
    q(page.view, s.submit).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }))
    await settle(10)
    return snap(true)
  }
  const root = s.doc ? w.document : page.view
  q(root, pick(s.click, 'legacy'), s.nth).click()
  if (s.nav) return snap(false)
  await settle(10)
  return snap(true)
}

/** 新组件一侧的写作引擎桩由测试文件提供：是否在写、上架资料两个入口。 */
export interface ReactHooks {
  driving: () => boolean
  setListing: (x: { listingSources: (heat: string) => Promise<unknown>; yqChat: (...a: unknown[]) => Promise<string> }) => void
}

export async function runReact(sc: Scenario, hooks: ReactHooks): Promise<Run> {
  const f = makeFetch('', routes)
  const rec = newRec()
  const g = globalThis as any
  const saved = { Blob: g.Blob, fetch: g.fetch, open: g.open, random: Math.random, create: URL.createObjectURL, revoke: URL.revokeObjectURL, click: HTMLAnchorElement.prototype.click, scroll: Element.prototype.scrollIntoView }
  g.fetch = f.fn
  patchEnv(window, rec)
  const L = makeListing(sc.listing, rec)
  hooks.setListing(L)
  let last: unknown = null
  const offToast = subscribeToast(() => {
    const t = getToast()
    if (t.show && t !== last) rec.toasts.push(t.text)
    last = t
  })
  localStorage.clear()
  sessionStorage.clear()
  for (const [k, v] of Object.entries(sc.local)) localStorage.setItem(k, v)
  location.hash = sc.hash
  await settle()
  const dump = () => {
    const o: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) o[localStorage.key(i)!] = localStorage.getItem(localStorage.key(i)!)!
    return o
  }
  const m = /^#\/script\/v\/([^/]*)\/?(.*)$/.exec(sc.hash)!
  let view!: HTMLElement
  const snap = (dom: boolean): Snap => ({
    dom: dom ? probe(view) : null,
    text: dom ? norm(view.textContent) : null,
    local: dump(),
    hash: location.hash,
    toasts: [...rec.toasts],
    clip: [...rec.clip],
    downloads: [...rec.downloads],
    opens: [...rec.opens],
    nav: dom ? JSON.parse(JSON.stringify(getNavOverride())) : null,
    driving: hooks.driving(),
    account: isAccountOpen(),
    overlay: overlays(document),
    reqs: f.calls.filter((c) => !skipReq(c)),
    chat: [...rec.chat],
  })
  const mount = async () => {
    const r = render(
      <>
        <div id="view">
          <WorkPage wid={m[1]} vtab={m[2] || undefined} />
        </div>
        <TextModalHost />
        <Account />
      </>,
    )
    view = r.container.querySelector('#view') as HTMLElement
    await act(async () => {
      await settle()
    })
    return r
  }
  try {
    let r = await mount()
    const frames = [snap(true)]
    for (const s of sc.steps || []) {
      if ('away' in s) {
        r.unmount()
        location.hash = s.away
        await settle()
        location.hash = sc.hash
        await settle()
        r = await mount()
        frames.push(snap(true))
      } else frames.push(await stepReact(s, view, L, snap))
    }
    r.unmount()
    return { frames, errors: [], drives: 0 }
  } finally {
    offToast()
    closeModal()
    setAccount(false)
    setNavRoute(null)
    Object.assign(g, { Blob: saved.Blob, fetch: saved.fetch, open: saved.open })
    Math.random = saved.random
    URL.createObjectURL = saved.create
    URL.revokeObjectURL = saved.revoke
    HTMLAnchorElement.prototype.click = saved.click
    Element.prototype.scrollIntoView = saved.scroll
  }
}

async function stepReact(s: Exclude<Step, { away: string }>, view: HTMLElement, L: { release: () => void }, snap: (dom: boolean) => Snap): Promise<Snap> {
  if ('wait' in s) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, s.wait))
      await settle()
    })
    return snap(true)
  }
  if ('release' in s) {
    await act(async () => {
      L.release()
      await settle(10)
    })
    return snap(true)
  }
  if ('type' in s) {
    ;(q(view, s.type) as HTMLInputElement).value = s.value
    return snap(true)
  }
  if ('submit' in s) {
    await act(async () => {
      q(view, s.submit).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await settle(10)
    })
    return snap(true)
  }
  const root = s.doc ? document : view
  if (s.nav) {
    act(() => q(root, pick(s.click, 'react'), s.nth).click())
    return snap(false)
  }
  await act(async () => {
    q(root, pick(s.click, 'react'), s.nth).click()
    await settle(10)
  })
  return snap(true)
}
