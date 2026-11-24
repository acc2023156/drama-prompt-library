import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAKE, NOW, type Twin, teardown, twin } from './pro-twin'

vi.mock('../../src/data', async () => {
  const { loadData } = await import('./data')
  return { DATA: loadData(), API_BASE: '', parseData: JSON.parse }
})

/**
 * 五步表单对照（旧 viewScriptNew、wzCreate、wzSeedAssets，site-template.html 第 1884–2073 行）：
 * 新增与编辑两种入口，每一步的输入、校验、撞题比对、辨识度、进度、AI 帮我想弹窗、建立作品后带入资产库，
 * 每步操作后比较 DOM、localStorage 原文、hash、提示条、弹窗等（见 pro-twin.tsx）。
 */

const WORKS = [
  { id: 'wa', title: '读心千金', W: { mode: 'auto', pitch: '被退婚的假千金，靠读心系统在豪门翻盘', core: '读心', genre: '能力系统' }, time: NOW - 3600e3 },
  { id: 'wb', kind: 'vibe', title: '', W: { mode: 'auto', pitch: '重生之后她不忍了', genre: '重生穿越' }, time: NOW - 864e5 },
  { id: 'wc', title: '表单剧', W: { ...{ mode: 'paste', aud: '男性向', pair: '男男（BL）', genre: '古装', pitch: '将军与他的侍卫', eps: 20, mins: 2, wpm: 300, ai: 'Grok', lang: '台湾用语', glyph: '繁体', hero: '少年将军', rival: '奸相', world: '边关', core: '兵符', diff: '无金手指', adult: true, sequel: false, doc: '《将军令》\n第一集', hooks: ['打脸'] } }, time: NOW - 2 * 864e5 },
  { id: 'wd', title: '回收站里的', W: { mode: 'novel', pitch: '读心千金在豪门' }, time: 1, trashed: NOW - 864e5 },
  { id: 'we', title: '五', W: { mode: 'auto' }, time: 5 },
  { id: 'wf', title: '六', W: { mode: 'auto' }, time: 6 },
]

let t: Twin
beforeEach(() => {
  vi.useFakeTimers({ toFake: [...FAKE] })
})
afterEach(() => {
  teardown(t)
  vi.useRealTimers()
})

async function start(seed: Record<string, unknown> = {}, wid?: string, raw: Record<string, string> = {}) {
  t = await twin(seed, { kind: 'form', wid }, {}, raw)
  return t.same()
}
const draft = (o: { storage: Record<string, string> }) => JSON.parse(o.storage['pl.scriptDraft'])

describe('初次渲染', () => {
  const CASES: [string, Record<string, unknown>, string?, Record<string, string>?][] = [
    ['空存储（新增，paste）', {}],
    ['草稿 auto 有卖点', { scriptDraft: { mode: 'auto', pitch: '被退婚的假千金', aud: '女性向' } }],
    ['草稿 auto 无卖点', { scriptDraft: { mode: 'auto' } }],
    ['草稿 novel 太短', { scriptDraft: { mode: 'novel', novel: '短篇小说' } }],
    ['草稿 novel 够长、已勾 18 岁', { scriptDraft: { mode: 'novel', novel: '长'.repeat(2500), adult: true } }],
    ['草稿 novel 太长', { scriptDraft: { mode: 'novel', novel: '长'.repeat(400001), adult: true } }],
    ['草稿 paste 带剧名的策划文件、补充设定齐全', { scriptDraft: { mode: 'paste', doc: '剧名：《星河》\n正文', core: '核心', diff: '差异', rival: '对手', hero: '主角', world: '世界', adult: true, hooks: ['逆袭', '打脸'] } }],
    ['草稿 自定义集数与时长、wpm、ai、旧用语', { scriptDraft: { eps: '自定义', epsCustom: '15', mins: '自定义', minsCustom: '2.5', wpm: 350, ai: 'Qwen', lang: '台湾用语', glyph: '繁体', sequel: false } }],
    ['草稿 自定义但没填数字', { scriptDraft: { eps: '自定义', mins: '自定义', adult: true, mode: 'auto', pitch: 'x' } }],
    ['草稿 不在选项里的受众与 ai、有 id: null 键', { scriptDraft: { aud: '其他', ai: '某模型', id: null, genre: '不存在' } }],
    ['草稿 辨识度 ≥5 但缺对手', { scriptDraft: { mode: 'auto', pitch: '卖点', core: '核心', diff: '差异', hooks: ['逆袭'] } }],
    ['有作品（最近的作品、撞题比对命中）', { works: WORKS, scriptDraft: { mode: 'auto', pitch: '被退婚的假千金，靠读心系统翻盘', core: '读心', genre: '能力系统' } }],
    ['有作品但不撞题', { works: WORKS, scriptDraft: { mode: 'auto', pitch: '外星人来地球开餐馆' } }],
    ['pl.scriptDraft 为字符串 null', {}, undefined, { scriptDraft: 'null' }],
    ['编辑已有作品', { works: WORKS, scriptDraft: { pitch: '不该用草稿' } }, 'wc'],
    ['编辑：作品 id 不存在（按新增）', { works: WORKS }, 'nope'],
  ]
  for (const [name, seed, wid, raw] of CASES) {
    it(name, async () => {
      const o = await start(seed, wid, raw)
      if (wid === 'wc') expect(o.storage['pl.scriptDraft']).toBe(JSON.stringify({ pitch: '不该用草稿' }))
      else expect(draft(o).id).toBe(null)
    })
  }
})

describe('第 1 步：三种模式、文件、读取', () => {
  it('切换页签：重画第 1 步、步骤名与进度', async () => {
    await start({ scriptDraft: { pitch: '卖点', doc: '剧本', novel: '小说' } })
    for (const m of ['auto', 'novel', 'paste', 'auto', 'auto']) {
      await t.click(`#tabs [data-m="${m}"]`)
      t.same()
    }
  })
  it('auto：点故事按钮滚到卖点框，350 毫秒后聚焦；改卖点后故事按钮要等重画才变', async () => {
    await start({ scriptDraft: { mode: 'auto' } })
    await t.click('#story')
    let o = t.same()
    expect(o.scrolls).toEqual(['input#.in[data-f=pitch]|{"behavior":"smooth","block":"center"}'])
    await t.advance(349)
    t.same()
    await t.advance(1)
    o = t.same()
    expect(o.focus).toBe('input#.in[data-f=pitch]')
    await t.input('[data-f="pitch"]', '  新卖点  ')
    t.same()
    await t.click('#tabs [data-m="auto"]')
    t.same()
  })
  it('paste：贴正文 → 读取这份文件（取剧名填入作品名称）→ 已有剧名时不覆盖', async () => {
    await start()
    await t.click('#readDoc')
    expect(t.same().toasts).toEqual(['先贴上策划文件'])
    await t.input('[data-f="doc"]', '片名：星河彼岸\n第一集……')
    await t.click('#readDoc')
    let o = t.same()
    expect(draft(o).title).toBe('星河彼岸')
    await t.input('[data-f="doc"]', '《另一个名字》')
    await t.click('#readDoc')
    o = t.same()
    expect(draft(o).title).toBe('星河彼岸')
    await t.input('[data-f="doc"]', '没有剧名的正文')
    await t.click('#readDoc')
    t.same()
    // 重画第 1 步后读取结果清空
    await t.click('#tabs [data-m="paste"]')
    t.same()
  })
  it('paste：汇入 txt（FileReader，utf-8）；超过 4MB 提示；取消选择不做事', async () => {
    await start()
    await t.file('[data-file="doc"]', { name: 'a.txt', text: '《文件里的剧》\n内容' })
    t.same()
    await t.settle()
    let o = t.same()
    expect(o.reads).toEqual(['a.txt utf-8'])
    expect(o.toasts).toEqual(['已读取 a.txt'])
    await t.file('[data-file="doc"]', { name: 'big.txt', size: 4e6 + 1, text: 'x' })
    await t.settle()
    o = t.same()
    expect(o.toasts[1]).toBe('文件太大')
    await t.file('[data-file="doc"]', { name: 'edge.txt', size: 4e6, text: '刚好 4MB' })
    await t.settle()
    t.same()
    await t.file('[data-file="doc"]', null)
    await t.settle()
    expect(t.same().reads.length).toBe(2)
  })
  it('novel：汇入、输入时字数提示', async () => {
    await start({ scriptDraft: { mode: 'novel' } })
    for (const v of ['短', '长'.repeat(2000), '长'.repeat(400001), '']) {
      await t.input('[data-f="novel"]', v)
      t.same()
    }
    await t.file('[data-file="novel"]', { name: 'n.md', text: '长'.repeat(3000) })
    await t.settle()
    t.same()
  })
})

describe('第 2–4 步：输入、下拉、爽点、规格、补充设定', () => {
  it('作品名称、卖点、受众配对类型、词库字形', async () => {
    await start({ works: WORKS })
    await t.input('[data-f="title"]', '读心千金')
    t.same()
    await t.input('[data-f="pitch"]', '被退婚的假千金靠读心系统在豪门翻盘')
    t.same()
    for (const [k, v] of [['aud', '男性向'], ['pair', '女女（GL）'], ['genre', '能力系统'], ['lang', '繁中词库'], ['glyph', '繁体'], ['ai', 'ChatGPT']]) {
      await t.change(`[data-f="${k}"]`, v)
      t.same()
    }
  })
  it('爽点多选来回切换', async () => {
    await start()
    for (const h of ['打脸', '逆袭', '打脸', '被偏爱']) {
      await t.click(`.ck[data-k="hooks"][data-v="${h}"]`)
      t.same()
    }
    expect(draft(t.same()).hooks).toEqual(['逆袭', '被偏爱'])
  })
  it('集数与时长：选项、自定义（显示输入框）、填数字、再切回', async () => {
    await start({ scriptDraft: { adult: true, doc: 'x' } })
    await t.click('.ck[data-k="eps"][data-v="60"]')
    t.same()
    await t.click('.ck[data-k="eps"][data-v="自定义"]')
    t.same()
    await t.input('[data-f="epsCustom"]', '7')
    t.same()
    await t.click('.ck[data-k="mins"][data-v="自定义"]')
    t.same()
    await t.input('[data-f="minsCustom"]', '1.5')
    t.same()
    await t.input('[data-f="minsCustom"]', '')
    t.same()
    await t.click('.ck[data-k="mins"][data-v="10"]')
    const o = t.same()
    expect(draft(o)).toMatchObject({ eps: '自定义', epsCustom: '7', mins: 10, minsCustom: '' })
  })
  it('每分钟字数：数字、清空（回到 400）、0（回到 400）', async () => {
    await start()
    for (const v of ['250', '', '0', '1000']) {
      await t.input('[data-f="wpm"]', v)
      const o = t.same()
      expect(draft(o).wpm).toBe(+v || 400)
    }
  })
  it('续季、18 岁勾选', async () => {
    await start({ scriptDraft: { mode: 'auto', pitch: '卖点' } })
    await t.click('[data-f="sequel"]')
    t.same()
    await t.click('[data-f="adult"]')
    let o = t.same()
    expect(draft(o)).toMatchObject({ sequel: false, adult: true })
    await t.click('[data-f="adult"]')
    o = t.same()
    expect(draft(o).adult).toBe(false)
  })
  it('补充设定逐项填写：辨识度与提示随之变化', async () => {
    await start({ scriptDraft: { mode: 'auto', pitch: '卖点', adult: true } })
    for (const [k, v] of [['rival', '对手'], ['core', '核心'], ['hero', '主角'], ['diff', '差异'], ['world', '世界'], ['core', '  ']]) {
      await t.input(`[data-f="${k}"]`, v)
      t.same()
    }
  })
})

describe('撞题比对', () => {
  it('卖点输入过程中命中、不命中；同类型降低门槛；作品编辑时排除自己', async () => {
    await start({ works: WORKS })
    for (const v of ['被退婚的假千金', '被退婚的假千金，靠读心系统在豪门翻盘', '假千金靠读心系统在豪门', '豪门假千金读心术', '读心千金被退婚了', '假千金在豪门读心翻盘', '重生之后她不忍了吧', '重生', '外星人']) {
      await t.input('[data-f="pitch"]', v)
      t.same()
    }
    await t.change('[data-f="genre"]', '能力系统')
    t.same()
    teardown(t)
    await start({ works: WORKS }, 'wa')
    expect(JSON.stringify(t.same().html)).toContain('已自动比对 4 部作品')
  })
})

describe('AI 帮我想（弹窗）', () => {
  it('弹出卖点提示词；复制、下载、关闭', async () => {
    await start({ scriptDraft: { mode: 'paste', doc: '策'.repeat(3100), novel: '  ' + '说'.repeat(3100), pitch: '卖点', core: '核心' } })
    await t.click('#aiPitch')
    let o = t.same()
    expect(o.modal).not.toBe(null)
    await t.click('.modal .copy')
    await t.settle()
    o = t.same()
    expect(o.clip.length).toBe(1)
    await t.advance(1300)
    t.same()
    await t.click('.modal .mf .btn-o', 1)
    o = t.same()
    expect(o.downloads).toEqual(['卖点提示词.txt ' + o.downloads[0].split(' ')[1]])
    await t.click('.modal .box h3')
    t.same()
    await t.click('.modal .mf .btn-o', 0)
    expect(t.same().modal).toBe(null)
  })
  it('点遮罩关闭；没有补充设定与正文时的提示词', async () => {
    await start()
    await t.click('#aiPitch')
    t.same()
    await t.click('.modal')
    expect(t.same().modal).toBe(null)
  })
})

describe('确认与建立', () => {
  const CASES: [string, Record<string, unknown>, string?][] = [
    ['新增 paste：女性向男女', { scriptDraft: { mode: 'paste', doc: '《星河》第一集', aud: '女性向', adult: true, pitch: '卖点。后半句', core: '核心', hero: ' 主角 ', rival: '', world: '' } }],
    ['新增 auto：男性向、有对手与场景', { scriptDraft: { mode: 'auto', pitch: '战神归来', aud: '男性向', adult: true, rival: '奸人', world: '都市' } }],
    ['新增 novel：男男', { scriptDraft: { mode: 'novel', novel: '长'.repeat(2000), pair: '男男（BL）', adult: true } }],
    ['新增：女女、无卖点无剧名（未命名）', { scriptDraft: { mode: 'paste', doc: '正文', pair: '女女（GL）', adult: true } }],
    ['编辑已有作品：保留 kind，不清草稿', { works: [...WORKS, { id: 'wv', kind: 'vibe', title: '氛围', W: { mode: 'auto', pitch: '氛围剧', adult: true }, time: 9, gen: { status: 'done' } }], scriptDraft: { a: 1 } }, 'wv'],
  ]
  for (const [name, seed, wid] of CASES) {
    it(name, async () => {
      await start(seed, wid)
      await t.click('#go')
      const o = t.same()
      expect(o.hash).toBe('#/assets')
      expect(o.pushes).toBe(1)
      expect(o.toasts[0]).toMatch(/^已配好.+，从第 1 个开始$/)
      if (!wid) expect(o.storage['pl.scriptDraft']).toBe('null')
      expect(JSON.parse(o.storage['pl.assetSeed']).wid).toBe(JSON.parse(o.storage['pl.works'])[wid ? 6 : 0].id)
    })
  }
  it('就差：缺项时按钮禁用，逐项补齐后可建立', async () => {
    await start({ scriptDraft: { mode: 'auto', eps: '自定义' } })
    await t.click('#go')
    expect(t.same().hash).toBe('')
    await t.input('[data-f="pitch"]', '卖点')
    t.same()
    await t.input('[data-f="epsCustom"]', '5')
    t.same()
    await t.click('[data-f="adult"]')
    t.same()
    await t.click('#go')
    expect(t.same().hash).toBe('#/assets')
  })
})
