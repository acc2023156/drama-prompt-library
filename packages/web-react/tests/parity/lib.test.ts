import { parse } from 'acorn'
import vm from 'node:vm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASSET_FN, ASSET_NAV, FUNCS } from '../../src/app/nav-data'
import { maskPhone, ROLE_NAME } from '../../src/lib/auth'
import * as S from '../../src/lib/storage'
import { zipCrc, zipParts } from '../../src/lib/zip'
import { loadData } from './data'
import { type Legacy, MemoryStorage, loadLegacy, readLegacyTemplate } from './legacy'

describe('存储格式：set / get 与旧 store() 写出的原文逐字节相等', () => {
  let legacy: Legacy
  let mem: MemoryStorage
  beforeAll(() => {
    legacy = loadLegacy({ data: loadData() })
  })
  beforeEach(() => {
    mem = new MemoryStorage()
    vi.stubGlobal('localStorage', mem)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const samples: Record<S.StoreKey, unknown[]> = {
    works: [[{ id: 'w1', title: '剧', kind: 'vibe', time: 1, W: { aud: '女性向' }, gen: { status: 'done', data: { eps: ['一', null] } } }], []],
    auth: [{ token: 'tok', user: { uid: 'u', phone: '138', role: 'tester', points: null, cap: null } }],
    chat: [{ tab: 'auto', doc: '', pitch: '退婚', novel: '', editing: false, style: '', ratio: '9:16', ai: 'x', depth: 'deep' }],
    vibeCard: [{ mode: 'auto', pitch: '“引号”\n换行', hooks: ['逆袭'] }],
    scriptDraft: [{ mode: 'paste', doc: '<script>' }],
    sxPick: [{ g: 'male', idx: null, name: '', title: '', q: '' }, { g: 'female', idx: 3 }],
    assets: [[{ fn: 'role-board', name: '林', prompt: 'p', state: { opts: [] }, time: 5 }]],
    assetSeed: [{ wid: 'w1', title: 't', items: [{ fn: 'role-new', label: 'a', done: true }] }],
    assetPick: [{ fn: 'role-new', name: 'n', profile: 'p' }],
    asm: [{ style: '__custom', custom: '水墨' }],
    asmW: [{ w1: { style: '赛博', custom: '' } }],
    lastVibe: ['w1'],
    vibeTab: ['listing'],
    pro: [true, false],
    homeMode: ['lib', 'create'],
    libNav: [{ lv: 'role', g: 'male', i: 2 }],
    tjCode: ['abc 中文'],
    panel: [true, false],
  }

  it('覆盖全部 18 个键：与旧模板里全部 store(<字面量>) 调用的键集合相等', () => {
    expect(S.STORE_KEYS.length).toBe(18)
    expect(Object.keys(samples).sort()).toStrictEqual([...S.STORE_KEYS].sort())
    const html = readLegacyTemplate()
    const script = html.slice(html.indexOf('\n<script>\n') + 10, html.lastIndexOf('\n</script>'))
    const keys = new Set<string>()
    const walk = (n: any): void => {
      if (!n || typeof n.type !== 'string') return
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'store' && n.arguments[0]?.type === 'Literal') keys.add(n.arguments[0].value)
      for (const v of Object.values(n)) Array.isArray(v) ? v.forEach(walk) : v && typeof v === 'object' && walk(v)
    }
    walk(parse(script, { ecmaVersion: 'latest' }))
    expect([...keys].sort()).toStrictEqual([...S.STORE_KEYS].sort())
  })

  for (const k of S.STORE_KEYS) {
    it(`pl.${k}`, () => {
      for (const v of [...samples[k], null]) {
        legacy.run(`(store(${JSON.stringify(k)}, ${JSON.stringify(v)}), 1)`)
        S.set(k, v as never)
        expect(mem.getItem('pl.' + k)).toBe(legacy.storage.getItem('pl.' + k))
        expect(S.get(k)).toStrictEqual(legacy.run(`store(${JSON.stringify(k)})`))
      }
    })
  }

  it('null 语义：写 null 存字符串 null 且不删键；读缺失键、损坏 JSON 都是 null', () => {
    S.set('sxPick', null)
    expect(mem.getItem('pl.sxPick')).toBe('null')
    expect(mem.length).toBe(1)
    expect(S.get('sxPick')).toBeNull()
    expect(S.get('lastVibe')).toBeNull()
    mem.setItem('pl.chat', '{bad')
    legacy.storage.setItem('pl.chat', '{bad')
    expect(S.get('chat')).toBeNull()
    expect(legacy.run("store('chat')")).toBeNull()
  })

  it('isPro：缺省为 true，只有 false 才是标准版', () => {
    for (const raw of [null, 'true', 'false', 'null', '0', '"false"']) {
      if (raw === null) {
        mem.removeItem('pl.pro')
        legacy.storage.removeItem('pl.pro')
      } else {
        mem.setItem('pl.pro', raw)
        legacy.storage.setItem('pl.pro', raw)
      }
      expect(S.isPro(), String(raw)).toBe(legacy.run<boolean>('isPro()'))
    }
  })

  it('登出删除 pl.auth（旧 authSet(null) 的 removeItem）', async () => {
    const { authSet } = await import('../../src/lib/auth')
    authSet({ token: 't', user: { uid: 'u', phone: '', role: 'free', points: 1 } })
    expect(mem.getItem('pl.auth')).not.toBeNull()
    authSet(null)
    expect(mem.getItem('pl.auth')).toBeNull()
    expect(mem.length).toBe(0)
  })
})

describe('工具函数与旧实现相等', () => {
  let legacy: Legacy
  beforeAll(() => {
    legacy = loadLegacy({ data: loadData() })
  })

  it('maskPhone、ROLE_NAME', () => {
    for (const p of ['13800138000', '1234567', '123456', '', null, undefined]) expect(maskPhone(p), String(p)).toBe(legacy.run(`maskPhone(${JSON.stringify(p) ?? 'undefined'})`))
    expect(ROLE_NAME).toStrictEqual(legacy.run('ROLE_NAME'))
  })



  it('FUNCS、资产库侧栏目录与旧 ASSET_MENUS / FN 一致', () => {
    expect(FUNCS).toStrictEqual(legacy.run('FUNCS'))
    expect(ASSET_NAV).toStrictEqual(legacy.run('ASSET_MENUS.map(m=>({key:m.key,title:m.title,items:m.items.map(i=>({id:i.id,icon:i.icon,label:i.label}))}))'))
    expect(ASSET_FN).toStrictEqual(legacy.run('Object.fromEntries(Object.entries(FN).map(([k,v])=>[k,{label:v.label,menu:v.menu.key}]))'))
  })

  it('makeZip 字节与旧实现逐字节相等（含 BOM 规则与 UTF-8 文件名）', () => {
    // 旧 makeZip 依赖 TextEncoder 与 Blob，抽取器的 vm 里没有；取出函数源码放进带这两者的新 vm 里运行
    const src = legacy.run<string>('[zipCrc, makeZip].map(f=>f.toString()).join("\\n")')
    class FakeBlob {
      constructor(public parts: Uint8Array[], public opt: unknown) {}
    }
    const ctx = vm.createContext({ TextEncoder, Blob: FakeBlob, Uint8Array })
    vm.runInContext(src, ctx)
    const files = [
      { name: '剧本/第1集.txt', text: '台词\n“引号”' },
      { name: 'data.json', text: '{"a":1}' },
      { name: 'DATA.JSON', text: '' },
      { name: 'readme.md', text: 'x'.repeat(70000) },
    ]
    const old: FakeBlob = vm.runInContext(`makeZip(${JSON.stringify(files)})`, ctx)
    const concat = (a: Uint8Array[]) => Buffer.concat(a.map((x) => Buffer.from(x)))
    expect(concat(zipParts(files)).equals(concat(old.parts))).toBe(true)
    expect(JSON.stringify(old.opt)).toBe('{"type":"application/zip"}')
    const bytes = new TextEncoder().encode('天玑')
    expect(zipCrc(bytes)).toBe(vm.runInContext(`zipCrc(new TextEncoder().encode('天玑'))`, ctx))
  })

})
