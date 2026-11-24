import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Route, funcOf, parseRoute } from '../../src/app/routes'
import { ICONS } from '../../src/components/icons'
import { NAV, indexContent } from '../../src/lib/content'
import { loadData } from './data'
import { navItems, textOf } from './html'
import { type Legacy, MemoryStorage, loadLegacy, readLegacyTemplate } from './legacy'

const json = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

const WORKS = [
  { id: 'wabc', title: '测试剧', kind: 'vibe', time: 3 },
  { id: 'sxyz', title: '标准剧', kind: 'simple', time: 2, sx: { name: '林凡' } },
  { id: 'wform', title: '', W: { mode: 'paste' }, time: 1 },
  { id: 'wold', title: '旧作', W: { mode: 'auto' }, trashed: 1, time: 0 },
]

/** 14 类路由 + 边界。第二列只是归类说明。 */
const ROUTE_CASES: [string, string][] = [
  ['#/membership', '1'], ['#membership', '1 无斜杠'], ['#/membership?from=x', '14 带查询串回落'],
  ['#/e/2.5', '2'], ['#/e/6.0', '2'], ['#/e/999.9', '2 编号不存在'], ['#/e/', '2 空编号'], ['#/e/__proto__', '2 原型键'],
  ['#/f/03-revision/dialogue', '3 含斜杠'], ['#/f/01-outline', '3'], ['#/f/', '3 空目录'], ['#/f/a?b=1', '3 带查询串'],
  ['#/assembler', '4'], ['#/changelog', '4'], ['#/admin', '4'], ['#/hotwords', '4'], ['#/trash', '4'], ['#/trash/', '14 多尾斜杠'],
  ['#/assembler?ep=wabc.3', '5 命中'], ['#/assembler?ep=wnone.3', '5 未命中'], ['#/assembler?ep=wabc', '5 无集序'], ['#/assembler?ep=wabc.x', '5 集序非数字'], ['#/assembler?x=1', '14'],
  ['#/script/s/sabc', '6'], ['#/script/s/sabc?new=1', '6 fresh'], ['#/script/s/sabc?new=0', '6'], ['#/script/s/', '6 空 id'],
  ['#/script/new', '7'], ['#/script/new?x=1', '14'],
  ['#/script/v/wabc', '8'], ['#/script/v/wabc/board', '8'], ['#/script/v/wabc/listing/extra', '8 多段'], ['#/script/v/', '8 空'],
  ['#/script/w/wabc', '9'], ['#/script/w/', '9 空'],
  ['#/assets/role-board', '10'], ['#/assets/role-board?i=2', '10 带序号'], ['#/assets/role-board?i=', '10 空序号'], ['#/assets/role-board?i=x', '10 非数字'], ['#/assets/', '10 空 fn'],
  ['#/partner', '11'],
  ['#/script', '12'], ['#/assets', '12'], ['#/storyboard', '12'], ['#/constructor', '12 TOOLS 原型键'], ['#/toString', '12 TOOLS 原型键'], ['#/script/', '14'],
  ['#/prompts', '13'], ['#/prompts?x=1', '14'],
  ['', '14 空'], ['#', '14'], ['#/', '14'], ['#//', '14'], ['#/help', '14'], ['#/manual', '14'], ['#/unknown', '14'], ['#/%E4%B8%AD', '14 编码'], ['#/MEMBERSHIP', '14 大小写'],
]

/** 模板里所有字面量站内链接（不含模板插值的部分）。 */
function templateHrefs(): string[] {
  const html = readLegacyTemplate()
  return [...new Set([...html.matchAll(/['"](#\/[^'"`$<>\s]*)['"]/g)].map((m) => m[1]))]
}

describe('路由：parseRoute 与旧 parse() 逐字段相等', () => {
  let legacy: Legacy
  const data = loadData()
  const content = indexContent(data)
  const deps = {
    entryFolder: (id: string) => content.byId.get(id)?.folder,
    findWork: (id: string) => WORKS.find((w) => w.id === id),
  }
  beforeAll(() => {
    legacy = loadLegacy({ data, storage: { 'pl.works': JSON.stringify(WORKS) } })
  })

  it('用例覆盖 14 类路由', () => {
    const cats = new Set(ROUTE_CASES.map(([, c]) => parseInt(c)))
    expect([...cats].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  })

  it.each(ROUTE_CASES)('%j（%s）', (hash) => {
    expect(json(parseRoute(hash, deps))).toStrictEqual(legacy.parse(hash))
  })

  it('模板里全部字面量站内链接', () => {
    const hrefs = templateHrefs()
    expect(hrefs.length).toBeGreaterThan(20)
    for (const h of hrefs) expect(json(parseRoute(h, deps)), h).toStrictEqual(legacy.parse(h))
  })

  it('全部提示词详情链接与目录链接', () => {
    const hashes = [...data.entries.map((e: any) => '#/e/' + e.id), ...new Set(data.entries.map((e: any) => '#/f/' + e.folder))]
    for (const h of hashes) expect(json(parseRoute(h as string, deps)), h as string).toStrictEqual(legacy.parse(h as string))
  })

  it('funcOf 与旧实现相等', () => {
    for (const [h] of ROUTE_CASES) {
      const r = legacy.parse(h)
      expect(funcOf(r), h).toBe(legacy.run(`funcOf(${JSON.stringify(r)})`))
    }
  })
})

describe('常量与内容索引', () => {
  const data = loadData()
  let legacy: Legacy
  beforeAll(() => {
    legacy = loadLegacy({ data })
  })
  it('ICONS 与旧页面运行结果相等（重复键取后者）', () => {
    expect(ICONS).toStrictEqual(legacy.run('ICONS'))
  })
  it('NAV 相等', () => {
    expect(json(NAV)).toStrictEqual(legacy.run('NAV'))
  })
  it('ENTRIES 排序、inFolder 计数、GROUP_LABEL 相等', () => {
    const c = indexContent(data)
    expect(c.entries.map((e) => e.id)).toStrictEqual(legacy.run('ENTRIES.map(e=>e.id)'))
    const keys = NAV.flatMap((n) => [n.key, ...(n.subs || []).map(([k]) => k)])
    for (const k of keys) expect(c.inFolder(k).length, k).toBe(legacy.run(`inFolder(${JSON.stringify(k)}).length`))
    expect(c.groupLabel).toStrictEqual(legacy.run('GROUP_LABEL'))
  })
})

/**
 * 导航与账户面板：在旧页面作用域里放一个最小 document，让旧 drawNav / drawAccount 真跑一遍，
 * 再与新组件的服务端渲染结果按结构比较。
 */
const FAKE_DOM = `(()=>{
  const el = () => ({ innerHTML:'', textContent:'', classList:{toggle(){},add(){},remove(){}}, querySelectorAll:()=>[], querySelector:()=>null, scrollIntoView(){}, set onclick(f){}, set onsubmit(f){} });
  const byId = {}, bySel = {};
  globalThis.__dom = { byId, bySel };
  globalThis.document = {
    getElementById: id => byId[id] ??= el(),
    querySelector: s => bySel[s] ??= el(),
    querySelectorAll: s => s === '.pro-slot' ? [byId.__proSlot ??= Object.assign(el(), { get firstChild(){ return {} } })] : [],
  };
  globalThis.matchMedia = () => ({ matches: false });
  return 1;
})()`

describe('导航：顶栏、侧栏、PRO 开关与旧 drawNav 结构相等', () => {
  const data = loadData()
  let Nav: typeof import('../../src/app/Nav')
  let storage: MemoryStorage

  beforeAll(async () => {
    vi.stubGlobal('window', { TJ_API_BASE: '' })
    vi.stubGlobal('document', { getElementById: (id: string) => (id === 'tj-data' ? { textContent: JSON.stringify(data) } : null) })
    storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    Nav = await import('../../src/app/Nav')
  })
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  const seeds: [string, Record<string, string>][] = [
    ['空存储', {}],
    ['有作品与资产、PRO 开', { 'pl.works': JSON.stringify(WORKS), 'pl.assets': JSON.stringify([{ fn: 'role-board', name: '林凡' }, { fn: 'scene-var', name: '' }, { fn: 'unknown' }]) }],
    ['有作品、标准版', { 'pl.works': JSON.stringify(WORKS), 'pl.pro': 'false' }],
  ]
  const hashes = ['', '#/', '#/script', '#/script/new', '#/script/w/wform', '#/script/s/sxyz', '#/script/v/wabc/board', '#/partner',
    '#/assets', '#/assets/role-board', '#/assets/role-board?i=0', '#/assets/scene-var?i=1', '#/storyboard', '#/assembler', '#/assembler?ep=wabc.2',
    '#/prompts', '#/f/03-revision', '#/f/03-revision/dialogue', '#/e/2.5', '#/e/6.0', '#/changelog', '#/membership', '#/trash', '#/help']

  for (const [name, seed] of seeds) {
    describe(name, () => {
      let legacy: Legacy
      beforeAll(() => {
        legacy = loadLegacy({ data, storage: seed })
        legacy.run(FAKE_DOM)
        storage.clear()
        for (const [k, v] of Object.entries(seed)) storage.setItem(k, v)
      })
      it.each(hashes)('%j', (hash) => {
        legacy.setHash(hash)
        const route = legacy.run<Route>('(()=>{ const r=parse(); drawNav(r); return r })()')
        const side = legacy.run<string>('__dom.byId.pside.innerHTML')
        const seg = legacy.run<string>('__dom.byId.tbSeg.innerHTML')
        const pro = legacy.run<string>('__dom.byId.__proSlot.innerHTML')
        const pill = legacy.run<string>('__dom.byId.psOpen.innerHTML')

        const newSide = renderToStaticMarkup(createElement(Nav.SideNav, { route, hash, rev: 0 }))
        const newSeg = renderToStaticMarkup(createElement(Nav.TopSeg, { route }))
        const newPro = renderToStaticMarkup(createElement(Nav.ProSwitch))
        const newPill = renderToStaticMarkup(createElement(Nav.PanelPill, { title: Nav.navTitle(route) }))

        expect(navItems(side).length).toBeGreaterThan(3)
        expect(navItems(newSide)).toStrictEqual(navItems(side))
        expect(navItems(newSeg)).toStrictEqual(navItems(seg))
        expect(navItems(newPro)).toStrictEqual(navItems(pro))
        expect(textOf(newPill)).toBe(textOf(pill))
      })
    })
  }

  it('作品页传入的 vibe 上下文（旧 drawNav 由 viewVibeScript 调用）', () => {
    const legacy = loadLegacy({ data, storage: { 'pl.works': JSON.stringify(WORKS) } })
    legacy.run(FAKE_DOM)
    storage.clear()
    storage.setItem('pl.works', JSON.stringify(WORKS))
    for (const tool of ['script', 'assets', 'storyboard']) {
      const route = { view: 'tool', tool, sub: 'vibe', wid: 'wabc', vibe: { id: 'wabc', title: '测试剧', tab: 'assets' } } as Route
      legacy.setHash('#/script/v/wabc/assets')
      legacy.run(`drawNav(${JSON.stringify(route)})`)
      const side = legacy.run<string>('__dom.byId.pside.innerHTML')
      const newSide = renderToStaticMarkup(createElement(Nav.SideNav, { route, hash: '#/script/v/wabc/assets', rev: 0 }))
      expect(navItems(newSide), tool).toStrictEqual(navItems(side))
    }
  })
})

describe('账户面板：与旧 drawAccount 结构相等', () => {
  const data = loadData()
  let Account: typeof import('../../src/app/Account')
  let storage: MemoryStorage
  beforeAll(async () => {
    vi.stubGlobal('window', { TJ_API_BASE: '' })
    storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    Account = await import('../../src/app/Account')
  })
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  const users: [string, unknown][] = [
    ['未登录', null],
    ['免费用户', { token: 't', user: { uid: 'u1', phone: '13800138000', role: 'free', points: 43, cap: 40 } }],
    ['会员', { token: 't', user: { uid: 'u2', phone: '1380013', role: 'member', points: 0, cap: 100 } }],
    ['内部测试', { token: 't', user: { uid: 'u3', phone: '12345678', role: 'tester', points: null, cap: null } }],
    ['未知身份', { token: 't', user: { uid: 'u4', phone: '', role: 'vip', points: 5, cap: 40 } }],
  ]
  it.each(users)('%s', (_n, auth) => {
    const seed: Record<string, string> = auth ? { 'pl.auth': JSON.stringify(auth) } : {}
    const legacy = loadLegacy({ data, storage: seed })
    legacy.run(FAKE_DOM)
    legacy.run('(drawAccount(), 1)')
    const pts = legacy.run<string>("__dom.bySel['.account-trigger .points-number'].textContent")
    const head = legacy.run<string>("__dom.bySel['.account-head'].innerHTML")
    const card = legacy.run<string>("__dom.bySel['.points-card'].innerHTML")

    storage.clear()
    for (const [k, v] of Object.entries(seed)) storage.setItem(k, v)
    const html = renderToStaticMarkup(createElement(Account.Account))
    const pick = (cls: string) => {
      const m = html.match(new RegExp(`<(div|span) class="${cls}"[^>]*>`))
      expect(m, cls).not.toBeNull()
      // 取到与开标签配对的结束标签为止（这两个容器内部只有 div / span / form / button / input）
      let depth = 0
      const re = /<(\/?)(div|span|section|form)\b[^>]*>/g
      re.lastIndex = m!.index!
      for (let t; (t = re.exec(html)); ) {
        depth += t[1] ? -1 : 1
        if (depth === 0) return html.slice(m!.index! + m![0].length, t.index)
      }
      throw new Error('unbalanced ' + cls)
    }
    expect(textOf(html.match(/<span class="points-number">([\s\S]*?)<\/span>/)![1])).toBe(String(pts))
    expect(textOf(pick('account-head'))).toBe(textOf(head))
    expect(navItems(pick('account-head'))).toStrictEqual(navItems(head))
    expect(textOf(pick('points-card'))).toBe(textOf(card))
    expect(navItems(pick('points-card'))).toStrictEqual(navItems(card))
    if (!auth) {
      expect(html).toMatch(/<input id="accPhone" inputMode="numeric" maxLength="11" placeholder="手机号 8–11 码"\/>/)
      expect(card).toContain('<input id="accPhone" inputmode="numeric" maxlength="11" placeholder="手机号 8–11 码">')
    }
  })
})
