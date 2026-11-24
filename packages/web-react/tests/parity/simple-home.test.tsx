import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAKE, type Twin, gated, teardown, twin } from './simple-home-twin'

vi.mock('../../src/data', async () => {
  const { loadData } = await import('./simple-home-data')
  return { DATA: loadData(), API_BASE: '', parseData: JSON.parse }
})

/**
 * 标准版首页对照：旧 viewScriptSimple（site-template.html 第 2302 行）与新 SimpleHomePage 双跑，
 * 每一步操作后比较 DOM、localStorage 原文、hash、/hot 请求、提示条、滚动、动画速率、works 推送钩子（见 simple-home-twin.tsx）。
 */

const eq = (a: unknown, b: unknown, m: string) => expect(a, m).toStrictEqual(b)
const J = (v: unknown) => JSON.stringify(v)

const WORKS = [
  { id: 'sone', kind: 'simple', title: '陆沉归来', sx: { g: 'male', name: '陆沉', role: { type: '都市签到神豪男主' } }, time: 5 },
  { id: 'stwo', kind: 'simple', title: '', sx: { g: 'female', name: '苏晚', role: { type: '真假千金女主' } }, time: 4 },
  { id: 'wvibe', kind: 'vibe', title: '氛围剧 <b>&', W: { pitch: '一句话卖点' }, time: 3 },
  { id: 'wform', title: '表单剧', W: { mode: 'paste', pitch: '' }, time: 2 },
  { id: 'wauto', title: '自动剧', W: { mode: 'auto' }, time: 1 },
  { id: 'wgone', kind: 'vibe', title: '回收站', trashed: 1, time: 0 },
]

const HOT = {
  at: '2026-11-24T10:00:00Z',
  topics: [
    { t: '某地暴雨后外卖骑手逆行送药走红', cat: '社会', ideas: ['暴雨夜，外卖骑手送药救下一个将死的富豪', 'x'] },
    { t: '短词', cat: '娱乐', ideas: ['短灵感'] },
    { t: '顶流塌房后素人逆袭', cat: '娱乐', ideas: [] },
    { t: '央行降息', cat: '财经', ideas: ['降息当天，她把全部存款押在一套凶宅上'] },
    { t: '无分类话题', ideas: ['没有分类的话题也会出现在热点页签里'] },
    { t: '社会二', cat: '社会', ideas: ['第二条社会灵感，长度超过八个字'] },
    { t: '科技新闻', cat: '科技', ideas: ['AI 接管了公司，只有她发现它在撒谎'] },
    { t: '生活小事', cat: '生活', ideas: ['房东每天替她做早饭，直到她发现监控'] },
    { t: '军事', cat: '国际', ideas: ['第九条，超出七条之后被截掉的话题'] },
  ],
  works: [
    { t: '爆款甲', genre: '都市', ideas: ['爆款甲的灵感，足够长的一句话'] },
    { t: '爆款乙', genre: '古装', ideas: [] },
  ],
}

let t: Twin
beforeEach(() => {
  vi.useFakeTimers({ toFake: [...FAKE] })
})
afterEach(() => {
  teardown(t)
  vi.useRealTimers()
})

/** 种子按 pl.<键> = JSON.stringify(值) 写入两边的 localStorage；建好后比较一次，等 /hot 返回后再比较一次。 */
async function start(seed: Record<string, unknown> = {}, hot?: unknown) {
  t = await twin(Object.fromEntries(Object.entries(seed).map(([k, v]) => ['pl.' + k, J(v)])), hot, eq)
  t.same()
  await t.settle()
  return t.same()
}

describe('初次渲染：两种模式、角色库各层级、选择状态、作品列表', () => {
  const SEEDS: [string, Record<string, unknown>][] = [
    ['空存储（默认创作平台）', {}],
    ['角色库 root', { homeMode: 'lib' }],
    ['角色库 男频列表', { homeMode: 'lib', libNav: { lv: 'g', g: 'male', i: 0 } }],
    ['角色库 女频列表', { homeMode: 'lib', libNav: { lv: 'g', g: 'female' } }],
    ['角色库 男频详情 3', { homeMode: 'lib', libNav: { lv: 'role', g: 'male', i: 3 } }],
    ['角色库 女频详情 0', { homeMode: 'lib', libNav: { lv: 'role', g: 'female', i: 0 } }],
    ['角色库 服装库', { homeMode: 'lib', libNav: { lv: 'wip', g: 'cloth' } }],
    ['角色库 发型库', { homeMode: 'lib', libNav: { lv: 'wip', g: 'hair', i: 2 } }],
    ['角色库 g 层级但频道无数据（改成 wip）', { homeMode: 'lib', libNav: { lv: 'g', g: 'cloth' } }],
    ['libNav 带额外键', { homeMode: 'lib', libNav: { x: 1, lv: 'g', g: 'female' } }],
    ['创作平台 已选男频 3', { homeMode: 'create', sxPick: { g: 'male', idx: 3, name: '林骁', title: '林骁归来', q: '' } }],
    ['创作平台 已选女频 0', { sxPick: { g: 'female', idx: 0, name: '', title: '', q: '' } }],
    ['搜索命中', { sxPick: { g: 'male', idx: null, name: '', title: '', q: ' 系统 ' } }],
    ['搜索无结果', { sxPick: { g: 'female', idx: null, name: '', title: '', q: '不存在的关键词' } }],
    ['我的作品（含回收站、未命名、转义）', { works: WORKS }],
    ['未知 homeMode', { homeMode: 'xyz' }],
  ]
  for (const hot of [undefined, HOT]) {
    for (const [name, seed] of SEEDS) {
      it(`${name}${hot ? '（有 /hot）' : '（无 /hot）'}`, async () => {
        const o = await start(seed, hot)
        expect(o.fetches).toEqual(['/hot'])
      })
    }
  }
})

describe('剧本热点七星：内置示例与时间范围', () => {
  it('切换 1 小时、7 天、24 小时', async () => {
    await start()
    for (const r of ['1h', '7d', '24h', '24h']) {
      await t.click(`#orbitRanges [data-r="${r}"]`)
      t.same()
    }
  })
  for (const [sel, n] of [['#orbitCore', 0], ['.planet', 0], ['.planet', 5], ['.rank-row', 3]] as const) {
    for (const r of ['1h', '24h', '7d']) {
      it(`点 ${sel}[${n}]（${r}）：写 chat、vibeCard、pro，跳 #/script`, async () => {
        await start({ chat: { style: '水墨', ai: 'GPT', depth: '重度', extra: 1 } })
        await t.click(`#orbitRanges [data-r="${r}"]`)
        await t.click(sel, n)
        const o = t.same()
        expect(o.hash).toBe('#/script')
        expect(o.storage['pl.pro']).toBe('true')
      })
    }
  }
  it('pl.chat 为字符串 null 时用默认值', async () => {
    await start({ chat: null })
    await t.click('.planet', 2)
    t.same()
  })
})

describe('剧本热点七星：/hot 实时数据', () => {
  it('有数据：页签、配色、星体、排行；逐个切页签', async () => {
    await start({}, HOT)
    const tabs = ['热点', '爆款', '社会', '娱乐', '财经', '科技', '生活']
    for (const k of tabs) {
      await t.click(`#hseg [data-h="${k}"]`)
      t.same()
    }
    expect(t.old.root().querySelectorAll('#hseg button').length).toBe(7)
  })
  for (const k of ['热点', '爆款', '社会', '娱乐']) {
    for (const [sel, n] of [['#orbitCore', 0], ['.planet', 0], ['.rank-row', 1]] as const) {
      it(`页签 ${k} 点 ${sel}[${n}]：带灵感进氛围写作`, async () => {
        await start({}, HOT)
        await t.click(`#hseg [data-h="${k}"]`)
        if (t.old.root().querySelectorAll(sel)[n]) await t.click(sel, n)
        t.same()
      })
    }
  }
  it('成功后不再请求；切到角色库再切回', async () => {
    await start({}, HOT)
    await t.click('#modeSeg [data-m="lib"]')
    await t.settle()
    t.same()
    await t.click('#modeSeg [data-m="create"]')
    await t.settle()
    expect(t.same().fetches).toEqual(['/hot'])
  })
  it('失败（503）后每次切换模式都重新请求', async () => {
    await start()
    await t.click('#modeSeg [data-m="lib"]')
    await t.settle()
    await t.click('#modeSeg [data-m="lib"]')
    await t.settle()
    expect(t.same().fetches).toEqual(['/hot', '/hot', '/hot'])
  })
  it('topics 为空不缓存，继续用内置示例', async () => {
    await start({}, { topics: [], works: HOT.works })
    await t.click('#modeSeg [data-m="create"]')
    await t.settle()
    expect(t.same().fetches).toEqual(['/hot', '/hot'])
  })
  for (const [len, idea] of [[8, '一二三四五六七八'], [9, '一二三四五六七八九']] as const) {
    it(`灵感 ${len} 个字：超过 8 个字才用灵感作起手故事`, async () => {
      await start({}, { topics: [{ t: '边界', cat: '社会', ideas: [idea] }], works: [] })
      await t.click('#orbitCore')
      expect(JSON.parse(t.same().storage['pl.chat']).pitch).toBe(len > 8 ? idea : '边界')
    })
  }
  it('有数据但当前分类为空时回落内置示例，点星体用内置起手故事', async () => {
    await start({}, { topics: [{ t: '只有一条', cat: '社会', ideas: ['一条足够长的社会热点灵感'] }], works: [] })
    await t.click('#hseg [data-h="爆款"]')
    t.same()
    await t.click('.planet', 1)
    t.same()
  })
})

describe('开阳角色七星（角色库模式）', () => {
  for (const [sel, n] of [['#orbitCore', 0], ['.planet', 2], ['.rank-row', 4]] as const) {
    it(`点 ${sel}[${n}]：选角色、记住角色库位置、整页重画并滚到角色库`, async () => {
      await start({ homeMode: 'lib', sxPick: { g: 'male', idx: 2, name: '林骁', title: 't', q: 'q' } })
      await t.click('#orbitRanges [data-r="7d"]')
      await t.click(sel, n)
      t.same()
      await t.advance(16)
      expect(t.same().scrolls).toEqual(['mLib|{"behavior":"smooth","block":"start"}'])
      await t.settle()
      t.same()
    })
  }
  it('排行“角色库”按钮', async () => {
    await start({ homeMode: 'lib' })
    await t.click('[data-view="5"]')
    await t.advance(16)
    t.same()
  })
  it('排行“开剧本”按钮：切到创作平台并滚到角色卡', async () => {
    await start({ homeMode: 'lib' })
    await t.click('[data-write="1"]')
    await t.advance(16)
    const o = t.same()
    expect(o.storage['pl.homeMode']).toBe('"create"')
    expect(o.scrolls).toEqual(['roles|{"behavior":"smooth","block":"start"}'])
  })
})

describe('重画时行星与排行节点重建（轨道动画从头开始）', () => {
  const alive = (els: Element[]) => els.map((e) => e.isConnected)
  const grab = (side: Twin['old'] | Twin['neu']) => [...side.root().querySelectorAll('.planet-path, .rank-row')]
  const ACTIONS: [string, unknown, () => Promise<void>][] = [
    ['切时间范围', undefined, () => t.click('#orbitRanges [data-r="7d"]')],
    ['切模式', undefined, () => t.click('#modeSeg [data-m="create"]')],
    ['切热点页签', HOT, () => t.click('#hseg [data-h="热点"]')],
    ['/hot 返回', gated(HOT), () => t.release()],
    ['改主角名（不重画七星）', undefined, () => t.input('#sxName', '某人')],
  ]
  for (const [name, hot, act] of ACTIONS) {
    it(name, async () => {
      t = await twin({}, hot, eq)
      await t.settle()
      const o = grab(t.old), n = grab(t.neu)
      await act()
      t.same()
      expect(alive(n)).toEqual(alive(o))
      expect(alive(o).some(Boolean)).toBe(name.includes('不重画'))
    })
  }
})

describe('轨道舞台：悬停减速与鼠标落星', () => {
  it('移入 0.3、移出 1', async () => {
    await start()
    await t.mouse('mouseenter')
    await t.mouse('mouseleave')
    expect(t.same().rates).toEqual([0.3, 1])
  })
  it('落星：35 毫秒节流、900 毫秒后移除、颜色随板块', async () => {
    await start({}, HOT)
    t.old.perfNow = t.neu.perfNow = 2000
    await t.mouse('mousemove', { clientX: 40, clientY: 50 })
    t.same()
    t.old.perfNow = t.neu.perfNow = 2020
    await t.mouse('mousemove', { clientX: 41, clientY: 51 })
    t.same()
    t.old.perfNow = t.neu.perfNow = 2040
    await t.mouse('mousemove', { clientX: 60, clientY: 70 })
    const o = t.same()
    expect(t.old.root().querySelectorAll('.star-fall').length).toBe(2)
    expect(J(o.html)).toContain('star-fall')
    await t.advance(900)
    t.same()
    expect(t.neu.root().querySelectorAll('.star-fall').length).toBe(0)
  })
  it('减少动态偏好时不落星', async () => {
    await start()
    t.old.win.matchMedia = () => ({ matches: true })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    t.old.perfNow = t.neu.perfNow = 5000
    await t.mouse('mousemove', { clientX: 1, clientY: 1 })
    t.same()
    expect(t.neu.root().querySelectorAll('.star-fall').length).toBe(0)
  })
})

describe('创作平台：角色卡、搜索、dock', () => {
  it('选角色（没名字时随机取名）、再选不换名、换频道清空、同频道不动', async () => {
    await start()
    await t.click('.role', 2)
    t.same()
    await t.click('.role', 5)
    t.same()
    await t.click('#gseg [data-g="male"]')
    t.same()
    await t.click('#gseg [data-g="female"]')
    t.same()
    await t.click('.role', 0)
    t.same()
  })
  it('搜索：输入、无结果、清空', async () => {
    await start()
    for (const q of ['系统', '系统 ', 'zzz', '']) {
      await t.input('#sxq', q)
      t.same()
    }
  })
  it('改主角名同步剧名；清空名字；改剧名；骰子', async () => {
    await start({ sxPick: { g: 'male', idx: 1, name: '陆沉', title: '陆沉归来，陆沉不装了', q: '' } })
    for (const v of ['陆', '', '秦野']) {
      await t.input('#sxName', v)
      t.same()
    }
    await t.input('#sxTitle', '新剧名')
    t.same()
    await t.input('#sxName', '沈渊')
    t.same()
    await t.click('#dice')
    t.same()
    await t.click('#dice')
    t.same()
  })
  it('一键产出：没选主角时提示、滚动、闪烁 2.1 秒', async () => {
    await start()
    await t.click('#magic')
    const o = t.same()
    expect(o.toasts).toEqual(['先选一个主角'])
    expect(t.neu.root().querySelector('#roles')!.classList.contains('flash')).toBe(true)
    await t.advance(2099)
    t.same()
    expect(t.neu.root().querySelector('#roles')!.classList.contains('flash')).toBe(true)
    await t.advance(1)
    t.same()
    expect(t.neu.root().querySelector('#roles')!.classList.contains('flash')).toBe(false)
  })
  const PICKS: [string, unknown][] = [
    ['有名字有剧名', { g: 'male', idx: 4, name: ' 林骁 ', title: ' 林骁的逆袭 ', q: '' }],
    ['名字为空', { g: 'female', idx: 2, name: '', title: '', q: '' }],
    ['名字只有空白', { g: 'male', idx: 0, name: '  ', title: '', q: 'x' }],
    ['剧名为空', { g: 'female', idx: 9, name: '许微', title: '   ', q: '' }],
  ]
  for (const [name, pick] of PICKS) {
    it(`一键产出（${name}）：写 works、清 sxPick、跳结果页、触发推送`, async () => {
      await start({ sxPick: pick, works: WORKS })
      await t.click('#magic')
      const o = t.same()
      expect(o.hash).toMatch(/^#\/script\/s\/s[0-9a-z]+\?new=1$/)
      expect(o.storage['pl.sxPick']).toBe('null')
      expect(o.pushes).toBe(1)
    })
  }
  it('选角色后一键产出（完整流程）', async () => {
    await start()
    await t.click('#gseg [data-g="female"]')
    await t.click('.role', 7)
    await t.input('#sxTitle', '')
    await t.click('#magic')
    t.same()
  })
})

describe('角色库导航', () => {
  it('root → 男频 → 详情 → 返回 → 返回；服装库、发型库、女频往返', async () => {
    await start({ homeMode: 'lib' })
    const steps = ['.lt[data-g="male"]', '.lt[data-i="6"]', '#libBack', '#libBack', '.lt[data-w="cloth"]', '#libBack', '.lt[data-g="female"]', '#libBack', '.lt[data-w="hair"]', '#libBack']
    for (const s of steps) {
      await t.click(s)
      t.same()
    }
  })
  it('wip 修正后的 nav 在下一次导航时写回', async () => {
    await start({ homeMode: 'lib', libNav: { lv: 'g', g: 'cloth', i: 1 } })
    await t.click('#libBack')
    expect(t.same().storage['pl.libNav']).toBe(J({ lv: 'root', g: 'male', i: 1 }))
  })
  it('切到创作平台再切回：角色库内容保留、homeMode 写入', async () => {
    await start()
    await t.click('#modeSeg [data-m="lib"]')
    t.same()
    await t.click('.lt[data-g="female"]')
    await t.click('#modeSeg [data-m="create"]')
    t.same()
    await t.click('#modeSeg [data-m="create"]')
    t.same()
    await t.click('#modeSeg [data-m="lib"]')
    t.same()
  })
  for (const [name, pick] of [
    ['同频道、已有名字', { g: 'female', idx: 1, name: '苏晚', title: '苏晚不回头', q: '' }],
    ['不同频道（清空名字与剧名）', { g: 'male', idx: 1, name: '陆沉', title: '陆沉归来', q: '' }],
    ['同频道、没名字', { g: 'female', idx: null, name: '', title: '', q: '' }],
    ['搜索词把该角色过滤掉（没有可滚动的卡片）', { g: 'male', idx: 1, name: '陆沉', title: '陆沉归来', q: 'x' }],
  ] as const) {
    it(`用这个角色写剧本（${name}）`, async () => {
      await start({ homeMode: 'lib', libNav: { lv: 'role', g: 'female', i: 4 }, sxPick: pick })
      await t.click('#libUse')
      const o = t.same()
      expect(o.toasts).toEqual(['已选好主角，按\u300c一键产出剧本\u300d'])
      expect(o.scrolls).toEqual(pick.q ? [] : ['role on|{"behavior":"smooth","block":"center"}'])
      await t.settle()
      t.same()
    })
  }
  it('做角色设定板：写 assetPick 并跳资产库', async () => {
    await start({ homeMode: 'lib', libNav: { lv: 'role', g: 'male', i: 8 } })
    await t.click('#libAsset')
    const o = t.same()
    expect(o.hash).toBe('#/assets/role-board')
    expect(JSON.parse(o.storage['pl.assetPick']).fn).toBe('role-board')
  })
})

/**
 * 旧 viewScriptSimple 的 24 个事件绑定逐个对应：每个事件先建好前置状态，触发一次，
 * 断言新旧所有可观测状态相等，且该事件确实产生了可见效果（不是空操作）。
 */
describe('24 个事件逐个对照', () => {
  type Step = () => Promise<void>
  const lib = { homeMode: 'lib' }
  const picked = { sxPick: { g: 'male', idx: 2, name: '林骁', title: '林骁归来', q: '' } }
  const EVENTS: [number, string, Record<string, unknown>, unknown, Step | null, () => Step][] = [
    [1, '#orbitCore onclick', {}, undefined, null, () => () => t.click('#orbitCore')],
    [2, '.planet onclick', {}, HOT, null, () => () => t.click('.planet', 3)],
    [3, '.rank-row[data-star] onclick', {}, undefined, null, () => () => t.click('.rank-row', 6)],
    [4, '[data-view] onclick', lib, undefined, null, () => () => t.click('[data-view="2"]')],
    [5, '[data-write] onclick', lib, undefined, null, () => () => t.click('[data-write="3"]')],
    [6, '#orbitStage onmouseenter', {}, undefined, null, () => () => t.mouse('mouseenter')],
    [7, '#orbitStage onmouseleave', {}, undefined, null, () => () => t.mouse('mouseleave')],
    [8, '#orbitStage onmousemove', {}, undefined, null, () => () => t.mouse('mousemove', { clientX: 9, clientY: 9 })],
    [9, '#hseg [data-h] onclick', {}, HOT, null, () => () => t.click('#hseg [data-h="娱乐"]')],
    [10, '#orbitRanges button onclick', {}, undefined, null, () => () => t.click('#orbitRanges [data-r="1h"]')],
    [11, '.role onclick', {}, undefined, null, () => () => t.click('.role', 4)],
    [12, '#gseg button onclick', picked, undefined, null, () => () => t.click('#gseg [data-g="female"]')],
    [13, '#sxq oninput', {}, undefined, null, () => () => t.input('#sxq', '千金')],
    [14, '#sxName oninput', picked, undefined, null, () => () => t.input('#sxName', '顾承')],
    [15, '#sxTitle oninput', picked, undefined, null, () => () => t.input('#sxTitle', '新的剧名')],
    [16, '#dice onclick', picked, undefined, null, () => () => t.click('#dice')],
    [17, '#magic onclick', picked, undefined, null, () => () => t.click('#magic')],
    [18, '#libBack onclick', { ...lib, libNav: { lv: 'role', g: 'female', i: 3 } }, undefined, null, () => () => t.click('#libBack')],
    [19, '.lt[data-g] onclick', lib, undefined, null, () => () => t.click('.lt[data-g="female"]')],
    [20, '.lt[data-w] onclick', lib, undefined, null, () => () => t.click('.lt[data-w="hair"]')],
    [21, '.lt[data-i] onclick', { ...lib, libNav: { lv: 'g', g: 'male', i: 0 } }, undefined, null, () => () => t.click('.lt[data-i="9"]')],
    [22, '#libUse onclick', { ...lib, libNav: { lv: 'role', g: 'male', i: 5 } }, undefined, null, () => () => t.click('#libUse')],
    [23, '#libAsset onclick', { ...lib, libNav: { lv: 'role', g: 'female', i: 9 } }, undefined, null, () => () => t.click('#libAsset')],
    [24, '#modeSeg button onclick', {}, undefined, null, () => () => t.click('#modeSeg [data-m="lib"]')],
  ]
  it('事件编号 1–24 齐全、选择器不重复', () => {
    expect(EVENTS.map((e) => e[0])).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
    expect(new Set(EVENTS.map((e) => e[1])).size).toBe(24)
  })
  for (const [n, name, seed, hot, , step] of EVENTS) {
    it(`事件 ${n}：${name}`, async () => {
      const before = J(await start(seed, hot))
      await step()()
      const after = t.same()
      expect(J(after), '事件没有产生可见效果').not.toBe(before)
      await t.advance(16)
      await t.settle()
      t.same()
    })
  }
})
