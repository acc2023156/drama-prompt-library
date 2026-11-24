import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAKE, NOW, type Stubs, type Twin, teardown, twin } from './pro-twin'

vi.mock('../../src/data', async () => {
  const { loadData } = await import('./data')
  return { DATA: loadData(), API_BASE: '', parseData: JSON.parse }
})

/**
 * 作品卡对照（旧 QIXING、wcardOpts、wcardHtml、bindWcard、micListen、addMic，site-template.html 第 1736–1869 行）：
 * 作品卡挂在 PRO 首页对话框里（auto 页签且 pl.vibeCard 有值），两边整页双跑后逐步比较（见 pro-twin.tsx）。
 */

const AUTH = { token: 't', user: { uid: 'u1', phone: '13800000000', role: 'member', points: 10 } }
const CARD = { mode: 'auto', pitch: '被退婚的假千金，靠读心系统在豪门翻盘', aud: '女性向', genre: '能力系统', hooks: ['身分反转'], style: '无', ratio: '9:16', mins: 1, depth: '轻度' }

let t: Twin
beforeEach(() => {
  vi.useFakeTimers({ toFake: [...FAKE] })
})
afterEach(() => {
  teardown(t)
  vi.useRealTimers()
})

async function start(seed: Record<string, unknown> = {}, stubs: Stubs = {}) {
  t = await twin({ vibeCard: CARD, ...seed }, { kind: 'home' }, stubs)
  t.same()
  // 绑定时 requestAnimationFrame 里把故事框撑到内容高度
  await t.advance(16)
  return t.same()
}
const card = (o: { storage: Record<string, string> }) => JSON.parse(o.storage['pl.vibeCard'])

describe('初次渲染：各种设定', () => {
  const CARDS: [string, Record<string, unknown>][] = [
    ['女性向（女频七星）', CARD],
    ['男性向（男频七星）、已选角色与模式、高尺度', { ...CARD, aud: '男性向', qxRole: '逆袭者', qxMode: '后宫', heat: '高尺度' }],
    ['男同志向、自定义集数、未知时长', { ...CARD, aud: '男同志向', eps: '自定义', mins: 7 }],
    ['有独家点子（展开）、有剧名、已有作品 id（继续写）', { ...CARD, core: '她能听见所有人的心声', title: '读心千金', id: 'wold' }],
    ['只有空白点子（不展开）、卖点为空（开写禁用）', { ...CARD, core: '  ', pitch: '  ' }],
    ['风格与比例：自定义画风、16:9、正常尺度、重度思考', { ...CARD, style: '我的自定义', ratio: '16:9', heat: '正常', depth: '重度' }],
    ['未知比例与配对、不在列表里的爽点', { ...CARD, ratio: '2:1', pair: '其他', hooks: ['不存在'] }],
    ['最少字段（其余取 WZ_DEF）', { pitch: '一句话' }],
  ]
  for (const speech of [true, false]) {
    for (const [name, vc] of CARDS) {
      it(`${name}${speech ? '' : '（无语音）'}`, async () => {
        const o = await start({ vibeCard: vc, asm: { custom: '赛博' } }, { speech })
        // 绑定后立刻 refresh()：写回去掉 dup 的设定，adult 置 true
        expect(card(o).adult).toBe(true)
        expect('dup' in card(o)).toBe(false)
      })
    }
  }
})

describe('编辑', () => {
  it('剧名、故事、独家点子输入；故事清空后开写禁用', async () => {
    await start()
    await t.input('[data-c="title"]', '我的剧名')
    await t.input('[data-c="pitch"]', '新的故事')
    await t.input('[data-c="core"]', '金手指是读心')
    let o = t.same()
    expect(card(o)).toMatchObject({ title: '我的剧名', pitch: '新的故事', core: '金手指是读心' })
    await t.input('[data-c="pitch"]', '   ')
    o = t.same()
    expect(JSON.stringify(o.html)).toContain('"disabled"')
  })
  it('取名骰子：按卖点掷剧名，避开当前剧名，连掷几次', async () => {
    for (const pitch of ['被退婚的假千金重生回来', '林晚穿成王妃', '靠系统读心', '平凡的一天']) {
      teardown(t)
      await start({ vibeCard: { ...CARD, pitch } })
      for (let i = 0; i < 4; i++) {
        await t.click('[data-dice]')
        t.same()
      }
    }
  })
  it('爽点切换', async () => {
    await start()
    for (const h of ['身分反转', '打脸', '逆袭', '打脸']) {
      await t.click(`.ck[data-h="${h}"]`)
      t.same()
    }
    expect(card(t.same()).hooks).toEqual(['逆袭'])
  })
  it('点子起手句：接在原文后换行，光标移到末尾', async () => {
    await start({ vibeCard: { ...CARD, core: '已有点子  \n' } })
    await t.click('[data-seed="最大的反转是"]')
    let o = t.same()
    expect(card(o).core).toBe('已有点子\n最大的反转是')
    expect(o.focus).toContain('[data-c=core]')
    await t.input('[data-c="core"]', '')
    await t.click('[data-seed="结局想要"]')
    o = t.same()
    expect(card(o).core).toBe('结局想要')
  })
})

describe('下拉', () => {
  it('9 个下拉逐个打开、选第 2 项', async () => {
    await start()
    for (const k of ['style', 'ratio', 'aud', 'qxRole', 'qxMode', 'heat', 'pair', 'eps', 'mins']) {
      await t.click(`[data-dd="${k}"]`)
      t.same()
      await t.click(`[data-menu="${k}"] button`, 1)
      t.same()
    }
    const c = card(t.same())
    expect(typeof c.eps).toBe('number')
    expect(typeof c.mins).toBe('number')
  })
  it('再点同一按钮关闭；打开另一个时前一个关闭；点页面其他处关闭；思考弹层内部不关闭', async () => {
    await start()
    await t.click('[data-dd="heat"]')
    await t.click('[data-dd="heat"]')
    t.same()
    await t.click('[data-dd="eps"]')
    await t.click('[data-dd="pair"]')
    t.same()
    await t.click('.wz-head h1')
    t.same()
    await t.click('[data-think]')
    t.same()
    await t.click('[data-thinkpop] .tk-l')
    t.same()
    await t.click('[data-dd="style"]')
    t.same()
    await t.click('#cStyle')
    t.same()
  })
  it('切换受众：七星换成另一组，选了不在新组里的角色 / 模式清空，整张卡重画', async () => {
    await start({ vibeCard: { ...CARD, aud: '男性向', qxRole: '逆袭者', qxMode: '后宫', core: '点子' } })
    await t.click('[data-dd="aud"]')
    await t.click('[data-menu="aud"] [data-v="女性向"]')
    let o = t.same()
    expect(card(o)).toMatchObject({ qxRole: '逆袭者', qxMode: '' })
    await t.advance(16)
    t.same()
    await t.click('[data-dd="qxRole"]')
    await t.click('[data-menu="qxRole"] button', 5)
    await t.click('[data-dd="aud"]')
    await t.click('[data-menu="aud"] [data-v="男同志向"]')
    o = t.same()
    expect(card(o)).toMatchObject({ qxRole: '', qxMode: '' })
  })
  it('受众从缺省切换时补上 qxRole / qxMode 两个键（键序与旧页面相同）', async () => {
    await start({ vibeCard: { pitch: '一句话' } })
    await t.click('[data-menu="aud"] [data-v="男性向"]')
    const o = t.same()
    expect(Object.keys(card(o)).slice(-2)).toEqual(['qxRole', 'qxMode'])
  })
})

describe('思考强度', () => {
  it('滑杆写作品卡与 pl.chat.depth', async () => {
    await start({ chat: { ai: 'Qwen', depth: '中度' } })
    await t.click('[data-think]')
    for (const v of ['2', '0', '1']) {
      await t.input('[data-thinkpop] input', v)
      const o = t.same()
      expect(JSON.parse(o.storage['pl.chat']).depth).toBe(card(o).depth)
    }
  })
  it('pl.chat 为字符串 null 时新建对象', async () => {
    t = await twin({ vibeCard: CARD }, { kind: 'home' }, {}, { chat: 'null' })
    await t.input('[data-thinkpop] input', '2')
    expect(t.same().storage['pl.chat']).toBe('{"depth":"重度"}')
  })
})

describe('语音（addMic 与独家点子麦克风）', () => {
  it('故事框：原文后加逗号接上识别结果；再点停止', async () => {
    await start()
    await t.click('.mic-w .wc-mic')
    await t.speak('后来她发现')
    let o = t.same()
    expect(card(o).pitch).toBe(CARD.pitch + '，后来她发现')
    await t.click('.mic-w .wc-mic')
    await t.settle()
    o = t.same()
    expect(o.speech).toEqual(['new', 'start zh-CN true true', 'stop'])
  })
  it('独家点子：用换行接上；原文为空时直接接', async () => {
    for (const core of ['第一条', '']) {
      teardown(t)
      await start({ vibeCard: { ...CARD, core } })
      await t.click('[data-mic]')
      await t.speak('第二条')
      t.same()
      await t.speechEnd()
      t.same()
    }
  })
  it('两个麦克风各自独立；start 抛错时提示', async () => {
    await start({}, { speechThrows: true })
    await t.click('[data-mic]')
    await t.click('.mic-w .wc-mic')
    expect(t.same().toasts).toEqual(['这个浏览器不支持语音输入', '这个浏览器不支持语音输入'])
  })
})

describe('开写', () => {
  it('未登录：打开登录面板并提示，不建作品', async () => {
    await start()
    await t.click('.wc-go')
    const o = t.same()
    expect(o).toMatchObject({ login: true, toasts: ['输入手机号就能开写'], hash: '' })
    expect(o.storage['pl.works']).toBeUndefined()
  })
  for (const [name, vc, chat] of [
    ['无剧名：按卖点掷剧名，ai 取对话框所选', CARD, { ai: 'Grok' }],
    ['有剧名、对话框没有 ai 时保留卡片的', { ...CARD, title: '  我的剧  ', ai: 'Qwen' }, {}],
    ['已有作品 id：覆盖同一部（继续写）', { ...CARD, id: 'wold', title: '旧剧' }, { ai: '' }],
    ['卖点只有一句、取不到剧名关键词', { ...CARD, pitch: '平凡的一天' }, null],
  ] as [string, Record<string, unknown>, Record<string, unknown> | null][]) {
    it(`已登录：${name}`, async () => {
      const works = [{ id: 'wold', kind: 'vibe', title: '旧剧', W: { pitch: 'x' }, time: 1, gen: { status: 'done' } }, { id: 'sx', kind: 'simple', title: 'S', W: {}, time: 2 }]
      await start({ auth: AUTH, works, vibeCard: vc, ...(chat ? { chat } : {}) })
      await t.click('.wc-go')
      const o = t.same()
      expect(o.hash).toMatch(/^#\/script\/v\/w/)
      expect(o.pushes).toBe(1)
      expect(card(o).id).toBe(o.hash.slice('#/script/v/'.length))
      expect(JSON.parse(o.storage['pl.works'])[0].time).toBe(NOW)
    })
  }
})

describe('关闭', () => {
  it('× 回到对话框输入：pl.vibeCard 写 null，底栏恢复', async () => {
    await start({ chat: { pitch: '对话框里的原文' } })
    await t.click('[data-x]')
    const o = t.same()
    expect(o.storage['pl.vibeCard']).toBe('null')
    await t.click('#cSend')
    t.same()
    await t.advance(16)
    t.same()
  })
})
