import { afterAll, describe, expect, it, vi } from 'vitest'
import { freshEngine, legacyEngine, plain, type Reply, type Responder } from './writing-harness'

/* 上架资料来源 listingSources 的新旧对照：/words 与 /hot 的各种回应下，返回值与 fetch 调用（URL、单参数调用）相同。 */

// 新旧两边都在 vm 与虚拟时钟里整段实跑，单个用例的比较次数多，放宽超时。
vi.setConfig({ testTimeout: 120000 })
let compared = 0
afterAll(() => console.log(`[parity writing-listing] ${compared} 次新旧对照`))

const WORDS = [
  { word: '#霸总', cat: '娱乐', heat: 90, trend: '上升' }, { word: '霸总', cat: '娱乐', heat: 95, trend: '持平' }, { word: '甲', cat: '娱乐', heat: 99, trend: '上升' },
  { word: '一个', cat: '娱乐', heat: 80, trend: '上升' }, { word: '学生会', cat: '社会', heat: 70, trend: '上升' }, { word: '射精', cat: '娱乐', heat: 60, trend: '上升' },
  { word: '阴谋', cat: '娱乐', heat: 65, trend: '下降' }, { word: '名单词', cat: '社会，名单命中', heat: 100, trend: '上升' }, { word: '没热度', cat: '娱乐', trend: '新' },
  { word: 12345, cat: '数字', heat: 50, trend: '上升' }, { word: null, cat: '空', heat: 50 }, { word: '抖音热梗', heat: 77, trend: '上升' },
  ...Array.from({ length: 40 }, (_, i) => ({ word: `热词${i}`, cat: i % 5 ? '娱乐' : '情感', heat: (i * 37) % 101, trend: i % 2 ? '上升' : '下降' })),
]
const TOPICS = [
  { t: '豪门继承', cat: '娱乐', trend: '上升' }, { t: '某国大选', cat: '国际', trend: '上升' }, { t: '演习', cat: '军事', trend: '上升' }, { t: '政策', cat: '时政', trend: '上升' },
  { t: '校园霸凌', cat: '社会', trend: '上升' }, { t: '无分类', trend: '' }, { t: '无趋势', cat: '情感' }, { cat: '娱乐' },
  ...Array.from({ length: 20 }, (_, i) => ({ t: `热点${i}`, cat: '娱乐', trend: '持平' })),
]

type Spec = Reply | 'net'
async function compare(heat: string, words: Spec, hot: Spec, apiBase = '') {
  const server = (): Responder => (req) => {
    const s = req.url.endsWith('/words') ? words : hot
    return s === 'net' ? { net: true } : s
  }
  const L = legacyEngine({ server, apiBase })
  let rl: unknown
  ;(L.call('listingSources', heat) as Promise<unknown>).then((v) => (rl = plain(v)), (e) => (rl = { err: String(e.message) }))
  await L.clock.run(() => rl !== undefined)
  const F = freshEngine({ server, apiBase })
  let rf: unknown
  F.engine.listingSources(heat).then((v) => (rf = v), (e) => (rf = { err: String(e.message) }))
  await F.clock.run(() => rf !== undefined)
  F.dispose()
  compared++
  expect(rf).toEqual(rl)
  expect(F.trace.events).toEqual(L.trace.events)
  return rf as { words: string[]; topics: string[]; at: string }
}

describe('listingSources', () => {
  const ok = (json: unknown): Reply => ({ json })
  const specs: Spec[] = [ok({ words: WORDS, topics: TOPICS, at: '2026-11-24T08:00:00Z' }), ok({ words: WORDS, at: '' }), ok({ topics: TOPICS, at: '2026-11-23' }), ok({}), { status: 503, json: { error: 'not pushed' } }, { status: 200, text: '不是 JSON' }, 'net', ok({ words: null, topics: 'x' })]
  it('两个接口各种回应的组合 × 三档尺度 × 后端地址', async () => {
    for (const heat of ['点到为止', '正常', '高尺度', '']) for (const w of specs) for (const h of specs) for (const base of ['', 'https://api.example.test']) await compare(heat, w, h, base)
  })
  it('过滤规则：名单命中、短词、停用词、红线、低尺度去掉露骨词、按热度取前 30；热点去掉政军国际与红线、取前 15', async () => {
    const r = await compare('正常', ok({ words: WORDS, at: 'a1' }), ok({ topics: TOPICS, at: 'a2' }))
    expect(r.words).toHaveLength(30)
    expect(r.words[0]).toBe('热词30（热度 100，下降）')
    expect(r.words).toContain('霸总（热度 95，持平）')
    expect(r.words).toContain('#霸总（热度 90，上升）')
    expect(r.words.some((x) => /射精|阴谋|学生|名单词|一个|抖音/.test(x))).toBe(false)
    expect(r.topics).toHaveLength(15)
    expect(r.topics[0]).toBe('豪门继承（娱乐，上升）')
    expect(r.at).toBe('a1')
    const hi = await compare('高尺度', ok({ words: WORDS }), ok({ topics: [], at: 'a2' }))
    expect(hi.words.some((x) => x.startsWith('阴谋'))).toBe(true)
    expect(hi.at).toBe('a2')
  })
})
