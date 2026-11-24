import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAKE, NOW, type Twin, type TwinOptions, teardown, twin } from './assets-twin'

vi.mock('../../src/data', async () => {
  const { loadData } = await import('./data')
  return { DATA: loadData(), API_BASE: '', parseData: JSON.parse }
})

/**
 * 资产首页对照：旧 viewAssets（site-template.html 第 1278–1309 行）与新 AssetsHomePage 双跑（见 assets-twin.tsx），
 * 每步操作后比较 #view DOM、localStorage 原文、hash、请求、提示条、confirm、剪贴板。
 */

const eq = (a: unknown, b: unknown, m: string) => expect(a, m).toStrictEqual(b)
const J = JSON.stringify

export const ASSETS = [
  { fn: 'role-board', name: '沈清辞', prompt: '根据图1……角色\u300c沈清辞\u300d', state: { name: '沈清辞', profile: '侯府嫡女', extra: '', style: '无', ratio: '16:9', res: '2K', opts: [] }, time: 3 },
  { fn: 'scene-var', name: '', prompt: '雨夜 <b>&"', state: { name: '', profile: '', extra: '', style: '2D 动漫', ratio: '9:16', res: '4K', opts: ['白天'] }, time: 2 },
  { fn: 'gone-fn', name: '<i>未知功能</i>', prompt: 'x', state: { name: '', profile: '', extra: '', style: '无', ratio: '1:1', res: '1K', opts: [] }, time: 1 },
  { fn: 'scene-empty', state: { name: 'n', profile: '', extra: '', style: '无', ratio: '16:9', res: '2K', opts: ['全景'] } },
]
export const SEED = {
  wid: 'wv1',
  title: '重生<之>侯府',
  items: [
    { fn: 'role-board', label: '沈清辞', name: '沈清辞', profile: '侯府嫡女，隐忍', sub: '女主' },
    { fn: 'role-board', label: 'Kevin', name: 'Kevin', profile: '混血管家', done: true },
    { fn: 'scene-board', label: '侯府正厅', name: '侯府正厅', profile: '雕梁画栋' },
  ],
}
const VIBE = [{ id: 'wv1', kind: 'vibe', title: '重生之侯府', W: {}, time: 1 }]

let t: Twin
beforeEach(() => {
  vi.useFakeTimers({ toFake: [...FAKE] })
})
afterEach(() => {
  teardown(t)
  vi.useRealTimers()
})

async function start(opt: TwinOptions, hash = '#/assets') {
  t = await twin(opt, eq, hash)
  return t.same()
}
/** 旧页面 #view 的文字与 HTML（断言里用来确认渲染了预期内容，避免两边都空白时“相等”）。 */
const text = (_o?: unknown) => t.old.s.root().textContent + '\n' + t.old.s.root().innerHTML

describe('初次渲染', () => {
  const CASES: [string, TwinOptions, string[]][] = [
    ['空存储', {}, ['选择起点，建立天玑资产', '0 个', '还没有资产']],
    ['我的资产：角色、场景、未知功能、缺名称与提示词、转义', { seed: { assets: ASSETS } }, ['4 个', '沈清辞', '未命名', '<i>未知功能</i>', '昼夜天气变体', 'undefined']],
    ['导入条：第一项待做、英文名补空格、标题转义', { seed: { assetSeed: SEED } }, ['从《重生<之>侯府》导入完成', 'Kevin 设定板', '侯府正厅设定板', '#/storyboard']],
    ['导入条：作品存在且是氛围写作，去分镜指向作品分镜页', { seed: { assetSeed: SEED, works: VIBE } }, ['#/script/v/wv1/board']],
    ['导入条：作品存在但不是氛围写作', { seed: { assetSeed: SEED, works: [{ ...VIBE[0], kind: 'simple' }] } }, ['#/storyboard']],
    ['导入条：作品存在但没有 kind（五步表单作品）', { seed: { assetSeed: SEED, works: [{ id: 'wv1', title: '表单剧', W: {}, time: 1 }] } }, ['#/storyboard']],
    ['导入条：全部完成，去分镜不再是 soft', { seed: { assetSeed: { ...SEED, items: SEED.items.map((x) => ({ ...x, done: true })) } } }, ['去分镜']],
    ['导入条：没有标题、空清单', { seed: { assetSeed: { wid: 'x', items: [] } } }, ['从《undefined》导入完成']],
    ['导入条与我的资产同时存在', { seed: { assetSeed: SEED, assets: ASSETS.slice(0, 2) } }, ['2 个']],
    ['assetSeed 为 null、assets 为 null（原文）', { raw: { 'pl.assetSeed': 'null', 'pl.assets': 'null' } }, ['0 个']],
    ['assets 原文损坏', { raw: { 'pl.assets': '[{' } }, ['0 个']],
  ]
  for (const [name, opt, has] of CASES)
    it(name, async () => {
      const o = await start(opt)
      for (const h of has) expect(text(o)).toContain(h)
      expect(t.oldErrors()).toEqual([])
    })

  it('悬停卡的预览格：自定义属性 --g 与 grid-row 写进样式', async () => {
    const o = await start({})
    expect(J(o.html)).toContain('--g: linear-gradient(160deg,#4a5d78,#1f2633); grid-row: span 2;')
  })
})

describe('事件：导入条', () => {
  it('data-seed：写 assetPick（带 k、wid）并跳到对应编辑器，编辑器带入名称与档案', async () => {
    await start({ seed: { assetSeed: SEED } })
    await t.click('[data-seed]', 2)
    const o = t.same()
    expect(o.hash).toBe('#/assets/scene-board')
    // 编辑器读完 assetPick 立即置 null
    expect(o.storage['pl.assetPick']).toBe('null')
    expect(text(o)).toContain('侯府正厅')
  })
  it('data-seed：已有 k、wid 的清单项被覆盖成当前序号与作品，保存时标记的是这一项', async () => {
    const sd = { wid: 'w2', title: 't', items: [{ fn: 'role-new', label: 'B' }, { k: 9, wid: 'old', fn: 'role-new', label: 'A', name: 'A', profile: 'p' }] }
    await start({ seed: { assetSeed: sd } })
    await t.click('[data-seed]', 1)
    expect(t.same().hash).toBe('#/assets/role-new')
    await t.click('#save')
    const o = t.same()
    expect(JSON.parse(o.storage['pl.assetSeed']).items[1].done).toBe(true)
  })
  it('data-seed：清单项的功能不在菜单里时编辑器回落首页，assetPick 原文保留（含键顺序）', async () => {
    const sd = { wid: 'w3', title: 't', items: [{ fn: 'gone-fn', label: 'X', name: 'X', profile: 'p', sub: 's' }] }
    await start({ seed: { assetSeed: sd } })
    await t.click('[data-seed]', 0)
    const o = t.same()
    expect(o.storage['pl.assetPick']).toBe(J({ fn: 'gone-fn', label: 'X', name: 'X', profile: 'p', sub: 's', k: 0, wid: 'w3' }))
  })
  it('data-seed：点已完成的项也能进入', async () => {
    await start({ seed: { assetSeed: SEED } })
    await t.click('[data-seed]', 1)
    expect(text(t.same())).toContain('Kevin')
  })
  it('seedX：关闭导入条，assetSeed 写 null 并重画', async () => {
    await start({ seed: { assetSeed: SEED, assets: ASSETS.slice(0, 1) } })
    await t.click('#seedX')
    const o = t.same()
    expect(o.storage['pl.assetSeed']).toBe('null')
    expect(text(o)).not.toContain('导入完成')
  })
  it('去分镜链接：点击后跳转', async () => {
    await start({ seed: { assetSeed: SEED, works: VIBE } })
    await t.click('.seed-go')
    // 作品页归 P5-B（旧作品页打开时会写 lastVibe 等），这里只比较 hash
    expect(t.old.s.win.location.hash).toBe('#/script/v/wv1/board')
    expect(location.hash).toBe('#/script/v/wv1/board')
  })
})

describe('事件：我的资产', () => {
  it('data-cp：复制提示词，提示条，按钮 1.3 秒内显示已复制', async () => {
    await start({ seed: { assets: ASSETS } })
    await t.click('.acts .secondary', 1)
    let o = t.same()
    expect(o.clips).toEqual(['雨夜 <b>&"'])
    expect(o.toasts).toEqual(['已复制到剪贴板'])
    expect(text(o)).toContain('已复制')
    await t.advance(1299)
    t.same()
    await t.advance(1)
    o = t.same()
    expect(text(o)).not.toContain('已复制')
  })
  it('data-cp：剪贴板不可用时退回 execCommand', async () => {
    await start({ seed: { assets: ASSETS }, clipboardFails: true })
    await t.click('.acts .secondary', 0)
    const o = t.same()
    expect(o.execs).toEqual(['copy:根据图1……角色\u300c沈清辞\u300d'])
  })
  // f331924 去掉了每张卡的“删除”（data-del），改成“删除资产”进入选择模式、批量移到回收桶（旧 pickMode）
  const fns = (raw: string | undefined) => (JSON.parse(raw ?? 'null') || []).map((a: { fn: string }) => a.fn)
  it('删除资产：进入选择模式，底栏打开，卡片带勾选框；再点一次退出', async () => {
    await start({ seed: { assets: ASSETS } })
    await t.click('#asPick')
    let o = t.same()
    expect(text(o)).toContain('已选 <b>0</b> 个')
    expect(text(o)).toContain('grid picking')
    await t.click('#asPick')
    o = t.same()
    expect(text(o)).not.toContain('picking')
  })
  it('勾选两张后移到回收桶：确认框问话、按勾选顺序放进回收桶最前、提示条、重画出回收桶入口', async () => {
    await start({ seed: { assets: ASSETS, assetsTrash: [{ fn: 'role-new', name: '旧', trashed: NOW - 864e5 }] } })
    await t.click('#asPick')
    await t.click('[data-ak]', 3)
    await t.click('[data-ak]', 1)
    let o = t.same()
    expect(text(o)).toContain('已选 <b>2</b> 个')
    await t.click('[data-pk=go]')
    o = t.same()
    expect(o.confirms).toEqual(['把 2 个移到回收桶？\n30 天内可以在回收桶还原，之后会永久删除。'])
    expect(fns(o.storage['pl.assets'])).toEqual(['role-board', 'gone-fn'])
    expect(JSON.parse(o.storage['pl.assetsTrash'])).toEqual([{ ...ASSETS[3], trashed: NOW }, { ...ASSETS[1], trashed: NOW }, { fn: 'role-new', name: '旧', trashed: NOW - 864e5 }])
    expect(o.toasts).toEqual(['已移到回收桶（2 个）'])
    expect(text(o)).toContain('回收桶 3')
    expect(text(o)).not.toContain('picking')
  })
  it('确认框取消：不改存储，仍在选择模式', async () => {
    await start({ seed: { assets: ASSETS }, confirms: [false] })
    await t.click('#asPick')
    await t.click('[data-ak]', 0)
    await t.click('[data-pk=go]')
    const o = t.same()
    expect(o.confirms).toHaveLength(1)
    expect(o.storage['pl.assets']).toBe(J(ASSETS))
    expect(o.storage['pl.assetsTrash']).toBeUndefined()
    expect(text(o)).toContain('已选 <b>1</b> 个')
  })
  it('再点已勾的卡取消勾选；一张没选时“移到回收桶”禁用，点了不问', async () => {
    await start({ seed: { assets: ASSETS } })
    await t.click('#asPick')
    await t.click('[data-ak]', 2)
    await t.click('[data-ak]', 2)
    await t.click('[data-pk=go]')
    const o = t.same()
    expect(o.confirms).toEqual([])
    expect(text(o)).toContain('disabled')
  })
  it('全选补齐已选集合（先勾的排在前），移完显示空状态，只剩回收桶入口', async () => {
    await start({ seed: { assets: ASSETS } })
    await t.click('#asPick')
    await t.click('[data-ak]', 2)
    await t.click('[data-pk=all]')
    t.same()
    await t.click('[data-pk=go]')
    const o = t.same()
    expect(fns(o.storage['pl.assetsTrash'])).toEqual(['gone-fn', 'role-board', 'scene-var', 'scene-empty'])
    expect(o.storage['pl.assets']).toBe('[]')
    expect(text(o)).toContain('还没有资产')
    expect(text(o)).toContain('回收桶 4')
    expect(text(o)).not.toContain('asPick')
  })
  it('取消：退出选择模式并清空已选', async () => {
    await start({ seed: { assets: ASSETS } })
    await t.click('#asPick')
    await t.click('[data-ak]', 0)
    await t.click('[data-pk=x]')
    const o = t.same()
    expect(text(o)).toContain('已选 <b>0</b> 个')
    expect(text(o)).not.toContain('picking')
  })
  it('选择模式下点“打开”“复制提示词”只切换勾选，不跳转、不复制', async () => {
    await start({ seed: { assets: ASSETS } })
    await t.click('#asPick')
    await t.click('.acts .primary', 1)
    await t.click('.acts .secondary', 0)
    const o = t.same()
    expect(o.hash).toBe('#/assets')
    expect(o.clips).toEqual([])
    expect(text(o)).toContain('已选 <b>2</b> 个')
  })
  it('不在选择模式时点卡片没有反应', async () => {
    await start({ seed: { assets: ASSETS } })
    await t.click('[data-ak] .s', 0)
    expect(text(t.same())).toContain('已选 <b>0</b> 个')
  })
  it('删除后复制按钮的已复制状态随重画复原', async () => {
    await start({ seed: { assets: ASSETS } })
    await t.click('.acts .secondary', 0)
    await t.click('#asPick')
    await t.click('[data-ak]', 3)
    await t.click('[data-pk=go]')
    t.same()
  })
  it('进入首页先清掉回收桶里的过期资产，入口计数按清理后算', async () => {
    const o = await start({ seed: { assetsTrash: [{ fn: 'role-new', name: '新', trashed: NOW }, { fn: 'role-new', name: '过期', trashed: NOW - 31 * 864e5 }] } })
    expect(JSON.parse(o.storage['pl.assetsTrash'])).toEqual([{ fn: 'role-new', name: '新', trashed: NOW }])
    expect(text(o)).toContain('回收桶 1')
  })
  it('回收桶入口：跳到资产回收桶', async () => {
    await start({ seed: { assetsTrash: [{ fn: 'scene-var', name: '雨夜', trashed: NOW }] } })
    await t.click('a[href="#/assets-trash"]')
    const o = t.same()
    expect(o.hash).toBe('#/assets-trash')
    expect(text(o)).toContain('剩 30 天')
  })
  it('打开：进入编辑器并载入已存状态', async () => {
    await start({ seed: { assets: ASSETS } })
    await t.click('.acts .primary', 1)
    const o = t.same()
    expect(o.hash).toBe('#/assets/scene-var?i=1')
    expect(text(o)).toContain('9:16 · 4K')
  })
  it('打开未知功能的资产：编辑器回落到资产首页', async () => {
    await start({ seed: { assets: ASSETS } })
    await t.click('.acts .primary', 2)
    const o = t.same()
    expect(o.hash).toBe('#/assets/gone-fn?i=2')
    expect(text(o)).toContain('选择起点')
  })
})

describe('菜单卡', () => {
  for (const n of [0, 3, 4, 7])
    it(`第 ${n} 个功能链接进入编辑器`, async () => {
      await start({})
      await t.click('.mi', n)
      const o = t.same()
      expect(o.hash).toMatch(/^#\/assets\/(role|scene)-/)
      expect(text(o)).toContain('保存到我的资产')
    })
})
