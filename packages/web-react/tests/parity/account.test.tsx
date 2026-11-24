import { act, fireEvent, render } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminPage } from '../../src/features/account/AdminPage'
import { HotwordsPage } from '../../src/features/account/HotwordsPage'
import { TrashPage } from '../../src/features/account/TrashPage'
import { getToast, subscribeToast } from '../../src/lib/toast'
import { type DomNode, type FetchCall, type FetchRoutes, type StubReply, domTree, loadLegacyPage, makeFetch, settle } from './legacy-page'
import { loadData } from './data'

/**
 * 热词、回收站、会员后台（M15）的新旧对照：同一份种子、同一组桩响应、同一串操作，
 * 分别在旧页面（jsdom 里整页运行 site-template.html 的真实脚本）与新组件上执行，
 * 每一步之后逐节点比较 DOM，并比较 localStorage / sessionStorage 原文、fetch 请求（路径、方法、头、体）、toast 文案、confirm 提问、location.hash。
 */

const NOW = Date.UTC(2027, 0, 15, 4, 0, 0)
const DAY = 864e5
const BASE = 'https://api.example.test'

type Step =
  | { click: string; nth?: number; nav?: boolean }
  | { set: string; value: string; nth?: number }
  | { choose: string; value: string; nth?: number }
  | { submit: string }

interface Scenario {
  name: string
  hash: '#/hotwords' | '#/trash' | '#/admin'
  Page: ComponentType
  base?: string
  local?: Record<string, string>
  session?: Record<string, string>
  /** 每次运行（旧页面、新组件各一次）新建，桩服务端的状态互不影响。 */
  routes: () => FetchRoutes
  /** confirm() 依次的回答，用完后默认 true。 */
  confirms?: boolean[]
  steps?: Step[]
  /** 旧页面终态的文本必须包含这些，避免两边都渲染空白时“相等”。 */
  has?: (string | RegExp)[]
}

interface Frame {
  /** nav 步骤之后旧页面已跳去别的 view，不比较 DOM。 */
  dom: DomNode[] | null
  local: Record<string, string>
  session: Record<string, string>
  hash: string
  toasts: string[]
  calls: FetchCall[]
  confirms: string[]
}
interface Run {
  frames: Frame[]
  text: string
  errors: string[]
}

const q = (root: ParentNode, sel: string, nth = 0): HTMLElement => {
  const el = root.querySelectorAll<HTMLElement>(sel)[nth]
  if (!el) throw new Error(`找不到 ${sel}[${nth}]`)
  return el
}
const textOf = (root: Node) => (root.textContent || '').replace(/\s+/g, ' ')

async function runLegacy(sc: Scenario): Promise<Run> {
  const base = sc.base ?? ''
  const f = makeFetch(base, sc.routes())
  const confirms: string[] = []
  const answers = [...(sc.confirms || [])]
  const page = loadLegacyPage({
    data: loadData(),
    apiBase: base,
    now: NOW,
    fetch: f.fn,
    confirm: (m) => {
      confirms.push(m)
      return answers.length ? answers.shift()! : true
    },
  })
  try {
    const w = page.window
    const toasts: string[] = []
    const origToast = w.toast
    w.toast = (t: string) => {
      toasts.push(t)
      return origToast(t)
    }
    const errors: string[] = []
    const snap = (dom: boolean): Frame => {
      errors.splice(0, errors.length, ...page.errors)
      return { dom: dom ? domTree(page.view) : null, local: page.local(), session: page.session(), hash: w.location.hash, toasts: [...toasts], calls: [...f.calls], confirms: [...confirms] }
    }
    await page.go(sc.hash, { local: sc.local, session: sc.session })
    const frames = [snap(true)]
    for (const s of sc.steps || []) {
      let nav = false
      if ('click' in s) {
        q(page.view, s.click, s.nth).click()
        nav = !!s.nav
      } else if ('set' in s) {
        ;(q(page.view, s.set, s.nth) as HTMLInputElement).value = s.value
      } else if ('choose' in s) {
        const el = q(page.view, s.choose, s.nth) as HTMLSelectElement
        el.value = s.value
        el.dispatchEvent(new w.Event('change', { bubbles: true }))
      } else {
        q(page.view, s.submit).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }))
      }
      if (nav) {
        frames.push(snap(false)) // 点击后立刻取：旧页面的 hashchange 稍后才触发，之后的重画不属于本页
        await settle()
      } else {
        await settle()
        frames.push(snap(true))
      }
    }
    return { frames, text: textOf(page.view), errors }
  } finally {
    page.close()
  }
}

async function runReact(sc: Scenario): Promise<Run> {
  const base = sc.base ?? ''
  const f = makeFetch(base, sc.routes())
  const confirms: string[] = []
  const answers = [...(sc.confirms || [])]
  vi.stubGlobal('fetch', f.fn)
  vi.stubGlobal('confirm', (m: string) => {
    confirms.push(m)
    return answers.length ? answers.shift()! : true
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  window.TJ_API_BASE = base
  localStorage.clear()
  sessionStorage.clear()
  for (const [k, v] of Object.entries(sc.local || {})) localStorage.setItem(k, v)
  for (const [k, v] of Object.entries(sc.session || {})) sessionStorage.setItem(k, v)
  location.hash = sc.hash
  const toasts: string[] = []
  const off = subscribeToast(() => {
    const t = getToast()
    if (t.show) toasts.push(t.text)
  })
  const dump = (s: Storage) => Object.fromEntries(Array.from({ length: s.length }, (_, i) => [s.key(i)!, s.getItem(s.key(i)!)!]))
  try {
    const { container } = render(<sc.Page />)
    const flush = () => act(async () => void (await settle()))
    await flush()
    const snap = (dom: boolean): Frame => ({ dom: dom ? domTree(container) : null, local: dump(localStorage), session: dump(sessionStorage), hash: location.hash, toasts: [...toasts], calls: [...f.calls], confirms: [...confirms] })
    const frames = [snap(true)]
    for (const s of sc.steps || []) {
      let nav = false
      if ('click' in s) {
        fireEvent.click(q(container, s.click, s.nth))
        nav = !!s.nav
      } else if ('set' in s) {
        fireEvent.change(q(container, s.set, s.nth), { target: { value: s.value } })
      } else if ('choose' in s) {
        fireEvent.change(q(container, s.choose, s.nth), { target: { value: s.value } })
      } else {
        fireEvent.submit(q(container, s.submit))
      }
      if (nav) {
        frames.push(snap(false))
        await flush()
      } else {
        await flush()
        frames.push(snap(true))
      }
    }
    return { frames, text: textOf(container), errors: [] }
  } finally {
    off()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete window.TJ_API_BASE
  localStorage.clear()
  sessionStorage.clear()
  location.hash = ''
})

function check(list: Scenario[]) {
  it.each(list.map((s) => [s.name, s] as const))('%s', async (_n, sc) => {
    const L = await runLegacy(sc)
    const R = await runReact(sc)
    expect(L.errors, '旧页面脚本在对照点之前不应报错').toEqual([])
    for (const h of sc.has || []) expect(L.text).toMatch(h)
    expect(R.frames.length).toBe(L.frames.length)
    R.frames.forEach((rf, i) => expect(rf, `第 ${i} 帧（0 = 初始，其后为各步骤之后）`).toEqual(L.frames[i]))
  })
}

const j = JSON.stringify
const AUTH = { 'pl.auth': j({ token: 'tk.1.sig', user: { uid: 'u9', phone: '13800138000', role: 'free', points: 12 } }) }

/* ======================= 热词 ======================= */

const WORDS = {
  at: '2027-01-15 12:00',
  words: [
    { word: '重生复仇', cat: '情感', heat: 98, trend: '↑' },
    { word: '真假千金', cat: '情感', heat: 75, trend: '↗' },
    { word: '末日<囤货>&"', cat: '悬疑', heat: 40 },
    { word: 'AI 短剧', cat: '科技', heat: 0, trend: '新' },
    { word: '无分类词', heat: 12 },
    { word: '先婚后爱', cat: '情感' },
  ],
}
const wordsRoutes = (r: StubReply) => (): FetchRoutes => (p) => (p === '/words' ? r : { status: 404, body: { error: 'not found' } })

describe('热词页与旧 viewHotwords 对照', () => {
  check([
    { name: '读取中：/words 还没返回', hash: '#/hotwords', Page: HotwordsPage, routes: wordsRoutes({ hang: true }), has: [/读取中…/] },
    { name: '热词为空（words 为空数组）', hash: '#/hotwords', Page: HotwordsPage, routes: wordsRoutes({ body: { words: [], at: '' } }), has: [/热词/, /0 个/] },
    { name: '热词为空（响应没有 words 字段）', hash: '#/hotwords', Page: HotwordsPage, routes: wordsRoutes({ body: {} }), has: [/0 个/] },
    { name: '/words 失败：500', hash: '#/hotwords', Page: HotwordsPage, routes: wordsRoutes({ status: 500, body: { error: 'x' } }), has: [/暂时读不到，稍后再试/] },
    { name: '/words 失败：503（未推送过）', hash: '#/hotwords', Page: HotwordsPage, routes: wordsRoutes({ status: 503, body: { error: 'no data' } }), has: [/暂时读不到/] },
    { name: '/words 失败：网络错误', hash: '#/hotwords', Page: HotwordsPage, routes: wordsRoutes({ throws: true }), has: [/暂时读不到/] },
    { name: '/words 失败：响应不是 JSON', hash: '#/hotwords', Page: HotwordsPage, routes: wordsRoutes({ badJson: true }), has: [/暂时读不到/] },
    { name: '/words 失败：响应体为 null', hash: '#/hotwords', Page: HotwordsPage, routes: wordsRoutes({ body: null }), has: [/暂时读不到/] },
    { name: '有数据：多个分类、热度条、走势、转义字符', hash: '#/hotwords', Page: HotwordsPage, routes: wordsRoutes({ body: WORDS }), has: [/6 个 · 2027-01-15 12:00 更新/, /重生复仇/, /01/] },
    {
      name: '有数据：逐个切换分类再回到全部',
      hash: '#/hotwords',
      Page: HotwordsPage,
      routes: wordsRoutes({ body: WORDS }),
      steps: [{ click: '.hw-cats [data-c]', nth: 1 }, { click: '.hw-cats [data-c]', nth: 2 }, { click: '.hw-cats [data-c]', nth: 3 }, { click: '.hw-cats [data-c]', nth: 0 }],
      has: [/全部/],
    },
    {
      name: '只有一个分类：不显示分类条',
      hash: '#/hotwords',
      Page: HotwordsPage,
      routes: wordsRoutes({ body: { at: 't', words: [{ word: 'a', cat: 'x', heat: 5 }, { word: 'b', cat: 'x', heat: 10 }] } }),
      has: [/2 个/],
    },
    {
      name: '热度全为 0 或缺失（热度条分母取 1）',
      hash: '#/hotwords',
      Page: HotwordsPage,
      routes: wordsRoutes({ body: { words: [{ word: 'a' }, { word: 'b', heat: 0 }] } }),
      has: [/2 个 · 更新/],
    },
    { name: '后端地址非空：请求发往 TJ_API 前缀', hash: '#/hotwords', Page: HotwordsPage, base: BASE, routes: wordsRoutes({ body: WORDS }), has: [/6 个/] },
    {
      name: '点词条：没有 chat 与 vibeCard，pro 原为 false',
      hash: '#/hotwords',
      Page: HotwordsPage,
      routes: wordsRoutes({ body: WORDS }),
      local: { 'pl.pro': 'false' },
      steps: [{ click: '.hw-row', nth: 0, nav: true }],
    },
    {
      name: '点词条：已有 chat（键序与额外字段）与 vibeCard 被清为 null',
      hash: '#/hotwords',
      Page: HotwordsPage,
      routes: wordsRoutes({ body: WORDS }),
      local: {
        'pl.chat': j({ ai: 'GPT', depth: '深', tab: 'paste', pitch: '旧', extra: 1, editing: true }),
        'pl.vibeCard': j({ pitch: 'x', mode: 'auto' }),
        'pl.pro': 'false',
      },
      steps: [{ click: '.hw-cats [data-c]', nth: 1 }, { click: '.hw-row', nth: 1, nav: true }],
    },
    {
      name: '点词条：词里含引号与 HTML 字符',
      hash: '#/hotwords',
      Page: HotwordsPage,
      routes: wordsRoutes({ body: WORDS }),
      local: { 'pl.chat': 'null' },
      steps: [{ click: '.hw-row', nth: 2, nav: true }],
    },
    {
      name: '点词条：pl.chat 存了非对象字符串（损坏数据）',
      hash: '#/hotwords',
      Page: HotwordsPage,
      routes: wordsRoutes({ body: WORDS }),
      local: { 'pl.chat': '{坏', 'pl.vibeCard': '[]' },
      steps: [{ click: '.hw-row', nth: 0, nav: true }],
    },
  ])
})

/* ======================= 回收站 ======================= */

const mk = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: '作品' + id, W: { mode: 'auto' }, time: NOW - 9 * DAY, ...extra })
const TRASHED = [
  mk('w1', { kind: 'vibe', trashed: NOW - 1 * DAY }),
  mk('w2', { kind: 'simple', title: '', trashed: NOW - 10.5 * DAY }),
  mk('w3', { title: '<i>三</i>&"', W: { mode: 'paste' }, trashed: NOW - 29.9 * DAY }),
  mk('w4', { W: {}, trashed: NOW - 20 * DAY }),
  mk('w5', { W: { mode: 'novel' }, trashed: NOW - 20 * DAY }),
  mk('w6', { W: { mode: 'nope' }, trashed: NOW - 30 * DAY }),
]
const LIVE = [mk('live1', { kind: 'vibe' }), mk('live2')]
const seedWorks = (list: unknown[], extra: Record<string, string> = {}) => ({ 'pl.works': j(list), ...extra })
const trashRoutes =
  (reply: StubReply = { body: { ok: true } }): (() => FetchRoutes) =>
  () =>
  (_p, init) =>
    init?.method === 'DELETE' ? reply : { status: 404, body: {} }

describe('回收站与旧 viewTrash 对照', () => {
  check([
    { name: '回收站为空：没有任何作品', hash: '#/trash', Page: TrashPage, routes: trashRoutes(), has: [/回收桶是空的/, /0 部 · 删除后保留 30 天/] },
    { name: '回收站为空：pl.works 为字符串 null', hash: '#/trash', Page: TrashPage, routes: trashRoutes(), local: { 'pl.works': 'null' }, has: [/回收桶是空的/] },
    { name: '回收站为空：只有未删除的作品', hash: '#/trash', Page: TrashPage, routes: trashRoutes(), local: seedWorks(LIVE), has: [/回收桶是空的/] },
    {
      name: '有数据：按删除时间倒序、剩余天数、类型标签、转义（30 天整的一部保留且剩 0 天）',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes(),
      local: seedWorks([...LIVE, ...TRASHED]),
      has: [/6 部 · 删除后保留 30 天/, /剩 29 天/, /剩 0 天/, /未命名/, /人物即剧本/, /氛围写作/],
    },
    {
      name: '已过期（31 天、未登录）：进入页面时清除并写回，不发请求',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes(),
      local: seedWorks([...LIVE, mk('old1', { trashed: NOW - 31 * DAY }), ...TRASHED.slice(0, 2)]),
      has: [/2 部/],
    },
    {
      name: '已过期（已登录）：清除并对每个过期作品发 DELETE',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes(),
      local: seedWorks([mk('old1', { trashed: NOW - 31 * DAY }), mk('old 2/é', { trashed: NOW - 90 * DAY }), ...TRASHED.slice(0, 1)], AUTH),
      has: [/1 部/],
    },
    {
      name: '已过期（已登录）：全部过期后回收站为空，DELETE 失败被忽略',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes({ status: 500, body: { error: 'boom' } }),
      local: seedWorks([mk('old1', { trashed: NOW - 31 * DAY })], AUTH),
      has: [/回收桶是空的/],
    },
    {
      name: '还原一部：删掉 trashed、time 改为当前时间',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes(),
      local: seedWorks([...LIVE, ...TRASHED]),
      steps: [{ click: '[data-rs]', nth: 1 }],
      has: [/5 部/],
    },
    {
      name: '还原：作品原本没有 time 字段（键序）',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes(),
      local: seedWorks([{ id: 'nt', title: '无时间', W: {}, trashed: NOW - DAY, extra: 1 }]),
      steps: [{ click: '[data-rs]' }],
      has: [/回收桶是空的/],
    },
    {
      name: '还原后再还原到空',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes(),
      local: seedWorks(TRASHED.slice(0, 2), AUTH),
      steps: [{ click: '[data-rs]', nth: 0 }, { click: '[data-rs]', nth: 0 }],
      has: [/回收桶是空的/],
    },
    {
      name: '永久删除一部：确认，未登录不发请求',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes(),
      local: seedWorks([...LIVE, ...TRASHED]),
      steps: [{ click: '[data-rm]', nth: 2 }],
      has: [/5 部/],
    },
    {
      name: '永久删除：取消确认则不动',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes(),
      confirms: [false],
      local: seedWorks([...LIVE, ...TRASHED], AUTH),
      steps: [{ click: '[data-rm]', nth: 0 }],
      has: [/6 部/],
    },
    {
      name: '永久删除：已登录发 DELETE，id 含特殊字符被转义',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes(),
      local: seedWorks([mk('w 1/é#?', { trashed: NOW - DAY }), ...TRASHED.slice(0, 1)], AUTH),
      steps: [{ click: '[data-rm]', nth: 0 }],
      base: BASE,
      has: [/1 部/],
    },
    {
      name: '永久删除：DELETE 返回 500 被忽略，本地仍删除',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes({ status: 500, body: { error: 'boom' } }),
      local: seedWorks(TRASHED.slice(0, 2), AUTH),
      steps: [{ click: '[data-rm]', nth: 0 }],
      has: [/1 部/],
    },
    {
      name: '永久删除：DELETE 返回 401 时登出（删除 pl.auth）',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes({ status: 401, body: { error: 'login required' } }),
      local: seedWorks(TRASHED.slice(0, 2), AUTH),
      steps: [{ click: '[data-rm]', nth: 0 }],
      has: [/1 部/],
    },
    {
      name: '清空回收桶：确认后全部永久删除并逐个 DELETE',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes(),
      local: seedWorks([...LIVE, ...TRASHED], AUTH),
      steps: [{ click: '#trEmpty' }],
      has: [/回收桶是空的/],
    },
    {
      name: '清空回收桶：取消确认则不动，确认提问文案含部数',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes(),
      confirms: [false],
      local: seedWorks([...LIVE, ...TRASHED], AUTH),
      steps: [{ click: '#trEmpty' }],
      has: [/6 部/],
    },
    {
      name: '清空回收桶：401 登出后其余请求照发',
      hash: '#/trash',
      Page: TrashPage,
      routes: trashRoutes({ status: 401, body: {} }),
      local: seedWorks(TRASHED.slice(0, 3), AUTH),
      steps: [{ click: '#trEmpty' }],
      has: [/回收桶是空的/],
    },
  ])
})

/* ======================= 会员后台 ======================= */

interface AdminOpts {
  key?: string
  usersReply?: StubReply
  stats?: StubReply
  points?: StubReply
  role?: StubReply
  users?: Record<string, unknown>[]
}
const USERS = [
  { uid: 'u1', phone: '13800138000', role: 'free', points: 30, used_today: 2, used_total: 10, works: 3, last_login: NOW - 3600e3 },
  { uid: 'u2', phone: '1380013', role: 'member', points: 150, used_today: 0, used_total: 0, works: 0, last_login: null },
  { uid: 'u3', phone: '', role: 'tester', points: null, works: 1 },
  { uid: 'u4', phone: '13900139000', role: 'weird', points: null, used_today: 1, used_total: 1, works: 0, last_login: 0 },
]
const STATS = {
  day: '2027-01-15',
  today: { n: 40, ok: 38, busy: 1, timeout: 1, other: 0, avg_ms: 12345, max_ms: 90000 },
  lastHour: { n: 5, ok: 5 },
  models: [{ model: 'qwen<x>', n: 30, ok: 29, avg_ms: 8000 }, { model: 'fast', n: 10, ok: 9, avg_ms: null }, { model: 'bare' }],
}
const adminRoutes =
  (o: AdminOpts = {}): (() => FetchRoutes) =>
  () => {
    const users = JSON.parse(JSON.stringify(o.users || USERS)) as Record<string, any>[]
    return (p, init) => {
      if (init?.headers?.['X-Admin-Key'] !== (o.key ?? 'good')) return { status: 403, body: { error: 'forbidden' } }
      if (p === '/admin/users') return o.usersReply || { body: { day: '2027-01-15', users } }
      if (p === '/admin/stats') return o.stats || { body: STATS }
      const b = JSON.parse(String(init?.body || '{}'))
      if (p === '/admin/points') {
        if (o.points) return o.points
        users.find((u) => u.uid === b.uid)!.points += b.delta
        return { body: { ok: true } }
      }
      if (p === '/admin/role') {
        if (o.role) return o.role
        users.find((u) => u.uid === b.uid)!.role = b.role
        return { body: { ok: true } }
      }
      return { status: 404, body: { error: 'not found' } }
    }
  }
const GOOD = { tjAdmin: 'good' }

describe('会员后台与旧 viewAdmin 对照', () => {
  check([
    { name: '没有口令：只显示口令框，不发请求', hash: '#/admin', Page: AdminPage, routes: adminRoutes(), has: [/会员后台/, /进入/] },
    {
      name: '有口令：用户表（四种身份、tester 不限、points 为 null、无登录时间）与统计条、模型明细',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes(),
      session: GOOD,
      has: [/4 位 · 2027-01-15/, /UID/, /不限/, /40今日调用/, /95%成功率/, /12s平均耗时/, /1忙线 429/, /qwen<x>：30 次 · 成功 29 · 8s/, /fast：10 次 · 成功 9 · —/, /bare：undefined 次 · 成功 0 · —/],
    },
    { name: '有口令：已登录用户请求带 Bearer 与 X-Admin-Key', hash: '#/admin', Page: AdminPage, routes: adminRoutes(), session: GOOD, local: AUTH, has: [/4 位/] },
    { name: '有口令、后端地址非空', hash: '#/admin', Page: AdminPage, base: BASE, routes: adminRoutes(), session: GOOD, has: [/4 位/] },
    { name: '读取中：/admin/users 还没返回（表格区为空）', hash: '#/admin', Page: AdminPage, routes: adminRoutes({ usersReply: { hang: true } }), session: GOOD, has: [/会员后台/] },
    { name: '用户为空数组', hash: '#/admin', Page: AdminPage, routes: adminRoutes({ users: [] }), session: GOOD, has: [/0 位 · 2027-01-15/] },
    { name: '统计为空对象（成功率与耗时显示破折号）', hash: '#/admin', Page: AdminPage, routes: adminRoutes({ stats: { body: {} } }), session: GOOD, has: [/0今日调用/, /—成功率/] },
    { name: '统计失败（500）静默，只显示用户表', hash: '#/admin', Page: AdminPage, routes: adminRoutes({ stats: { status: 500, body: { error: 'x' } } }), session: GOOD, has: [/4 位/] },
    { name: '统计请求网络错误静默', hash: '#/admin', Page: AdminPage, routes: adminRoutes({ stats: { throws: true } }), session: GOOD, has: [/4 位/] },
    { name: '口令错误（403）：提示密码不对', hash: '#/admin', Page: AdminPage, routes: adminRoutes({ key: 'other' }), session: GOOD, has: [/密码不对/] },
    {
      name: '口令错误且已登录：403 不登出，pl.auth 保留',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes({ key: 'other' }),
      session: GOOD,
      local: AUTH,
      has: [/密码不对/],
    },
    { name: '401 不登出（noLogout）：提示读取失败', hash: '#/admin', Page: AdminPage, routes: adminRoutes({ usersReply: { status: 401, body: { error: 'login required' } } }), session: GOOD, local: AUTH, has: [/读取失败/] },
    { name: '读取失败：500', hash: '#/admin', Page: AdminPage, routes: adminRoutes({ usersReply: { status: 500, body: { error: 'boom' } } }), session: GOOD, has: [/读取失败/] },
    { name: '读取失败：网络错误', hash: '#/admin', Page: AdminPage, routes: adminRoutes({ usersReply: { throws: true } }), session: GOOD, has: [/读取失败/] },
    { name: '读取失败：响应缺 users', hash: '#/admin', Page: AdminPage, routes: adminRoutes({ usersReply: { body: { day: 'd' } } }), session: GOOD, has: [/读取失败/] },
    { name: '读取失败：响应不是 JSON（旧页面 api 吞成空对象）', hash: '#/admin', Page: AdminPage, routes: adminRoutes({ usersReply: { badJson: true } }), session: GOOD, has: [/读取失败/] },
    {
      name: '输入口令（含首尾空格）提交：存 sessionStorage 去空格，随后带该口令请求',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes(),
      steps: [{ set: '#admKeyIn', value: '  good  ' }, { submit: '#admKey' }],
      has: [/4 位/],
    },
    {
      name: '先输错口令再输对：403 后恢复',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes(),
      steps: [{ set: '#admKeyIn', value: 'bad' }, { submit: '#admKey' }, { set: '#admKeyIn', value: 'good' }, { submit: '#admKey' }],
      has: [/4 位/],
    },
    {
      name: '提交空口令：写入空串并请求（X-Admin-Key 为空）',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes(),
      steps: [{ submit: '#admKey' }],
      has: [/密码不对/],
    },
    {
      name: '已有口令时再次提交会重新加载',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes(),
      session: GOOD,
      steps: [{ submit: '#admKey' }],
      has: [/4 位/],
    },
    {
      name: '加点成功：请求体、toast、重载后输入框清空且积分更新',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes(),
      session: GOOD,
      steps: [{ set: '[data-n]', value: '5', nth: 0 }, { set: '[data-note]', value: '活动奖励', nth: 0 }, { click: '[data-add]', nth: 0 }],
      has: [/35/],
    },
    {
      name: '加点成功：负数点数与空备注',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes(),
      session: GOOD,
      steps: [{ set: '[data-n]', value: '-3', nth: 1 }, { click: '[data-add]', nth: 1 }],
      has: [/147/],
    },
    {
      name: '加点：点数为 0 或为空只提示输入点数，不发请求',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes(),
      session: GOOD,
      steps: [{ click: '[data-add]', nth: 0 }, { set: '[data-n]', value: '0', nth: 0 }, { click: '[data-add]', nth: 0 }, { set: '[data-n]', value: 'abc', nth: 0 }, { click: '[data-add]', nth: 0 }],
    },
    {
      name: '加点失败：后端 400 的 error 文案进 toast，表格与输入框保持原样',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes({ points: { status: 400, body: { error: 'uid and delta required' } } }),
      session: GOOD,
      steps: [{ set: '[data-n]', value: '5', nth: 0 }, { set: '[data-note]', value: '保留我', nth: 0 }, { click: '[data-add]', nth: 0 }],
    },
    {
      name: '加点失败：500 且无 error 字段显示 HTTP 500',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes({ points: { status: 500, body: {} } }),
      session: GOOD,
      steps: [{ set: '[data-n]', value: '2', nth: 2 }, { click: '[data-add]', nth: 2 }],
    },
    {
      name: '加点失败：网络错误',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes({ points: { throws: true } }),
      session: GOOD,
      steps: [{ set: '[data-n]', value: '2', nth: 0 }, { click: '[data-add]', nth: 0 }],
    },
    {
      name: '加点失败：口令中途失效（403 forbidden）',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes({ points: { status: 403, body: { error: 'forbidden' } } }),
      session: GOOD,
      local: AUTH,
      steps: [{ set: '[data-n]', value: '9', nth: 0 }, { click: '[data-add]', nth: 0 }],
    },
    {
      name: '改身份成功：free 改 member、member 改 tester',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes(),
      session: GOOD,
      steps: [{ choose: '[data-role]', value: 'member', nth: 0 }, { choose: '[data-role]', value: 'tester', nth: 1 }],
      has: [/不限/],
    },
    {
      name: '改身份失败：400 bad role 进 toast，下拉保持用户选的值',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes({ role: { status: 400, body: { error: 'bad role' } } }),
      session: GOOD,
      steps: [{ choose: '[data-role]', value: 'tester', nth: 0 }],
    },
    {
      name: '改身份失败：网络错误',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes({ role: { throws: true } }),
      session: GOOD,
      steps: [{ choose: '[data-role]', value: 'member', nth: 3 }],
    },
    {
      name: '加点后改身份：重载使统计与表格再次刷新',
      hash: '#/admin',
      Page: AdminPage,
      routes: adminRoutes(),
      session: GOOD,
      steps: [{ set: '[data-n]', value: '1', nth: 0 }, { click: '[data-add]', nth: 0 }, { choose: '[data-role]', value: 'member', nth: 0 }],
    },
  ])
})

/* ======================= 对照方法自检 ======================= */

describe('对照方法自检（防止“两边都空所以相等”）', () => {
  const tree = (html: string) => {
    const d = document.createElement('div')
    d.innerHTML = html
    return domTree(d)
  }
  it('忽略缩进换行与相邻文本拆分，但识别文本、属性、style、表单值的差异', () => {
    expect(tree('<p class="a" id="x">《你好》</p>\n <p>b</p>')).toEqual(tree('<p id="x" class="a">《你好》</p><p>b</p>'))
    expect(tree('<p style="margin-top:56px">a</p>')).toEqual(tree('<p style="margin-top: 56px;">a</p>'))
    expect(tree('<p>a</p>')).not.toEqual(tree('<p>b</p>'))
    expect(tree('<p class="a">a</p>')).not.toEqual(tree('<p class="b">a</p>'))
    expect(tree('<p style="margin-top:56px">a</p>')).not.toEqual(tree('<p style="margin-top:55px">a</p>'))
    expect(tree('<p>a</p><p>a</p>')).not.toEqual(tree('<p>a</p>'))
    expect(tree('<select><option value="1" selected>a</option><option value="2">b</option></select>')).not.toEqual(tree('<select><option value="1">a</option><option value="2" selected>b</option></select>'))
    expect(tree('<input value="1">')).not.toEqual(tree('<input value="2">'))
  })
})
