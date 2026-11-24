import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { genReq } from '../../src/domain/gen'
import { YQ_HOT, YQ_WRITE } from '../../src/domain/yq'
import { createWritingEngine, type WritingEngine } from '../../src/features/writing'
import { get, remove, set } from '../../src/lib/storage'
import {
  allEps, AUTH, baseW, CARD, genData, type ListingStub, NOW, runLegacy, runReact, type Scenario, seedOf, type Snap, WID, work, yqGen,
} from './work-harness'

/**
 * 作品页（旧 viewVibeScript）关键路径的新旧行为对照（2026-11-24 起不做逐节点 DOM 比较）：
 * 同一份 localStorage 种子、同一组桩（时钟、随机数、fetch、剪贴板、下载、新窗口），旧页面在 jsdom 里整页实跑，
 * 新组件渲染 WorkPage；每一步后比较关键文案与区块、localStorage 原文、请求、location.hash、提示条、下载文件逐字节、
 * 剪贴板、侧栏上下文、是否在写、上架资料入口的调用与参数。
 * 写作引擎打桩：旧页面换掉 yqDrive / yqChat / listingSources；新组件这边 mock 写作引擎模块，
 * 进入作品页的判断用真引擎实例（fetch 永不返回，只用来看是否开始写），其余入口记录调用。
 */

const H = vi.hoisted(() => ({
  eng: null as unknown as WritingEngine,
  calls: [] as unknown[][],
  listing: null as unknown as { listingSources: (heat: string) => Promise<unknown>; yqChat: (...a: unknown[]) => Promise<string> },
  yq: 0,
}))

vi.mock('../../src/features/writing', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/features/writing')>()
  const rec = (name: 'enterWork' | 'redoEpisode' | 'resumeWriting' | 'retryWork' | 'showDraft' | 'stopYq') => (...a: unknown[]) => {
    H.calls.push([name, ...a])
    return (H.eng[name] as (...x: unknown[]) => unknown)(...a)
  }
  return {
    ...real,
    enterWork: rec('enterWork'), redoEpisode: rec('redoEpisode'), resumeWriting: rec('resumeWriting'), retryWork: rec('retryWork'), showDraft: rec('showDraft'), stopYq: rec('stopYq'),
    getState: (wid: string) => H.eng.getState(wid),
    subscribe: (wid: string, fn: () => void) => H.eng.subscribe(wid, fn),
    listingSources: (heat: string) => H.listing.listingSources(heat),
    yqChat: (...a: unknown[]) => H.listing.yqChat(...a),
  }
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  H.calls = []
  H.yq = 0
  H.eng = createWritingEngine({
    fetch: () => {
      H.yq++
      return new Promise(() => {})
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () => NOW,
    storage: { get, set, remove } as never,
    apiBase: () => '',
    openLogin: () => {},
    toast: () => {},
  })
})
afterEach(() => {
  H.eng.stopAll()
  vi.useRealTimers()
  localStorage.clear()
  location.hash = ''
})

const hooks = { driving: () => H.eng.isRunning(WID), setListing: (x: typeof H.listing) => (H.listing = x) }

async function both(sc: Scenario) {
  const old = await runLegacy(sc)
  const neu = await runReact(sc, hooks)
  if (sc.legacyThrows) expect(old.errors.length && old.errors.every((e) => sc.legacyThrows!.test(e))).toBeTruthy()
  else expect(old.errors).toEqual([])
  expect(neu.frames.length).toBe(old.frames.length)
  old.frames.forEach((f, i) => expect(neu.frames[i], `${sc.name} 第 ${i} 步`).toEqual(f))
  const end = old.frames[old.frames.length - 1]
  const text = old.frames.map((f) => f.text || '').join('|')
  for (const s of sc.has || []) expect(text, `${sc.name} 旧页面应包含 ${s}`).toContain(s.replace(/\s+/g, ''))
  return { old, end, last: (k: number) => old.frames[k] as Snap }
}

const W = baseW()
const HASH = `#/script/v/${WID}`
const done = (over = {}) => work({ gen: yqGen(W, { status: 'done', data: genData(allEps(), { card: CARD }) }), ...over })
const LISTING = { at: NOW - 86400e3, wordsAt: '2027-01-14T08:00:00Z', data: { titles: [{ t: '读心千金', kw: '千金' }, { t: '退婚之后' }], oneLine: '被退婚的千金听见总裁心声', intro: '一场退婚宴，她突然听见所有人的心声。', tags: { evergreen: ['豪门', '逆袭'], timely: [] }, keywords: { short: ['千金'], long: ['被退婚的千金 读心'] } } }

describe('作品页 · 状态页', () => {
  it('作品不存在', async () => {
    const r = await both({ name: 'missing', hash: '#/script/v/nope', local: seedOf([work()]), has: ['找不到这部作品'] })
    expect(r.end.local['pl.lastVibe']).toBeUndefined()
    expect(H.calls).toEqual([])
  })

  it('未登录：登录闸，补主角名与种子，登录后开写进等待页', async () => {
    const w0 = work({ vname: undefined, seed: undefined }, baseW({ pitch: '一场退婚宴上听见人心' }))
    const r = await both({
      name: 'login', hash: HASH, local: seedOf([w0]),
      steps: [{ type: '#gatePhone', value: '123' }, { submit: '#gateForm' }, { type: '#gatePhone', value: '138 0013 8000' }, { submit: '#gateForm' }],
      has: ['输入手机号就能开写', 'AI 正在排大纲'],
    })
    const first = r.last(0)
    expect(JSON.parse(first.local['pl.works'])[0].vname).toBeTruthy()
    expect(first.local['pl.lastVibe']).toBe(JSON.stringify(WID))
    expect(r.last(2).toasts).toEqual(['请输入 8–11 码手机号'])
    expect(r.end.reqs.map((c) => c.url)).toEqual(['/auth/login', '/works'])
    expect(JSON.parse(r.end.local['pl.works'])[0].gen).toMatchObject({ engine: 'yq', status: 'outline', at: NOW })
    expect(r.end.driving).toBe(true)
    expect(H.calls).toEqual([['enterWork', WID], ['enterWork', WID]])
    expect(H.yq).toBe(1)
  })

  it('设定改过（req 不同）且未登录：当作没开写，显示登录闸、不改 gen', async () => {
    const w0 = work({ gen: yqGen(baseW({ genre: '古装' }), { status: 'done', data: genData(allEps()) }) })
    await both({ name: 'stale', hash: HASH, local: seedOf([w0]), has: ['输入手机号就能开写'] })
  })

  for (const [name, over, label] of [
    ['轻度排大纲', {}, 'AI 正在排大纲'],
    ['重度写策划卡', { depth: '重度' }, 'AI 正在写策划卡'],
    ['重度依策划卡', { depth: '重度' }, 'AI 正在依策划卡排大纲'],
  ] as const) {
    it(`等待中：${name}`, async () => {
      const Wx = baseW(over)
      const w0 = work({ gen: yqGen(Wx, { status: 'outline', card: name === '重度依策划卡' ? CARD : null }) }, Wx)
      const r = await both({ name, hash: HASH + '/script', local: seedOf([w0], { auth: AUTH }), has: [label, '00:00'] })
      expect(r.end.driving).toBe(true)
      expect(r.end.local['pl.vibeTab']).toBeUndefined()
    })
  }

  it('等待中（旧版云端作业）：每 8 秒轮询 GET /jobs/:id，完成后进作品页', async () => {
    const w0 = work({ gen: { status: 'queued', at: NOW, id: 'job1' } })
    const r = await both({ name: 'jobs', hash: HASH, local: seedOf([w0], { auth: AUTH }), steps: [{ wait: 1700 }], has: ['AI 正在写这部剧', '甲'] })
    expect(r.end.reqs.map((c) => c.url)).toEqual(['/jobs/job1'])
    expect(JSON.parse(r.end.local['pl.works'])[0].gen.status).toBe('done')
  })

  it('失败页：再写一次 → 重新开写', async () => {
    const w0 = work({ gen: yqGen(W, { status: 'error', err: 'outline empty' }) })
    const r = await both({ name: 'fail-retry', hash: HASH, local: seedOf([w0], { auth: AUTH }), steps: [{ click: '#gRetry' }], has: ['这次没写成', 'AI 正在排大纲'] })
    expect(r.last(0).driving).toBe(false)
    expect(r.end.driving).toBe(true)
    expect(H.calls).toEqual([['enterWork', WID], ['retryWork', WID]])
  })

  it('失败页：先看草稿 → 本地模板草稿', async () => {
    const w0 = work({ gen: { engine: 'old', status: 'error', at: NOW, req: genReq(W) } })
    const r = await both({ name: 'fail-draft', hash: HASH, local: seedOf([w0], { auth: AUTH }), steps: [{ click: '#gDraft' }], has: ['这次没写成', '各集大纲'] })
    expect(JSON.parse(r.end.local['pl.works'])[0].gen.status).toBe('off')
    expect(r.end.driving).toBe(false)
  })

  it('yq 写到一半出错：作品页显示“没写成”，接着写', async () => {
    const w0 = work({ gen: yqGen(W, { status: 'error', err: 'x', data: genData([allEps()[0], null, null]) }) })
    const r = await both({ name: 'resume', hash: HASH + '/outline', local: seedOf([w0], { auth: AUTH }), steps: [{ click: '#gResume' }], has: ['第 2 集没写成', '正在写第 2 / 3 集'] })
    expect(r.end.driving).toBe(true)
    expect(H.calls).toEqual([['enterWork', WID], ['resumeWriting', WID]])
  })
})

describe('作品页 · 写作中与完成后', () => {
  it('写作中：进度条，并接着写', async () => {
    const w0 = work({ gen: yqGen(W, { data: genData([allEps()[0], null, null]) }) })
    const r = await both({ name: 'writing', hash: HASH, local: seedOf([w0], { auth: AUTH }), steps: [{ click: '[data-t="script"]' }], has: ['正在写第 2 / 3 集', '待写'] })
    expect(r.end.driving).toBe(true)
    expect(H.yq).toBe(1)
  })

  it('离开作品页再回来：不停止写作，回来时接着写（同一个任务，不重复请求）', async () => {
    const w0 = work({ gen: yqGen(W, { data: genData([allEps()[0], null, null]) }) })
    const r = await both({ name: 'away', hash: HASH + '/script', local: seedOf([w0], { auth: AUTH }), steps: [{ away: '#/script' }], has: ['正在写第 2 / 3 集'] })
    expect(r.old.drives).toBe(2)
    expect(H.calls).toEqual([['enterWork', WID], ['enterWork', WID]])
    expect(H.calls.some((c) => c[0] === 'stopYq')).toBe(false)
    expect(H.eng.isRunning(WID)).toBe(true)
    expect(H.yq).toBe(1)
  })

  it('写作中：忙线提示', async () => {
    const w0 = work({ gen: yqGen(W, { data: genData([allEps()[0], null, null]), note: '云端忙线，15 秒后第 2 次重试…' }) })
    await both({ name: 'busy', hash: HASH, local: seedOf([w0], { auth: AUTH }), has: ['云端忙线，15 秒后第 2 次重试…'] })
  })

  it('完成后：四个分页、分集大纲弹窗、剧情对话跳转、AI 审稿', async () => {
    const r = await both({
      name: 'tabs', hash: HASH, local: seedOf([done()], { auth: AUTH }),
      steps: [
        { click: '[data-ol="1"]' },
        { click: { legacy: '.modal [data-x]', react: '.modal .mf button' }, doc: true },
        { click: '#vtAI' },
        { click: '[data-sc="2"]' },
        { click: '[data-t="assets"]' },
        { click: '[data-ak="scene"]' },
        { click: '[data-t="board"]' },
        { click: '[data-pv="0"]' },
        { click: '.vm [data-close]', doc: true },
        { click: '[data-t="outline"]' },
      ],
      has: ['策划卡', '主线谜底', '修 2 处', '交易', '已复制', '分镜视频', '做设定板'],
    })
    expect(r.last(3).toasts).toEqual(['已复制，到 Claude 贴上就开始审稿', '已复制到剪贴板'])
    expect(r.last(1).overlay.modal).toContain('与总裁谈条件')
    expect(r.last(3).clip[0]).toContain('你是短剧剧本审稿编辑')
    expect(r.last(3).opens).toEqual([['https://claude.ai/new', '_blank', 'noopener']])
    expect(r.last(4).hash).toBe(HASH + '/script')
    expect(r.last(5).local['pl.vibeTab']).toBe('"assets"')
    expect(r.last(8).overlay.vm).toBeTruthy()
    expect(H.calls).toEqual([['enterWork', WID]])
  })

  for (const vtab of ['board', 'listing']) {
    it(`地址里带分页：${vtab}`, async () => {
      await both({ name: vtab, hash: `${HASH}/${vtab}`, local: seedOf([done()], { vibeTab: 'script' }) })
    })
  }

  it('地址里的分页不存在：旧页面画侧栏时抛错，只剩标题与分页按钮（新页面不抛错，显示相同）', async () => {
    const r = await both({ name: 'xyz', hash: `${HASH}/xyz`, local: seedOf([done()]), legacyThrows: /reading 'label'/, has: ['各集大纲'] })
    expect(r.end.local['pl.vibeTab']).toBe('"xyz"')
    expect(r.end.dom!['#vtTabs button'].every((x) => x.includes('|false|'))).toBe(true)
  })

  it('地址没带分页时用上次的分页（pl.vibeTab）', async () => {
    const r = await both({ name: 'vibeTab', hash: HASH, local: seedOf([done()], { vibeTab: 'script' }), has: ['EP01'] })
    expect(r.end.hash).toBe(HASH + '/script')
  })

  it('本地模板草稿（status off）与模型人物缺失时的资产条目', async () => {
    const w0 = work({ gen: { status: 'off' } })
    await both({ name: 'draft', hash: HASH + '/assets', local: seedOf([w0]), steps: [{ click: '[data-ak="scene"]' }, { click: '[data-ak="role"]' }, { click: '[data-t="script"]' }], has: ['对手', '主要场景'] })
  })

  it('角色资产库：点卡片带条目进资产库', async () => {
    const r = await both({ name: 'asset-pick', hash: HASH + '/assets', local: seedOf([done()]), steps: [{ click: '[data-as="1"]', nav: true }] })
    expect(r.end.hash).toBe('#/assets/role-board')
    expect(JSON.parse(r.end.local['pl.assetPick'])).toMatchObject({ fn: 'role-board', name: '陆沉', k: 1, wid: WID })
    expect(JSON.parse(r.end.local['pl.assetSeed']).items.length).toBeGreaterThan(3)
  })

  it('分镜图：编辑与弹层“去生成”跳组装器', async () => {
    const a = await both({ name: 'board-edit', hash: HASH + '/board', local: seedOf([done()]), steps: [{ click: '[data-sb="2"]', nav: true }] })
    expect(a.end.hash).toBe(`#/assembler?ep=${WID}.2`)
    const b = await both({ name: 'board-gen', hash: HASH + '/board', local: seedOf([done()]), steps: [{ click: '[data-vid="1"]' }, { click: '.vm [data-gen]', doc: true, nav: true }] })
    expect(b.end.hash).toBe(`#/assembler?ep=${WID}.1`)
    expect(b.end.overlay.vm).toBeNull()
    const c = await both({ name: 'board-seg-gen', hash: HASH + '/board', local: seedOf([done()]), steps: [{ click: '[data-pv="2"]' }, { click: '.vm [data-gen]', doc: true, nav: true }] })
    expect(c.last(1).overlay.vm).toContain('董事会')
    expect(c.end.hash).toBe(`#/assembler?ep=${WID}.2`)
  })

  it('重写单集', async () => {
    const r = await both({ name: 'redo', hash: HASH + '/script', local: seedOf([done()], { auth: AUTH }), steps: [{ click: '[data-redo="1"]' }], has: ['重写', '正在写第 2 / 3 集'] })
    const g = JSON.parse(r.end.local['pl.works'])[0].gen
    expect([g.status, g.data.eps[1]]).toEqual(['writing', null])
    expect(r.end.driving).toBe(true)
    expect(H.calls).toEqual([['enterWork', WID], ['redoEpisode', WID, 1]])
  })
})

describe('作品页 · 导出', () => {
  it('项目 ZIP 与 XTASY 导入包逐字节相同、文件名、提示条、菜单开关', async () => {
    const w0 = done({ title: '读心/千金:第一季', listing: LISTING })
    const r = await both({
      name: 'export', hash: HASH, local: seedOf([w0]),
      steps: [{ click: '#vtExport' }, { click: 'h1', doc: true }, { click: '#vtExport' }, { click: '#exportZip' }, { click: '#vtExport' }, { click: '#exportXtasy' }],
      has: ['导出到本地（ZIP）'],
    })
    expect(r.last(1).dom!['#exportMenu'][0]).toMatch(/^true/)
    expect(r.last(2).dom!['#exportMenu'][0]).toMatch(/^false/)
    expect(r.end.downloads.map((d) => d.name)).toEqual(['读心-千金-第一季-天玑项目.zip', '读心-千金-第一季-XTASY导入包.zip'])
    expect(r.end.downloads[0].bytes).toBe(r.end.downloads[1].bytes)
    expect(r.end.downloads[0].bytes).toMatch(/^application\/zip:504b0304/)
    expect(r.end.toasts).toEqual(['项目 ZIP 已导出到本地', 'XTASY 导入包已下载，请在新页面选择导入'])
    expect(r.end.opens).toEqual([['https://xtasyart.com/', '_blank', 'noopener']])
  })

  it('没有上架资料、本地草稿时的导出', async () => {
    const w0 = work({ gen: { status: 'off' } }, baseW({ ratio: '16:9' }))
    const r = await both({ name: 'export-draft', hash: HASH, local: seedOf([w0]), steps: [{ click: '#vtExport' }, { click: '#exportZip' }] })
    expect(r.end.downloads.length).toBe(1)
  })
})

describe('作品页 · 上架资料', () => {
  const REPLY = '好的：{"titles":[{"t":"读心千金","kw":"千金"},"退婚之后",{"t":"学生会长"}],"oneLine":"被退婚的千金听见总裁心声 ","intro":"一场退婚宴，她听见了所有人的心声。","tags":{"evergreen":["豪门","逆袭","校园"],"timely":["读心"]},"keywords":{"short":["千金","总裁"],"long":["被退婚的千金 读心"]}}'
  const SRC = { words: ['读心（热度 90，上升）'], topics: ['退婚宴（娱乐，热）'], at: '2027-01-15' }
  const listingRun = (name: string, stub: ListingStub, local: Record<string, string>, steps: Scenario['steps'] = [{ click: '#lstGo' }]) =>
    both({ name, hash: HASH + '/listing', local, listing: stub, steps })

  it('大纲没写好时不能生成', async () => {
    await both({ name: 'no-outline', hash: HASH + '/listing', local: seedOf([work({ gen: { status: 'off' } })]), has: ['大纲写好后才能生成上架资料。'] })
  })

  it('未登录点生成：打开登录面板后同一次点击冒泡到 document 又关上（旧页面如此），不调用写作', async () => {
    const r = await listingRun('lst-login', { src: SRC, reply: REPLY }, seedOf([done()]))
    expect(r.end.account).toBe(false)
    expect(r.end.chat).toEqual([])
  })

  it('生成中、生成完成写回作品、复制与下载', async () => {
    const r = await listingRun('lst-ok', { gate: true, src: SRC, reply: REPLY }, seedOf([done()], { auth: AUTH }), [
      { click: '#lstGo' }, { release: true }, { click: '[data-lcp]', nth: 0 }, { click: '#lstCp' }, { click: '#lstDl' }, { click: '[data-t="outline"]' }, { click: '[data-t="listing"]' },
    ])
    expect(r.last(1).dom!['#lstGo'][0]).toBe('true|ui-btn primary|正在生成…')
    expect(r.last(1).chat).toEqual([['listingSources', '正常']])
    const call = r.end.chat[1]
    expect([call[0], call[1], call[3]]).toEqual(['yqChat', YQ_WRITE, 2500])
    expect(JSON.parse(r.end.local['pl.works'])[0].listing).toMatchObject({ at: NOW, wordsAt: '2027-01-15', data: { titles: [{ t: '读心千金', kw: '千金' }, { t: '退婚之后' }], tags: { evergreen: ['豪门', '逆袭'] } } })
    expect(r.end.toasts.slice(0, 1)).toEqual(['上架资料已生成'])
    expect(r.end.clip[0]).toBe('读心千金\n退婚之后')
    expect(r.end.clip[1]).toMatch(/^【上架资料】《读心千金》/)
    expect(r.end.downloads[0].name).toBe('读心千金-上架资料.txt')
    expect(r.end.downloads[0].bytes).toMatch(/^text\/plain;charset=utf-8:efbbbf/)
  })

  it('高尺度用 YQ_HOT；积分不足原样提示；其他错误与不完整统一提示', async () => {
    const hot = done()
    hot.W = baseW({ heat: '高尺度' })
    hot.gen!.req = genReq(hot.W)
    const a = await listingRun('lst-hot', { src: SRC, reply: REPLY }, seedOf([hot], { auth: AUTH }))
    expect(a.end.chat[1][1]).toBe(YQ_HOT)
    expect(a.end.chat[0]).toEqual(['listingSources', '高尺度'])
    const b = await listingRun('lst-points', { src: SRC, error: '积分不足' }, seedOf([done()], { auth: AUTH }))
    expect(b.end.toasts).toEqual(['积分不足'])
    const c = await listingRun('lst-bad', { src: SRC, reply: '{"titles":[],"intro":""}' }, seedOf([done()], { auth: AUTH }))
    expect(c.end.toasts).toEqual(['没生成成功，再试一次'])
    expect(JSON.parse(c.end.local['pl.works'])[0].listing).toBeUndefined()
  })

  it('已有上架资料：显示、重新生成', async () => {
    const r = await listingRun('lst-again', { src: SRC, reply: REPLY }, seedOf([done({ listing: LISTING })], { auth: AUTH }))
    expect(r.last(0).dom!['.lst-r'].length).toBe(7)
    expect(JSON.parse(r.end.local['pl.works'])[0].listing.at).toBe(NOW)
  })
})
