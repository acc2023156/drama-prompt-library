import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseRoute } from '../../src/app/routes'
import { MemoryStorage } from '../parity/legacy'

const deps = { entryFolder: () => '02-adaptation', findWork: (id: string) => (id === 'wabc' ? { id, title: 't' } : undefined) }

/**
 * 页面组件 → 所属任务包。按组件名判断分派，不渲染：占位页被真实页面替换后这里不用改，
 * 页面模块 import 时会读 #tj-data（src/data.ts），所以先放一个空内容的假 document 再动态 import。
 */
const PKG_OF: Record<string, string> = {
  MembershipPage: 'P2-C', PartnerPage: 'P2-C',
  PromptEntryPage: 'P2-A', PromptListPage: 'P2-A', ChangelogPage: 'P2-A',
  AssemblerPage: 'P2-B', StoryboardEntry: 'P2-B',
  AdminPage: 'P2-D', HotwordsPage: 'P2-D', TrashPage: 'P2-D',
  SimpleHomePage: 'P3-A', SimpleResultPage: 'P3-B',
  ScriptHomePage: 'P4-A', ScriptFormPage: 'P4-C', AssetsHomePage: 'P4-D', AssetEditorPage: 'P4-D',
  WorkPage: 'P5-B',
}
let RouteView: typeof import('../../src/app/RouteView').RouteView
const pkgOf = (hash: string) => {
  const el = RouteView({ route: parseRoute(hash, deps) }) as { type: { name: string } } | null
  return el === null ? '(空)' : (PKG_OF[el.type.name] ?? `未登记的组件 ${el.type.name}`)
}

beforeAll(async () => {
  const empty = JSON.stringify({ groups: [], entries: [], core: { parts: [], styles: {}, options: {} }, roles: {}, changelog: '' })
  vi.stubGlobal('window', { TJ_API_BASE: '' })
  vi.stubGlobal('document', { getElementById: (id: string) => (id === 'tj-data' ? { textContent: empty } : null) })
  ;({ RouteView } = await import('../../src/app/RouteView'))
})
afterAll(() => {
  vi.unstubAllGlobals()
})

let mem: MemoryStorage
beforeEach(() => {
  mem = new MemoryStorage()
  vi.stubGlobal('localStorage', mem)
})
afterEach(() => {
  vi.stubGlobal('localStorage', undefined)
})

/** 期望值即方案文档 web-react-routes 判定表的“所属任务包”一列。 */
describe('RouteView：14 类路由都分派到对应任务包的页面', () => {
  const PRO: [string, string, string][] = [
    ['#/membership', 'P2-C', '1'],
    ['#/e/2.5', 'P2-A', '2'],
    ['#/f/03-revision/dialogue', 'P2-A', '3'],
    ['#/assembler', 'P2-B', '4'], ['#/changelog', 'P2-A', '4'], ['#/admin', 'P2-D', '4'], ['#/hotwords', 'P2-D', '4'], ['#/trash', 'P2-D', '4'],
    ['#/assembler?ep=wabc.3', 'P2-B', '5'],
    ['#/script/s/sabc?new=1', 'P3-B', '6'],
    ['#/script/new', 'P4-C', '7'],
    ['#/script/v/wabc/board', 'P5-B', '8'],
    ['#/script/w/wabc', 'P4-C', '9'],
    ['#/assets/role-board?i=2', 'P4-D', '10'],
    ['#/partner', 'P2-C', '11'],
    ['#/script', 'P4-A', '12'], ['#/assets', 'P4-D', '12'], ['#/storyboard', 'P2-B', '12'],
    ['#/prompts', 'P2-A', '13'],
    ['', 'P3-A', '14'], ['#/help', 'P3-A', '14'], ['#/manual', 'P3-A', '14'],
  ]
  it.each(PRO)('PRO 开：%j → %s（第 %s 类）', (hash, pkg) => {
    expect(pkgOf(hash)).toBe(pkg)
  })

  it('标准版（pl.pro=false）：#/script、#/script/new、#/script/w/:id 都是标准版首页；结果页与作品页不变', () => {
    mem.setItem('pl.pro', 'false')
    expect(pkgOf('#/script')).toBe('P3-A')
    expect(pkgOf('#/script/new')).toBe('P3-A')
    expect(pkgOf('#/script/w/wabc')).toBe('P3-A')
    expect(pkgOf('#/script/s/s1')).toBe('P3-B')
    expect(pkgOf('#/script/v/w1')).toBe('P5-B')
  })

  it('TOOLS 原型键（如 #/constructor）不渲染页面', () => {
    expect(pkgOf('#/constructor')).toBe('(空)')
  })
})
