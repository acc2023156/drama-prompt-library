import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cmpId, firstCode, licClass, makeById, makeLib, sortEntries, usage } from '../../src/domain/library'
import { DEFAULT_FILTER, filtered, type PromptFilterState } from '../../src/domain/prompts-filter'
import { mergeCloudWorks, pendingPush, workHash } from '../../src/domain/sync'
import type { Entry, Work } from '../../src/domain/types'
import { liveWorks, purgeTrash, TRASH_DAYS, workHref, workType } from '../../src/domain/works'
import { esc, nfmt } from '../../src/domain/text'
import { loadData } from './data'
import type { Legacy } from './legacy'
import { callLegacy, fixLegacyNow, legacyOutcome, legacyWith, lit, norm, outcome, printStats, same, setLegacyStore } from './domain-helpers'
import { workList } from './domain-fixtures'

let L: Legacy
const data = loadData()
const entries: Entry[] = data.entries
beforeAll(() => {
  L = legacyWith()
})
afterAll(() => printStats('base'))

describe('提示词库基础函数', () => {
  it('cmpId / sortEntries / makeById 与旧 ENTRIES、byId 相等', () => {
    same('sortEntries(ENTRIES)', sortEntries(entries).map((e) => e.id), L.run('ENTRIES.map(e=>e.id)'))
    same('makeById', Object.keys(makeById(entries)), L.run('Object.keys(byId)'))
    same('makeById(取值)', makeById(entries)['2.5'], L.run("byId['2.5']"))
    const ids = ['2.10', '2.2', '1.1', '10.1', '2.1', '0.5', '1.10', '1.2', '3.0', '6.5', '6.0']
    same('cmpId(排序)', ids.slice().sort(cmpId), L.run(`${lit(ids)}.sort(cmpId)`))
    for (const a of ids) for (const b of ids) same('cmpId', cmpId(a, b), callLegacy(L, 'cmpId', a, b))
    for (const [a, b] of [['a.b', '1.1'], ['1', '1.1'], ['1.1', '1'], ['', ''], ['1.x', '1.y']]) same('cmpId(异常)', outcome(() => cmpId(a, b)), legacyOutcome(L, `cmpId(${lit(a)},${lit(b)})`))
  })
  it('firstCode / usage / licClass：真实 90 条与边界文本', () => {
    const mds: string[] = [...entries.map((e) => e.body), '', '无代码块', '```\n只有开头', '```\n\n```', '```js\nA\n```\n```\nB\n```', '```\r\nA\r\n```', '前\n```x\nA\nB\n```\n后', '**用法**: 冒号英文\n', '**用法**：`代码`和*强调*\n下一行', '**用法**：', '**用法**:   ']
    for (const md of mds) {
      same('firstCode', firstCode(md), callLegacy(L, 'firstCode', md))
      same('usage', usage(md), callLegacy(L, 'usage', md))
    }
    for (const l of [...new Set(entries.map((e) => e.license)), '', '内部使用', '仅参考', '可直接用', '内部仅参考']) same('licClass', licClass(l), callLegacy(L, 'licClass', l))
    for (const x of [undefined, null, 5]) same('firstCode(异常)', outcome(() => firstCode(x as any)), legacyOutcome(L, `firstCode(${lit(x)})`))
  })
  it('makeLib：每条编号取代码块，未知编号返回空串', () => {
    const lib = makeLib(entries)
    for (const e of entries) same('lib', lib(e.id), callLegacy(L, 'lib', e.id))
    for (const id of ['', '999.9', 'x', 'constructor', '__proto__']) same('lib(未知)', outcome(() => lib(id)), legacyOutcome(L, `lib(${lit(id)})`))
  })
  it('esc / nfmt', () => {
    for (const s of ['', 'a&b', '<script>"x"</script>', "单引号'不转义", '中文', 5, null, undefined, { toString: () => '<' }]) same('esc', outcome(() => esc(s)), legacyOutcome(L, `esc(${s && typeof s === 'object' ? '({toString:()=>"<"})' : lit(s)})`))
    for (const n of [0, 1, 999, 1000, 123456, 1234567.891, -4321, 400, 1e21]) same('nfmt', nfmt(n), callLegacy(L, 'nfmt', n))
  })
})

describe('filtered 提示词筛选', () => {
  it('搜索词 × 授权筛选 × 只看已用于生产', () => {
    const qs = ['', ' ', '剧本', '  格式  ', '2.5', '用于生产', 'ZZZ不会命中ZZZ', '提示', 'A', 'a', '。', '.', '1', '成人']
    for (const q of qs) for (const lic of ['all', 'direct', 'ref', 'int', 'other']) for (const prod of [false, true]) {
      const st: PromptFilterState = { q, lic, prod }
      const old = L.run(`(()=>{Object.assign(state,${lit(st)});return filtered(ENTRIES).map(e=>e.id)})()`)
      same('filtered', filtered(sortEntries(entries), st).map((e) => e.id), old)
    }
    expect(filtered(entries, { ...DEFAULT_FILTER }).length).toBe(entries.length)
    expect(filtered(entries, { q: '', lic: 'direct', prod: true }).length).toBeLessThan(entries.length)
  })
  it('缺 status、license 的合成条目', () => {
    const syn = [
      { id: '1.1', title: 'T', body: 'B', license: '可直接用' }, { id: '1.2', title: 't', body: 'b', license: '内部使用', status: '已用于生产' }, { id: '1.3', title: 'x', body: 'y', license: '仅参考' },
      { id: '1.4', title: 'u', body: 'v', license: '可直接使用' }, { id: '1.5', title: 'u', body: 'v', license: '内部可直接用' },
    ]
    const l = legacyWith()
    for (const st of [{ q: '', lic: 'direct', prod: false }, { q: '', lic: 'all', prod: false }, { q: 't', lic: 'all', prod: false }, { q: '', lic: 'int', prod: true }, { q: 'B', lic: 'direct', prod: false }, { q: '1.3 x y', lic: 'ref', prod: false }]) {
      const old = l.run(`(()=>{Object.assign(state,${lit(st)});return filtered(${lit(syn)}).map(e=>e.id)})()`)
      same('filtered(合成)', filtered(syn as any, st).map((e) => e.id), old)
    }
    for (const bad of [{ id: '1', title: 'a', body: 'b' }]) same('filtered(异常)', outcome(() => filtered([bad] as any, { q: '', lic: 'direct', prod: false })), legacyOutcome(L, `(Object.assign(state,{q:'',lic:'direct',prod:false}),filtered(${lit([bad])}))`))
  })
})

describe('作品列表规则', () => {
  const NOW = 1_764_000_000_000
  const CUT = NOW - TRASH_DAYS * 864e5
  const trashList = (): Work[] =>
    [
      { id: 'a', trashed: CUT - 1 }, { id: 'b', trashed: CUT }, { id: 'c', trashed: CUT + 1 }, { id: 'd', trashed: 0 }, { id: 'e' }, { id: 'f', trashed: NOW }, { id: 'g', trashed: CUT - 86400000 * 400 },
    ].map((w) => ({ title: w.id, W: {}, ...w })) as Work[]
  it('TRASH_DAYS 与 liveWorks', () => {
    same('TRASH_DAYS', TRASH_DAYS, L.run('TRASH_DAYS'))
    for (const list of [workList(), trashList(), [], undefined]) {
      setLegacyStore(L, 'works', list)
      same('liveWorks', liveWorks(list as any), L.run('liveWorks()'))
    }
  })
  it('purgeTrash：边界时间、已登录 / 未登录（旧实现 DELETE 云端作品）', () => {
    for (const auth of [null, { token: 't', user: { uid: 1 } }]) {
      for (const list of [trashList(), workList(), [], undefined]) {
        const l = legacyWith()
        setLegacyStore(l, 'works', list)
        setLegacyStore(l, 'auth', auth ?? undefined)
        fixLegacyNow(l, NOW)
        l.run('(()=>{window.__del=[];api=(p,o)=>{__del.push([p,o&&o.method]);return Promise.resolve({})};return 1})()')
        l.run('(purgeTrash(),1)')
        const oldStore = JSON.parse(l.storage.getItem('pl.works') ?? 'null')
        const oldDel = l.run<unknown[]>('__del')
        const r = purgeTrash(norm(list) as any, NOW)
        const written = r.gone.length ? r.kept : (norm(list) ?? null)
        same('purgeTrash(写回)', written, oldStore)
        same('purgeTrash(删云端)', auth ? r.gone.map((w) => ['/works/' + encodeURIComponent(w.id), 'DELETE']) : [], oldDel)
      }
    }
    const r = purgeTrash(trashList(), NOW)
    expect(r.gone.map((w) => w.id)).toEqual(['a', 'g'])
    expect(r.kept.map((w) => w.id)).toEqual(['b', 'c', 'd', 'e', 'f'])
  })
  it('workHref / workType', () => {
    const ws: any[] = []
    for (const kind of ['simple', 'vibe', undefined, 'other']) for (const mode of ['auto', 'paste', 'novel', 'weird', undefined]) ws.push({ id: 'w1', kind, W: { mode } })
    ws.push({ id: 'x', W: undefined }, { id: 'x', W: null }, { id: 'x', kind: 'simple' }, { id: 'a/b?c', kind: 'vibe', W: {} })
    for (const w of ws) {
      same('workHref', outcome(() => workHref(w)), legacyOutcome(L, `workHref(${lit(w)})`))
      same('workType', outcome(() => workType(w)), legacyOutcome(L, `workType(${lit(w)})`))
    }
  })
})

describe('云同步合并规则', () => {
  const sample = (): any[] => [
    { id: 'a', title: 'A', time: 100, W: {} }, { id: 'b', title: 'B', time: 300, W: { pitch: 'x' } }, { id: 'c', title: 'C', time: 200, W: {} }, { id: 'noTime', title: 'N', W: {} }, { id: '10', title: '数字 id', time: 50, W: {} }, { id: '2', title: '数字 id 2', time: 60, W: {} },
  ]
  it('workHash', () => {
    const vs: unknown[] = [{}, [], '', 'x', 0, 1, null, true, { a: 1 }, { a: 1, b: [1, 2, { c: '中文' }] }, '中'.repeat(5000), ...sample(), ...workList(), { time: 1.5e12 }, { s: '😀' }]
    for (const v of vs) same('workHash', workHash(v), callLegacy(L, 'workHash', v))
  })
  async function legacyRound(local: unknown[] | undefined, remote: unknown[]) {
    const l = legacyWith()
    setLegacyStore(l, 'auth', { token: 't', user: { uid: 1 } })
    setLegacyStore(l, 'works', local)
    l.run(`(()=>{window.__calls=[];api=async(p,o)=>{__calls.push([p,(o&&o.method)||'GET',o&&o.body]);if(p==='/works'&&!(o&&o.method))return {works:${lit(remote)}};return {}};setTimeout=(f)=>{Promise.resolve().then(f);return 0};return 1})()`)
    l.run('(cloudPull(),1)')
    await new Promise((r) => setTimeout(r, 0))
    return { merged: JSON.parse(l.storage.getItem('pl.works') ?? 'null'), calls: l.run<unknown[][]>('__calls').slice(1), hash: l.run('cloudHash') }
  }
  it('mergeCloudWorks + pendingPush 与旧 cloudPull / cloudPush 的写回、推送序列、指纹相等', async () => {
    const rem = (...ws: any[]) => ws.map((w) => ({ id: w.id, data: w }))
    const scenarios: [string, any[] | undefined, any[]][] = [
      ['本地空、云端有', [], rem(...sample())],
      ['本地无存储键', undefined, rem(...sample())],
      ['云端空、本地有', sample(), []],
      ['云端更新', sample(), rem({ id: 'a', title: 'A云', time: 101, W: {} }, { id: 'b', title: 'B云', time: 299, W: {} })],
      ['云端相同 time', sample(), rem({ id: 'a', title: 'A云', time: 100, W: {} })],
      ['云端无 time', sample(), rem({ id: 'noTime', title: '云', W: {} })],
      ['本地无 time、云端有 time', sample(), rem({ id: 'noTime', title: '云', time: 1, W: {} })],
      ['云端有本地没有', sample().slice(0, 2), rem({ id: 'z', title: 'Z', time: 999, W: {} }, { id: 'y', title: 'Y', time: 1, W: {} })],
      ['全部一致（不需要推送）', sample(), rem(...sample())],
      ['数字 id（对象键重排）', sample(), rem({ id: '3', title: 't', time: 70, W: {} }, { id: '10', title: '云', time: 51, W: {} })],
      ['time 相同的排序', [{ id: 'p', time: 5, W: {} }, { id: 'q', time: 5, W: {} }], rem({ id: 'r', time: 5, W: {} })],
    ]
    for (const [name, local, remote] of scenarios) {
      const old = await legacyRound(local, remote)
      const m = mergeCloudWorks(norm(local ?? []) as any, norm(remote) as any)
      const pend = pendingPush(m.merged, m.cloudHash)
      const hash = { ...m.cloudHash, ...Object.fromEntries(pend.map((p) => [p.work.id, p.hash])) }
      const calls = pend.map((p) => ['/works/' + encodeURIComponent(p.work.id), 'POST', JSON.stringify(p.work)])
      same('mergeCloudWorks(写回)', m.merged, old.merged)
      same('pendingPush(推送序列)', calls, old.calls)
      same('mergeCloudWorks+pendingPush(指纹)', hash, old.hash)
      expect(name).toBeTruthy()
    }
  })
  it('合并不改入参', () => {
    const local = norm(sample()) as Work[]
    const remote = norm([{ id: 'a', data: { id: 'a', title: '云', time: 999, W: {} } }]) as any
    const before = JSON.stringify([local, remote])
    const m = mergeCloudWorks(local, remote)
    pendingPush(m.merged, m.cloudHash)
    expect(JSON.stringify([local, remote])).toBe(before)
  })
})
