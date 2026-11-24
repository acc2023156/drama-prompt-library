import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAKE, NOW, type Stubs, type Twin, teardown, twin } from './pro-twin'

vi.mock('../../src/data', async () => {
  const { loadData } = await import('./data')
  return { DATA: loadData(), API_BASE: '', parseData: JSON.parse }
})

/**
 * PRO 首页对照（旧 viewScriptHome / chatHtml / readAnyFile / bindChat，site-template.html 第 1539–1733 行）：
 * 作品网格与批量移到回收桶、对话框三个页签、文件读取、拖放、风格 / 比例 / 思考强度弹层、语音、发送。
 * 每一步操作后比较 DOM、localStorage 原文、hash、提示条等全部可观测状态（见 pro-twin.tsx）。作品卡另见 pro-card.test.tsx。
 */

const DAY = 864e5
export const WORKS = [
  { id: 'wv1', kind: 'vibe', title: '读心千金', W: { mode: 'auto', aud: '女性向', pair: '男女', genre: '能力系统', pitch: '被退婚的假千金，靠读心系统在豪门翻盘', eps: 10, mins: 1 }, time: NOW - 3600e3 },
  { id: 'wf1', title: '表单剧 <b>&', W: { mode: 'paste', aud: '男性向', pair: '男男（BL）', genre: '古装', pitch: '', eps: '自定义', epsCustom: '12', mins: 3 }, time: NOW - 2 * DAY },
  { id: 's1', kind: 'simple', title: '', W: { mode: 'auto', aud: '男性向', pair: '', genre: '都市', pitch: '赘婿归来', eps: 10, mins: 1 }, sx: { g: 'male', name: '陆沉' }, time: NOW - 5 * DAY },
  { id: 'wn1', title: '小说改编', W: { mode: 'novel', aud: '女性向', genre: '玄幻', eps: 30, mins: 'x' }, time: NOW - 40 * DAY },
  { id: 'wt1', kind: 'vibe', title: '回收中', W: { mode: 'auto', aud: '女性向', pitch: 'x', eps: 10, mins: 1 }, time: NOW - DAY, trashed: NOW - DAY },
  { id: 'wt2', title: '回收中二', W: { mode: 'paste', eps: 10, mins: 1 }, time: NOW - DAY, trashed: NOW - 2 * DAY },
]

let t: Twin
beforeEach(() => {
  vi.useFakeTimers({ toFake: [...FAKE] })
})
afterEach(() => {
  teardown(t)
  vi.useRealTimers()
})

async function start(seed: Record<string, unknown> = {}, stubs: Stubs = {}, raw: Record<string, string> = {}) {
  t = await twin(seed, { kind: 'home' }, stubs, raw)
  return t.same()
}

describe('初次渲染', () => {
  const SEEDS: [string, Record<string, unknown>, Record<string, string>?][] = [
    ['空存储', {}],
    ['有作品（含回收站、未命名、转义、各类型）', { works: WORKS }],
    ['只有回收站里的作品', { works: WORKS.filter((w) => w.trashed) }],
    ['回收站恰好 1 部', { works: [WORKS[0], WORKS[4]] }],
    ['pl.works 为字符串 null', {}, { works: 'null' }],
    ['pl.chat 为字符串 null', {}, { chat: 'null' }],
    ['pl.chat 损坏的 JSON', {}, { chat: '{bad' }],
    ['chat：paste 页签空白', { chat: { tab: 'paste' } }],
    ['chat：paste 页签 editing', { chat: { tab: 'paste', editing: true } }],
    ['chat：paste 页签有正文', { chat: { tab: 'paste', doc: '第一集 <b>' } }],
    ['chat：paste 页签正文只有空白（仍显示输入框与清空）', { chat: { tab: 'paste', doc: '   ' } }],
    ['chat：novel 页签太短', { chat: { tab: 'novel', novel: '短篇' } }],
    ['chat：novel 页签够长', { chat: { tab: 'novel', novel: '长'.repeat(2000) } }],
    ['chat：novel 页签太长', { chat: { tab: 'novel', novel: '长'.repeat(400001) } }],
    ['chat：novel 只有空白', { chat: { tab: 'novel', novel: '   ' } }],
    ['chat：auto 有起手话', { chat: { tab: 'auto', pitch: '重生回到高考前' } }],
    ['chat：风格、比例、模型、思考强度', { chat: { style: '2D 动漫', ratio: '16:9', ai: 'Grok', depth: '重度', extra: [1] } }],
    ['chat：比例 1:1、风格 无、未知深度', { chat: { style: '无', ratio: '1:1', depth: '极深' } }],
    ['chat：比例为空串', { chat: { ratio: '', style: '' } }],
    ['chat：未知页签', { chat: { tab: 'xyz' } }],
    ['自定义画风进风格表', { asm: { style: '__custom', custom: '水彩，暖色' } }],
    ['vibeCard 在 auto 页签显示作品卡', { vibeCard: { mode: 'auto', pitch: '被退婚的假千金', aud: '女性向', hooks: ['逆袭'] } }],
    ['vibeCard 在 paste 页签不显示', { chat: { tab: 'paste' }, vibeCard: { pitch: 'x' } }],
    ['vibeCard 为字符串 null', {}, { vibeCard: 'null' }],
  ]
  for (const speech of [true, false]) {
    for (const [name, seed, raw] of SEEDS) {
      it(`${name}${speech ? '' : '（无语音）'}`, async () => {
        await start(seed, { speech }, raw)
      })
    }
  }
})

describe('作品网格与批量移到回收桶', () => {
  it('删除作品 → 选两部 → 取消选一部 → 移到回收桶（确认）→ 整页重画', async () => {
    await start({ works: WORKS })
    await t.click('#pickBtn')
    let o = t.same()
    expect(JSON.stringify(o.html)).toContain('pick-bar')
    await t.click('[data-wk="0"]')
    await t.click('[data-wk="2"] .acts a')
    o = t.same()
    expect(o.hash).toBe('')
    await t.click('[data-wk="0"] .t')
    t.same()
    await t.click('[data-wk="0"]')
    await t.click('[data-pk=go]')
    o = t.same()
    expect(o.confirms).toEqual(['把 2 部移到回收桶？\n30 天内可以在回收桶还原，之后会永久删除。'])
    expect(o.toasts).toEqual(['已移到回收桶（2 部）'])
    expect(o.pushes).toBe(1)
    const list = JSON.parse(o.storage['pl.works'])
    expect(list.filter((w: { trashed?: number }) => w.trashed === NOW).map((w: { id: string }) => w.id)).toEqual(['wv1', 's1'])
    // 重画后选择状态清空、回收桶计数变化，对话框重新读取 pl.chat
    await t.click('#pickBtn')
    await t.click('[data-pk=all]')
    t.same()
  })
  it('全选 → 确认框选取消：不改存储', async () => {
    await start({ works: WORKS }, { confirm: false })
    await t.click('#pickBtn')
    await t.click('[data-pk=all]')
    t.same()
    await t.click('[data-pk=go]')
    const o = t.same()
    expect(o.confirms.length).toBe(1)
    expect(o.storage['pl.works']).toBe(JSON.stringify(WORKS))
  })
  it('未选任何作品时按钮禁用；取消退出选择模式；再次点“删除作品”切换', async () => {
    await start({ works: WORKS })
    await t.click('#pickBtn')
    await t.click('[data-pk=go]')
    expect(t.same().confirms).toEqual([])
    await t.click('[data-wk="1"]')
    await t.click('[data-pk=x]')
    t.same()
    await t.click('[data-wk="1"] .acts a')
    expect(t.same().hash).toBe('#/script/w/wf1')
    await t.click('#pickBtn')
    await t.click('[data-wk="3"]')
    await t.click('#pickBtn')
    t.same()
    await t.click('#pickBtn')
    t.same()
  })
  it('全部移走后显示空状态与回收桶计数', async () => {
    await start({ works: WORKS.slice(0, 2) })
    await t.click('#pickBtn')
    await t.click('[data-pk=all]')
    await t.click('[data-pk=go]')
    const o = t.same()
    expect(JSON.stringify(o.html)).toContain('还没有作品')
  })
  it('非选择模式点卡片“打开”跳作品页（氛围写作作品）', async () => {
    await start({ works: WORKS })
    await t.click('[data-wk="0"] .acts a')
    expect(t.same().hash).toBe('#/script/v/wv1')
  })
})

describe('对话框：连接器、页签、输入', () => {
  it('连接器按钮切换 ai 并写 pl.chat；启动连接器 10 秒后复原', async () => {
    await start({ chat: { ai: 'Qwen', depth: '中度' } })
    await t.click('.cn[data-v="Grok"]')
    let o = t.same()
    expect(JSON.parse(o.storage['pl.chat']).ai).toBe('Grok')
    await t.click('#cWake')
    expect(JSON.stringify(t.same().html)).toContain('启动中')
    await t.advance(9999)
    t.same()
    // 第二次点击另起一个 10 秒计时；第一个到点时就复原（旧页面不清除先前的计时）
    await t.click('#cWake')
    await t.advance(1)
    o = t.same()
    expect(JSON.stringify(o.html)).not.toContain('启动中')
    await t.advance(10000)
    t.same()
  })
  it('三个页签来回切换，每次写 pl.chat 并重画输入区', async () => {
    await start({ chat: { doc: '已有剧本', novel: '小说' } })
    for (const m of ['paste', 'novel', 'auto', 'novel', 'paste', 'paste']) {
      await t.click(`#ctabs [data-m="${m}"]`)
      t.same()
    }
  })
  it('auto：输入起手话 → 发送按钮可用；清空 → 禁用', async () => {
    await start()
    await t.input('#cPitch', '  ')
    t.same()
    await t.input('#cPitch', '被退婚的假千金')
    t.same()
    await t.input('#cPitch', '')
    t.same()
  })
  it('paste：粘贴文本 → 输入 → 计数与“清空”出现的时机 → 清空', async () => {
    await start({ chat: { tab: 'paste' } })
    await t.click('#cPaste')
    let o = t.same()
    expect(o.focus).toContain('#cDoc')
    await t.input('#cDoc', '第一集')
    o = t.same()
    expect(JSON.stringify(o.html)).not.toContain('cClr')
    await t.click('#ctabs [data-m="paste"]')
    expect(JSON.stringify(t.same().html)).toContain('cClr')
    await t.click('#cClr')
    o = t.same()
    expect(JSON.parse(o.storage['pl.chat'])).toMatchObject({ doc: '', editing: false })
  })
  it('novel：字数提示（太短、够长、太长、只有空白）', async () => {
    await start({ chat: { tab: 'novel' } })
    for (const v of ['短', '字'.repeat(1999) + ' ', '字'.repeat(2000), '字'.repeat(400001), '   ', '']) {
      await t.input('#cNovel', v)
      t.same()
    }
  })
})

describe('对话框：文件读取（readAnyFile）', () => {
  const enc = (bytes: number[]) => new Uint8Array(bytes)
  const TXT: [string, Uint8Array][] = [
    ['utf8.txt', new TextEncoder().encode('第一集：重逢\n')],
    ['bom.TXT', enc([0xef, 0xbb, 0xbf, 0x41, 0x42])],
    ['gbk.md', enc([0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7])],
    ['big5.txt', enc([0xa7, 0x41, 0xa6, 0x6e, 0x40])],
    ['bad.txt', enc([0xff, 0xfe, 0xfd, 0x80])],
    ['blank.txt', enc([0x20, 0x0a, 0x20])],
    ['无扩展名', new TextEncoder().encode('纯文本')],
  ]
  for (const tab of ['paste', 'novel', 'auto']) {
    for (const [name, bytes] of TXT) {
      it(`${tab} 页签读 ${name}`, async () => {
        await start({ chat: { tab, editing: true } })
        if (tab === 'auto') await t.click('#ctabs [data-m="paste"]')
        await t.file('#cFile', { name, bytes })
        t.same()
        await t.settle()
        const o = t.same()
        expect(o.toasts[0]).toBe('正在读取 ' + name)
        expect(o.toasts.length).toBe(2)
      })
    }
  }
  it('docx：动态载入 mammoth 后解析；第二次不重复载入', async () => {
    await start({ chat: { tab: 'paste' } }, { docx: '  Word 里的剧本  ' })
    await t.file('#cFile', { name: '剧本.DOCX', bytes: new Uint8Array([1, 2, 3]) })
    await t.settle()
    let o = t.same()
    expect(o.scripts).toEqual(['https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'])
    expect(o.libs).toEqual(['mammoth 3'])
    await t.file('#cFile', { name: 'b.docx', bytes: new Uint8Array([1]) })
    await t.settle()
    o = t.same()
    expect(o.scripts.length).toBe(1)
    expect(o.toasts).toEqual(['正在读取 剧本.DOCX', '已读取 9 字', '正在读取 b.docx', '已读取 9 字'])
  })
  it('docx：脚本载入失败 → 提示；再试时脚本标签已在、库不存在 → 提示原生错误', async () => {
    await start({ chat: { tab: 'paste' } }, { scriptFails: () => true })
    await t.file('#cFile', { name: 'a.docx', bytes: new Uint8Array([1]) })
    await t.settle()
    expect(t.same().toasts).toEqual(['正在读取 a.docx', '读取失败：载入失败'])
    await t.file('#cFile', { name: 'a.docx', bytes: new Uint8Array([1]) })
    await t.settle()
    expect(t.same().toasts[3]).toBe('读取失败：mammoth is not defined')
  })
  it('docx：解析抛错、解析为空', async () => {
    await start({ chat: { tab: 'paste' } }, { docx: new Error('坏文件') })
    await t.file('#cFile', { name: 'a.docx', bytes: new Uint8Array([1]) })
    await t.settle()
    expect(t.same().toasts[1]).toBe('读取失败：坏文件')
    teardown(t)
    await start({ chat: { tab: 'novel' } }, { docx: '   ' })
    await t.file('#cFile', { name: 'a.docx', bytes: new Uint8Array([1]) })
    await t.settle()
    expect(t.same().toasts[1]).toBe('读取失败：没有读到文字')
  })
  it('pdf：载入 pdf.js、设 worker、逐页取字（hasEOL 换行，页间换行）', async () => {
    const pdf = [[{ str: '第一页', hasEOL: true }, { str: '续' }], [], [{ str: '第三页' }]]
    await start({ chat: { tab: 'novel' } }, { pdf })
    await t.file('#cFile', { name: 'n.pdf', bytes: new Uint8Array(5) })
    await t.settle()
    const o = t.same()
    expect(o.libs).toEqual(['pdf 5 worker=https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'])
    expect(JSON.parse(o.storage['pl.chat']).novel).toBe('第一页\n续\n\n第三页')
  })
  it('pdf 脚本载入失败', async () => {
    await start({ chat: { tab: 'paste' } }, { scriptFails: (s) => s.includes('pdf') })
    await t.file('#cFile', { name: 'n.pdf', bytes: new Uint8Array(5) })
    await t.settle()
    expect(t.same().toasts[1]).toBe('读取失败：载入失败')
  })
  it('取消选择文件（files 为空）不做事', async () => {
    await start({ chat: { tab: 'paste' } })
    await t.file('#cFile', null)
    await t.settle()
    expect(t.same().toasts).toEqual([])
  })
  it('拖放：dragover 加 over、dragleave 去掉、drop 读文件', async () => {
    await start({ chat: { tab: 'paste' } })
    const over = () => (t.old.doc.getElementById('cDrop')!.className)
    await t.drag('#cDrop', 'dragover')
    t.same()
    expect(over()).toBe('cdrop over')
    await t.drag('#cDrop', 'dragleave')
    t.same()
    expect(over()).toBe('cdrop')
    await t.drag('#cDrop', 'dragover')
    await t.drag('#cDrop', 'drop', { name: 'd.txt', text: '拖进来的剧本' })
    t.same()
    await t.settle()
    const o = t.same()
    expect(JSON.parse(o.storage['pl.chat'])).toMatchObject({ tab: 'paste', doc: '拖进来的剧本', editing: true })
  })
  it('drop 没有文件', async () => {
    await start({ chat: { tab: 'paste' } })
    await t.drag('#cDrop', 'drop')
    await t.settle()
    expect(t.same().toasts).toEqual([])
  })
})

describe('对话框：风格、比例、思考强度弹层', () => {
  it('打开风格 → 选一个 → 打开比例 → 选一个 → 再点同一按钮关闭', async () => {
    await start({ asm: { custom: '我的画风' } })
    await t.click('#cStyle')
    t.same()
    expect(t.neu.doc.getElementById('cStylePop')!.className).toBe('cpop open')
    await t.click('#cStylePop button', 3)
    let o = t.same()
    expect(JSON.parse(o.storage['pl.chat']).style).toBe('2D 动漫')
    await t.click('#cRatio')
    t.same()
    await t.click('#cRatioPop button', 1)
    o = t.same()
    expect(JSON.parse(o.storage['pl.chat']).ratio).toBe('16:9')
    await t.click('#cRatio')
    await t.click('#cRatio')
    t.same()
    await t.click('#cStylePop button', 0)
    t.same()
    const n = t.old.doc.querySelectorAll('#cStylePop button').length
    await t.click('#cStylePop button', n - 1)
    t.same()
  })
  it('弹层互斥；点页面其他地方关闭；点思考弹层内部不关闭', async () => {
    await start()
    await t.click('#cStyle')
    await t.click('#cRatio')
    t.same()
    await t.click('#cThink')
    t.same()
    await t.click('#cThinkPop .tk-h')
    t.same()
    await t.click('.wz-head h1')
    t.same()
    await t.click('#cThink')
    await t.click('#cThink')
    t.same()
  })
  it('思考强度滑杆：写 pl.chat.depth；有作品卡时同步写 pl.vibeCard.depth', async () => {
    await start({ chat: { tab: 'paste' }, vibeCard: { pitch: '卡', depth: '轻度' } })
    await t.click('#cThink')
    for (const v of ['2', '1', '0', '9']) {
      await t.input('#cThinkR', v)
      t.same()
    }
    teardown(t)
    await start({ chat: { tab: 'paste' } }, {}, { vibeCard: 'null' })
    await t.input('#cThinkR', '2')
    expect(t.same().storage['pl.vibeCard']).toBe('null')
  })
})

describe('对话框：语音输入（micListen）', () => {
  it('auto：开始 → 识别结果接在原文后（加逗号）→ 再点停止', async () => {
    await start({ chat: { pitch: '重生回到高考前' } })
    await t.click('#cMic')
    let o = t.same()
    expect(o.speech).toEqual(['new', 'start zh-CN true true'])
    await t.speak('我', '要逆袭')
    o = t.same()
    expect(JSON.parse(o.storage['pl.chat']).pitch).toBe('重生回到高考前，我要逆袭')
    await t.click('#cMic')
    await t.settle()
    t.same()
  })
  it('原文以标点结尾不加逗号；原文为空直接接上；结果为空串', async () => {
    for (const pitch of ['已经有标点。', '', '尾巴有空格   ', 'ends?']) {
      teardown(t)
      await start({ chat: { pitch } })
      await t.click('#cMic')
      await t.speak('说的话')
      t.same()
      await t.speak('')
      t.same()
    }
  })
  it('paste 页签没有输入框：先进入编辑再听写；结束事件复原按钮', async () => {
    await start({ chat: { tab: 'paste' } })
    await t.click('#cMic')
    let o = t.same()
    expect(o.focus).toContain('#cDoc')
    await t.speak('口述剧本')
    t.same()
    await t.speechEnd()
    o = t.same()
    await t.speechEnd('onerror')
    t.same()
  })
  it('切换页签时停止正在进行的识别', async () => {
    await start({ chat: { tab: 'novel' } })
    await t.click('#cMic')
    await t.click('#ctabs [data-m="auto"]')
    await t.settle()
    expect(t.same().speech).toEqual(['new', 'start zh-CN true true', 'stop'])
  })
  it('浏览器拒绝 start：提示不支持', async () => {
    await start({}, { speechThrows: true })
    await t.click('#cMic')
    expect(t.same().toasts).toEqual(['这个浏览器不支持语音输入'])
    await t.click('#cMic')
    expect(t.same().speech.filter((x) => x === 'new').length).toBe(2)
  })
})

describe('对话框：发送', () => {
  const WITH_DRAFT = { scriptDraft: { mode: 'paste', title: '旧草稿', pitch: '旧卖点', doc: 'old', extra: 1 } }
  for (const [name, chat, seed] of [
    ['auto：起手话 → 作品卡（猜测受众等）', { pitch: '  被退婚的假千金，靠读心系统在豪门翻盘 ', style: '水墨', ratio: '3:4', ai: 'Grok', depth: '重度' }, {}],
    ['auto：男男题材', { pitch: '霸总和他的男秘书，契约闪婚' }, {}],
    ['paste：带进新增作品（合并已有草稿）', { tab: 'paste', doc: ' 剧本正文 ', style: '无' }, WITH_DRAFT],
    ['paste：无草稿', { tab: 'paste', doc: '剧本正文' }, {}],
    ['novel：够长才可发送', { tab: 'novel', novel: '长'.repeat(2000) }, WITH_DRAFT],
  ] as [string, Record<string, unknown>, Record<string, unknown>][]) {
    it(name, async () => {
      await start({ chat, ...seed })
      await t.click('#cSend')
      const o = t.same()
      expect(o.toasts.length + o.scrolls.length).toBe(1)
    })
  }
  it('内容不足时按钮禁用、点了不做事', async () => {
    for (const chat of [{ tab: 'paste' }, { tab: 'novel', novel: '短' }, { pitch: '   ' }]) {
      teardown(t)
      await start({ chat })
      await t.click('#cSend')
      const o = t.same()
      expect(o.storage['pl.vibeCard']).toBeUndefined()
      expect(o.hash).toBe('')
    }
  })
  it('发送出作品卡后关掉（×）回到输入；底栏、发送按钮状态保持', async () => {
    await start({ chat: { pitch: '起手话' } })
    await t.click('#cSend')
    t.same()
    await t.click('.wc-x')
    const o = t.same()
    expect(o.storage['pl.vibeCard']).toBe('null')
  })
})
