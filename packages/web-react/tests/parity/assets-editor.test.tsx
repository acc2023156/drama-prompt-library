import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAKE, NOW, type Twin, type TwinOptions, teardown, twin } from './assets-twin'

vi.mock('../../src/data', async () => {
  const { loadData } = await import('./data')
  return { DATA: loadData(), API_BASE: '', parseData: JSON.parse }
})

/**
 * 资产编辑器（节点编辑器）对照：旧 viewAssetEditor（site-template.html 第 1293–1408 行）与新 AssetEditorPage 双跑（见 assets-twin.tsx），
 * 每步操作后比较 #view DOM（含连线 SVG、提示词、表单值）、localStorage 原文、hash、提示条、剪贴板。
 */

const eq = (a: unknown, b: unknown, m: string) => expect(a, m).toStrictEqual(b)
const J = JSON.stringify

const FNS = ['role-new', 'role-board', 'role-close', 'role-split', 'scene-new', 'scene-board', 'scene-var', 'scene-empty']
const STATE = { name: '沈清辞', profile: '侯府嫡女', extra: '  多一点雨  ', style: '古风写实', ratio: '3:4', res: '4K', opts: ['夜晚', '白天'] }
const ASSETS = [
  { fn: 'scene-var', name: '雨巷', prompt: 'p0', state: { ...STATE, name: '雨巷' }, time: 5 },
  { fn: 'role-board', name: '沈清辞', prompt: 'p1', state: STATE, time: 4 },
]
const SEED = {
  wid: 'wv1',
  title: '重生之侯府',
  items: [
    { fn: 'role-board', label: '沈清辞', name: '沈清辞', profile: '侯府嫡女' },
    { fn: 'scene-board', label: '正厅', name: '正厅', profile: '雕梁画栋', done: true },
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

async function start(hash: string, opt: TwinOptions = {}) {
  t = await twin(opt, eq, hash)
  const o = t.same()
  expect(t.oldErrors()).toEqual([])
  return o
}
/** 旧页面当前的提示词与 #view 文字（断言用，确认内容确实渲染出来）。 */
const promptOf = () => (t.old.s.root().querySelector('#prompt') as HTMLTextAreaElement).value
const viewText = () => t.old.s.root().textContent || ''
const html = () => t.old.s.root().innerHTML
const assets = (o: { storage: Record<string, string> }) => JSON.parse(o.storage['pl.assets'])

describe('初次渲染：每个功能 × 新建 / 已存 / 带入', () => {
  for (const fn of FNS) {
    it(`${fn} 新建`, async () => {
      await start('#/assets/' + fn)
      expect(promptOf()).toContain('画面比例 16:9，2K 分辨率。')
      expect(html()).toContain('<path d="M')
    })
    it(`${fn} 编辑已存资产（state 来自另一个功能）`, async () => {
      const o = await start(`#/assets/${fn}?i=1`, { seed: { assets: ASSETS } })
      expect(o.storage['pl.assets']).toBe(J(ASSETS))
      expect(promptOf()).toContain('画面比例 3:4，4K 分辨率。')
      expect(promptOf()).toContain('\n补充：多一点雨')
      expect(promptOf()).toContain('\n风格：古风写实风格')
    })
    it(`${fn} 从导入条带入（assetPick 置 null）`, async () => {
      const o = await start('#/assets/' + fn, { seed: { assetSeed: SEED, assetPick: { ...SEED.items[0], fn, k: 0, wid: 'wv1' } } })
      expect(o.storage['pl.assetPick']).toBe('null')
      expect(promptOf()).toContain('沈清辞')
    })
  }
  const CASES: [string, string, TwinOptions][] = [
    ['assetPick 指向别的功能：不带入、不清除', '#/assets/role-new', { seed: { assetPick: { fn: 'role-board', name: 'A', profile: 'B' } } }],
    ['assetPick 缺 name、profile（显示 undefined）', '#/assets/role-board', { seed: { assetPick: { fn: 'role-board' } } }],
    ['已存资产时忽略 assetPick', '#/assets/role-board?i=0', { seed: { assets: ASSETS, assetPick: { fn: 'role-board', name: 'A', profile: 'B' } } }],
    ['?i= 超出范围按新建处理', '#/assets/role-board?i=9', { seed: { assets: ASSETS } }],
    ['?i= 非数字按新建处理', '#/assets/scene-var?i=abc', { seed: { assets: ASSETS } }],
    ['?i= 为空', '#/assets/scene-var?i=', { seed: { assets: ASSETS } }],
    ['名称含 $& 与模板占位符', '#/assets/role-board?i=0', { seed: { assets: [{ ...ASSETS[0], state: { ...STATE, name: '$&{profile}$$', profile: '{opts}' } }] } }],
    ['已存的风格不在列表里', '#/assets/scene-new?i=0', { seed: { assets: [{ ...ASSETS[0], state: { ...STATE, style: '不存在' } }] } }],
    ['我的自定义风格（asm.custom）', '#/assets/scene-new?i=0', { seed: { asm: { style: '__custom', custom: ' 赛博朋克霓虹 ' }, assets: [{ ...ASSETS[0], state: { ...STATE, style: '我的自定义' } }] } }],
    ['已存比例不在选项里', '#/assets/role-new?i=0', { seed: { assets: [{ ...ASSETS[0], state: { ...STATE, ratio: '2:1', res: '8K' } }] } }],
    ['未知功能回落到资产首页', '#/assets/nope', { seed: { assets: ASSETS } }],
    ['连线层被样式隐藏时不画', '#/assets/role-split', { wiresHidden: true }],
  ]
  for (const [name, hash, opt] of CASES) it(name, () => start(hash, opt))
  it('有语音识别时档案框带话筒', async () => {
    await start('#/assets/role-board', { speech: true })
    expect(html()).toContain('mic-w')
  })
})

describe('事件', () => {
  it('nm input：改名称重新生成提示词，“返回”变“储存并返回”', async () => {
    await start('#/assets/role-board')
    await t.input('#nm', '林骁')
    t.same()
    expect(promptOf()).toContain('\u300c林骁\u300d')
    expect(viewText()).toContain('储存并返回')
    await t.input('#nm', '')
    t.same()
    expect(promptOf()).toContain('\u300c角色名\u300d')
  })
  it('pf input：改档案；清空后显示（未填写）', async () => {
    await start('#/assets/scene-board')
    await t.input('#pf', '民国茶楼')
    t.same()
    expect(promptOf()).toContain('场景档案：民国茶楼')
    await t.input('#pf', '')
    t.same()
    expect(promptOf()).toContain('场景档案：（未填写）')
  })
  it('ratio change：改画面比例', async () => {
    await start('#/assets/role-close')
    await t.choose('#ratio', '21:9')
    t.same()
    expect(promptOf()).toContain('画面比例 21:9，2K 分辨率。')
    expect(viewText()).toContain('21:9 · 2K')
  })
  it('res change：改分辨率', async () => {
    await start('#/assets/role-close')
    await t.choose('#res', '1K')
    t.same()
    expect(promptOf()).toContain('画面比例 16:9，1K 分辨率。')
    expect(viewText()).toContain('16:9 · 1K')
  })
  it('.ck click：多选项开关，结果按选项原顺序', async () => {
    await start('#/assets/scene-var')
    await t.click('[data-o="白天"]')
    t.same()
    await t.click('[data-o="雪天"]')
    t.same()
    await t.click('[data-o="白天"]')
    t.same()
    expect(promptOf()).toContain('以下版本：白天、夜晚、雨天、雪天。')
    for (const o of ['白天', '夜晚', '雨天', '雪天']) await t.click(`[data-o="${o}"]`)
    t.same()
    expect(promptOf()).toContain('（未选择）')
  })
  it('.ck click：已存选项不在本功能里时按本功能重排', async () => {
    await start('#/assets/scene-var?i=0', { seed: { assets: [{ ...ASSETS[0], state: { ...STATE, opts: ['全景', '夜晚'] } }] } })
    await t.click('[data-o="黄昏"]')
    t.same()
    expect(promptOf()).toContain('以下版本：黄昏、夜晚。')
  })
  it('sbtn click：打开弹层并画风格格子；再点收起', async () => {
    await start('#/assets/role-new')
    await t.click('#sbtn')
    t.same()
    expect(html()).toContain('stylepop open')
    expect(html()).toContain('stile')
    await t.click('#sbtn')
    t.same()
    expect(html()).not.toContain('stylepop open')
  })
  it('spop click：弹层内点击不收起', async () => {
    await start('#/assets/role-new')
    await t.click('#sbtn')
    await t.click('#spop .sh')
    t.same()
    expect(html()).toContain('stylepop open')
  })
  it('document click：点页面其他地方收起弹层', async () => {
    await start('#/assets/role-new')
    await t.click('#sbtn')
    await t.click('.ed-head')
    t.same()
    expect(html()).not.toContain('stylepop open')
    await t.click('#sbtn')
    await t.clickBody()
    t.same()
    expect(html()).not.toContain('stylepop open')
  })
  for (const tab of ['我的风格', '真人', '2D', '3D', '官方'])
    it(`#stabs click：${tab}`, async () => {
      await start('#/assets/role-new')
      await t.click('#sbtn')
      await t.click(`[data-t="${tab}"]`)
      t.same()
    })
  it('#stabs click：我的风格（有自定义画风）', async () => {
    await start('#/assets/role-new', { seed: { asm: { style: '__custom', custom: '自定义画风' } } })
    await t.click('#sbtn')
    await t.click('[data-t="我的风格"]')
    t.same()
    expect(viewText()).toContain('我的自定义')
  })
  it('#stabs click：未打开弹层时切页签也重画格子', async () => {
    await start('#/assets/role-new')
    await t.click('[data-t="2D"]')
    t.same()
    expect(html()).toContain('2D 动漫')
  })
  it('sq input：搜索风格；无结果；与页签叠加', async () => {
    await start('#/assets/role-new')
    await t.click('#sbtn')
    await t.input('#sq', ' 写实 ')
    t.same()
    await t.input('#sq', '没有这种')
    t.same()
    expect(viewText()).toContain('没有符合的风格')
    await t.input('#sq', '动漫')
    await t.click('[data-t="3D"]')
    t.same()
  })
  it('.stile click：选中风格，提示词追加风格，弹层收起；格子高亮要等下次重画', async () => {
    await start('#/assets/role-new')
    await t.click('#sbtn')
    await t.click('.stile', 3)
    t.same()
    expect(promptOf()).toContain('\n风格：2D 日系动漫风格')
    expect(viewText()).toContain('2D 动漫')
    await t.click('#sbtn')
    t.same()
    await t.click('.stile', 0)
    t.same()
    expect(promptOf()).not.toContain('风格：')
  })
  it('file change 与 FileReader load：参考图预览进节点与图槽，不保存', async () => {
    await start('#/assets/role-split')
    await t.file(1, '服装.png')
    t.same()
    await t.flushReads()
    t.same()
    expect(html()).toContain('<img src="data:image/png;base64,')
    await t.file(0, '脸.jpg', 'image/jpeg')
    await t.flushReads()
    t.same()
    await t.file(0, null)
    await t.flushReads()
    t.same()
    await t.click('#save')
    const o = t.same()
    expect(o.storage['pl.assets']).not.toContain('data:')
  })
  it('resize：按新位置重画连线', async () => {
    await start('#/assets/role-split')
    const before = html()
    await t.resize(37.5)
    t.same()
    expect(html()).not.toBe(before)
  })
  it('prompt input：手改提示词后保存手改内容；再改表单会覆盖手改', async () => {
    await start('#/assets/role-new')
    await t.input('#prompt', '我自己写的提示词')
    t.same()
    expect(viewText()).toContain('储存并返回')
    await t.click('#save')
    let o = t.same()
    expect(assets(o)[0].prompt).toBe('我自己写的提示词')
    await t.input('#nm', 'A')
    o = t.same()
    expect(promptOf()).toContain('角色：A')
  })
})

describe('保存与返回', () => {
  it('save click：新建保存插到最前，提示条，“储存并返回”复原；再保存一次又插一条', async () => {
    await start('#/assets/scene-var', { seed: { assets: ASSETS } })
    await t.input('#nm', '雨巷二')
    await t.click('#save')
    let o = t.same()
    expect(o.toasts).toEqual(['已保存到我的资产'])
    expect(assets(o)).toHaveLength(3)
    expect(assets(o)[0]).toMatchObject({ fn: 'scene-var', name: '雨巷二', time: NOW })
    expect(viewText()).not.toContain('储存并返回')
    await t.click('#save')
    o = t.same()
    expect(assets(o)).toHaveLength(4)
  })
  it('save click：编辑已存资产原位更新，提示“已更新资产”', async () => {
    await start('#/assets/role-board?i=1', { seed: { assets: ASSETS } })
    await t.choose('#res', '1K')
    await t.click('#save')
    const o = t.same()
    expect(o.toasts).toEqual(['已更新资产'])
    expect(assets(o)).toHaveLength(2)
    expect(assets(o)[1].state.res).toBe('1K')
  })
  it('save click：带入名称缺失时 name 键不写出', async () => {
    await start('#/assets/role-board', { seed: { assetPick: { fn: 'role-board' } } })
    await t.click('#save')
    const o = t.same()
    expect(Object.keys(assets(o)[0])).toEqual(['fn', 'prompt', 'state', 'time'])
  })
  it('save click：导入条项标记完成；未全部完成不跳转', async () => {
    const sd = { ...SEED, items: [SEED.items[0], { ...SEED.items[1], done: false }] }
    await start('#/assets/role-board', { seed: { assetSeed: sd, assetPick: { ...sd.items[0], k: 0, wid: 'wv1' } } })
    await t.click('#save')
    const o = t.same()
    expect(JSON.parse(o.storage['pl.assetSeed']).items.map((x: { done?: boolean }) => !!x.done)).toEqual([true, false])
    await t.advance(1000)
    expect(t.same().hash).toBe('#/assets/role-board')
  })
  it('save click：标记的是带入时的序号 k（不是第一项）', async () => {
    const sd = { ...SEED, items: [{ ...SEED.items[0], done: false }, SEED.items[1], { fn: 'scene-new', label: '后院', name: '后院', profile: '' }] }
    await start('#/assets/scene-new', { seed: { assetSeed: sd, assetPick: { ...sd.items[2], k: 2, wid: 'wv1' } } })
    await t.click('#save')
    const o = t.same()
    expect(JSON.parse(o.storage['pl.assetSeed']).items.map((x: { done?: boolean }) => !!x.done)).toEqual([false, true, true])
  })
  it('save click：导入条全部完成，提示后 0.9 秒跳到作品分镜页', async () => {
    await start('#/assets/role-board', { seed: { works: VIBE, assetSeed: SEED, assetPick: { ...SEED.items[0], k: 0, wid: 'wv1' } } })
    await t.click('#save')
    let o = t.same()
    expect(o.toasts).toEqual(['已保存到我的资产', '资产都齐了，下一步：分镜'])
    await t.advance(899)
    expect(t.same().hash).toBe('#/assets/role-board')
    await t.advance(1)
    // 作品页归 P5-B（旧作品页打开时会写 lastVibe 等），这里只比较 hash
    expect(t.old.s.win.location.hash).toBe('#/script/v/wv1/board')
    expect(location.hash).toBe('#/script/v/wv1/board')
  })
  it('save click：没有作品时跳到 #/storyboard', async () => {
    await start('#/assets/role-board', { seed: { assetSeed: SEED, assetPick: { ...SEED.items[0], k: 0, wid: 'wv1' } } })
    await t.click('#save')
    await t.advance(900)
    expect(t.same().hash).toBe('#/storyboard')
  })
  it('save click：导入条已换成别的作品时不标记', async () => {
    await start('#/assets/role-board', { seed: { assetSeed: { ...SEED, wid: 'other' }, assetPick: { ...SEED.items[0], k: 0, wid: 'wv1' } } })
    await t.click('#save')
    const o = t.same()
    expect(o.storage['pl.assetSeed']).toBe(J({ ...SEED, wid: 'other' }))
  })
  it('save click：assetPick 没有 k（角色库带入）时不标记', async () => {
    await start('#/assets/role-board', { seed: { assetSeed: SEED, assetPick: { fn: 'role-board', name: 'A', profile: 'B' } } })
    await t.click('#save')
    const o = t.same()
    expect(o.storage['pl.assetSeed']).toBe(J(SEED))
  })
  it('backDirty：有改动时点“储存并返回”先保存再回资产首页', async () => {
    await start('#/assets/role-new')
    await t.input('#nm', '甲')
    await t.click('#pgBack')
    const o = t.same()
    expect(o.hash).toBe('#/assets')
    expect(o.toasts).toEqual(['已保存到我的资产'])
    expect(viewText()).toContain('1 个')
  })
  it('backDirty：保存后再改又变成“储存并返回”，点一次只存一份', async () => {
    await start('#/assets/role-new')
    await t.input('#nm', '甲')
    await t.click('#save')
    await t.input('#nm', '乙')
    t.same()
    await t.click('#pgBack')
    const o = t.same()
    expect(assets(o).map((a: { name: string }) => a.name)).toEqual(['乙', '甲'])
  })
  it('没有改动时“返回”直接回资产首页，不保存', async () => {
    await start('#/assets/role-new')
    await t.click('#pgBack')
    const o = t.same()
    expect(o.hash).toBe('#/assets')
    expect(o.storage['pl.assets']).toBeUndefined()
  })
  it('+ 创建风格链接跳到组装器', async () => {
    await start('#/assets/role-new')
    await t.click('#stabs a')
    expect(t.old.s.win.location.hash).toBe('#/assembler')
    expect(location.hash).toBe('#/assembler')
  })
})

describe('语音输入（addMic）', () => {
  it('点话筒开始识别，结果接在原文后（中文逗号连接），结束后复原', async () => {
    await start('#/assets/role-board', { speech: true, seed: { assetPick: { fn: 'role-board', name: 'A', profile: '冷面' } } })
    await t.click('.wc-mic')
    t.same()
    expect(html()).toContain('wc-mic on')
    await t.speak(['眉目', '清冷'])
    t.same()
    expect(promptOf()).toContain('角色档案：冷面，眉目清冷')
    await t.speechEnd()
    t.same()
    expect(html()).not.toContain('wc-mic on')
  })
  it('原文以标点结尾或为空时不加逗号；识别中再点停止', async () => {
    await start('#/assets/scene-board?i=0', { speech: true, seed: { assets: [{ ...ASSETS[0], state: { ...STATE, profile: '茶楼。  ' } }] } })
    await t.click('.wc-mic')
    await t.speak(['二楼'])
    t.same()
    expect(promptOf()).toContain('场景档案：茶楼。二楼')
    await t.click('.wc-mic')
    const o = t.same()
    expect(o.speech).toEqual(['start zh-CN true true', 'stop'])
  })
  it('start 抛错时提示不支持', async () => {
    await start('#/assets/role-new', { speech: 'throws' })
    await t.click('.wc-mic')
    const o = t.same()
    expect(o.toasts).toEqual(['这个浏览器不支持语音输入'])
  })
})
