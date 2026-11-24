import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAKE, NOW, type Twin, type TwinOptions, teardown, twin } from './assets-twin'

vi.mock('../../src/data', async () => {
  const { loadData } = await import('./data')
  return { DATA: loadData(), API_BASE: '', parseData: JSON.parse }
})

/**
 * 资产回收桶对照：旧 viewAssetTrash（site-template.html 第 3374 行，f331924 新增）与新 AssetTrashPage 双跑（见 assets-twin.tsx），
 * 每步操作后比较 #view DOM、localStorage 原文、hash、请求、提示条、confirm。
 */

const eq = (a: unknown, b: unknown, m: string) => expect(a, m).toStrictEqual(b)
const J = JSON.stringify
const DAY = 864e5

/** 同 assets-home.test.tsx 的 ASSETS（不从那里 import：会把那边的用例在本文件再跑一遍）。 */
const ASSETS = [
  { fn: 'role-board', name: '沈清辞', prompt: '根据图1……角色\u300c沈清辞\u300d', state: { name: '沈清辞', profile: '侯府嫡女', extra: '', style: '无', ratio: '16:9', res: '2K', opts: [] }, time: 3 },
  { fn: 'scene-var', name: '', prompt: '雨夜 <b>&"', state: { name: '', profile: '', extra: '', style: '2D 动漫', ratio: '9:16', res: '4K', opts: ['白天'] }, time: 2 },
  { fn: 'gone-fn', name: '<i>未知功能</i>', prompt: 'x', state: { name: '', profile: '', extra: '', style: '无', ratio: '1:1', res: '1K', opts: [] }, time: 1 },
  { fn: 'scene-empty', state: { name: 'n', profile: '', extra: '', style: '无', ratio: '16:9', res: '2K', opts: ['全景'] } },
]

/** 回收桶种子：剩 30、29、1 天各一项，含未知功能、缺名称、需要转义的名称。 */
const TRASH = [
  { ...ASSETS[0], trashed: NOW },
  { ...ASSETS[1], trashed: NOW - DAY - 1 },
  { ...ASSETS[2], trashed: NOW - 29 * DAY },
  { ...ASSETS[3], trashed: NOW - 30 * DAY },
]
const EXPIRED = { fn: 'role-new', name: '过期', prompt: 'p', trashed: NOW - 30 * DAY - 1 }

let t: Twin
beforeEach(() => {
  vi.useFakeTimers({ toFake: [...FAKE] })
})
afterEach(() => {
  teardown(t)
  vi.useRealTimers()
})

async function start(opt: TwinOptions, hash = '#/assets-trash') {
  t = await twin(opt, eq, hash)
  return t.same()
}
const text = () => t.old.s.root().textContent + '\n' + t.old.s.root().innerHTML
const names = (raw: string | undefined) => (JSON.parse(raw ?? 'null') || []).map((a: { name?: string }) => a.name ?? null)

describe('进入回收桶', () => {
  it('空：没有清空按钮，显示空状态', async () => {
    const o = await start({})
    expect(text()).toContain('0 个 · 删除后保留 30 天')
    expect(text()).toContain('回收桶是空的。')
    expect(text()).not.toContain('trEmpty')
    expect(o.storage).toEqual({})
    expect(t.oldErrors()).toEqual([])
  })
  it('有数据：剩余天数、功能标签、未知功能、缺名称、转义；未过期时不写回', async () => {
    const o = await start({ seed: { assetsTrash: TRASH } })
    for (const h of ['4 个', '剩 30 天', '剩 29 天', '剩 1 天', '剩 0 天', '角色设定板', '&lt;i&gt;未知功能&lt;/i&gt;', '未命名', '清空回收桶']) expect(text()).toContain(h)
    expect(o.storage['pl.assetsTrash']).toBe(J(TRASH))
    expect(t.oldErrors()).toEqual([])
  })
  it('已过期的清理：超过 30 天的项被清掉并写回，不显示', async () => {
    const o = await start({ seed: { assetsTrash: [EXPIRED, ...TRASH] } })
    expect(o.storage['pl.assetsTrash']).toBe(J(TRASH))
    expect(text()).not.toContain('过期')
  })
  it('已过期的清理：缺 trashed 的项随过期项一起丢掉（旧比较写法）', async () => {
    const o = await start({ seed: { assetsTrash: [{ fn: 'role-new', name: '无时间' }, EXPIRED, TRASH[0]] } })
    expect(names(o.storage['pl.assetsTrash'])).toEqual(['沈清辞'])
  })
  it('只有缺 trashed 的项时不写回，照常显示', async () => {
    const o = await start({ seed: { assetsTrash: [{ fn: 'role-new', name: '无时间' }] } })
    expect(o.storage['pl.assetsTrash']).toBe(J([{ fn: 'role-new', name: '无时间' }]))
    expect(text()).toContain('无时间')
  })
  it('返回：回到资产首页', async () => {
    await start({ seed: { assetsTrash: TRASH } })
    await t.click('#pgBack')
    const o = t.same()
    expect(o.hash).toBe('#/assets')
    expect(text()).toContain('回收桶 4')
  })
})

describe('还原与删除', () => {
  it('还原：去掉 trashed 放回我的资产末尾，回收桶少一项，提示条', async () => {
    await start({ seed: { assets: [ASSETS[2]], assetsTrash: TRASH } })
    await t.click('[data-rs]', 1)
    const o = t.same()
    expect(o.storage['pl.assets']).toBe(J([ASSETS[2], ASSETS[1]]))
    expect(names(o.storage['pl.assetsTrash'])).toEqual(['沈清辞', '<i>未知功能</i>', null])
    expect(o.toasts).toEqual(['已还原'])
    expect(o.confirms).toEqual([])
  })
  it('还原：我的资产为空时新建清单；还原后首页能看到', async () => {
    await start({ seed: { assetsTrash: [TRASH[0]] } })
    await t.click('[data-rs]', 0)
    let o = t.same()
    expect(o.storage['pl.assets']).toBe(J([ASSETS[0]]))
    expect(text()).toContain('回收桶是空的。')
    await t.go('#/assets')
    o = t.same()
    expect(text()).toContain('1 个 · 只保存在这台电脑的浏览器里')
    expect(text()).not.toContain('#/assets-trash')
  })
  it('彻底删除：确认后移除，提示条', async () => {
    await start({ seed: { assetsTrash: TRASH } })
    await t.click('[data-rm]', 0)
    const o = t.same()
    expect(o.confirms).toEqual(['永久删除这个资产？删除后无法复原。'])
    expect(names(o.storage['pl.assetsTrash'])).toEqual(['', '<i>未知功能</i>', null])
    expect(o.toasts).toEqual(['已永久删除'])
  })
  it('彻底删除：取消则不改存储', async () => {
    await start({ seed: { assetsTrash: TRASH }, confirms: [false] })
    await t.click('[data-rm]', 2)
    const o = t.same()
    expect(o.storage['pl.assetsTrash']).toBe(J(TRASH))
    expect(o.toasts).toEqual([])
  })
  it('清空回收桶：确认后写空清单，显示空状态', async () => {
    await start({ seed: { assetsTrash: TRASH } })
    await t.click('#trEmpty')
    const o = t.same()
    expect(o.confirms).toEqual(['永久删除回收桶里全部 4 个资产？删除后无法复原。'])
    expect(o.storage['pl.assetsTrash']).toBe('[]')
    expect(text()).toContain('回收桶是空的。')
    expect(o.toasts).toEqual([])
  })
  it('清空回收桶：取消则不改存储', async () => {
    await start({ seed: { assetsTrash: TRASH }, confirms: [false] })
    await t.click('#trEmpty')
    expect(t.same().storage['pl.assetsTrash']).toBe(J(TRASH))
  })
})

describe('完整流程', () => {
  it('首页批量移入 → 入口进回收桶 → 还原一项、永久删除一项 → 回首页', async () => {
    await start({ seed: { assets: ASSETS } }, '#/assets')
    await t.click('#asPick')
    await t.click('[data-ak]', 0)
    await t.click('[data-ak]', 2)
    await t.click('[data-pk=go]')
    t.same()
    await t.click('a[href="#/assets-trash"]')
    let o = t.same()
    expect(o.hash).toBe('#/assets-trash')
    expect(text()).toContain('2 个 · 删除后保留 30 天')
    await t.click('[data-rs]', 1)
    t.same()
    await t.click('[data-rm]', 0)
    o = t.same()
    expect(o.storage['pl.assetsTrash']).toBe('[]')
    expect(names(o.storage['pl.assets'])).toEqual(['', null, '<i>未知功能</i>'])
    await t.click('#pgBack')
    o = t.same()
    expect(o.hash).toBe('#/assets')
    expect(text()).toContain('3 个')
    expect(o.toasts).toEqual(['已移到回收桶（2 个）', '已还原', '已永久删除'])
  })
})
