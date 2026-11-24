import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type LegacyDom, canon, loadDataDom, loadLegacyDom } from './prompts-legacy'

/**
 * 提示词库（P2-A）对照：旧 viewList / viewEntry / viewDoc 在 jsdom 沙箱里真跑，
 * 与新组件渲染出的 DOM 逐节点比较（结构见 prompts-legacy.ts 的 canon）。
 */
const data = loadDataDom()
let legacy: LegacyDom
let List: typeof import('../../src/features/prompts/PromptListPage')
let Entry: typeof import('../../src/features/prompts/PromptEntryPage')
let Changelog: typeof import('../../src/features/prompts/ChangelogPage')
let Filter: typeof import('../../src/features/prompts/filter-state')
let Func: typeof import('../../src/features/prompts/func-index')

beforeAll(async () => {
  const s = document.createElement('script')
  s.id = 'tj-data'
  s.type = 'application/json'
  s.textContent = JSON.stringify(data)
  document.head.appendChild(s)
  legacy = loadLegacyDom(data)
  List = await import('../../src/features/prompts/PromptListPage')
  Entry = await import('../../src/features/prompts/PromptEntryPage')
  Changelog = await import('../../src/features/prompts/ChangelogPage')
  Filter = await import('../../src/features/prompts/filter-state')
  Func = await import('../../src/features/prompts/func-index')
})
beforeEach(() => {
  legacy.reset()
  Filter.resetPromptFilter()
  localStorage.clear()
})
afterEach(() => localStorage.clear())

const noId = (el: Element) => el.id === 'cp'
const newCanon = (c: HTMLElement) => canon(c, { ignoreId: noId })
const oldCanon = () => canon(legacy.view, { ignoreId: noId })

const GROUPS: string[] = data.groups.map((g: any) => g.key)
const FOLDERS = [...new Set([...GROUPS, '01-outline', '02-adaptation', '03-revision', '06-video', '07-compliance', 'archive', '06-video/core', '06-video/patches', '03-revision/dialogue'])]
const EDGE_FOLDERS = ['', 'nonexistent', 'constructor', '__proto__']

function legacyList(route: { view: string; folder?: string }) {
  legacy.run(`viewList(${JSON.stringify(route)})`)
}
const renderList = (folder: string | undefined, home: boolean) => render(<List.PromptListPage folder={folder} home={home} />)

describe('数据规模', () => {
  it('15 个目录分组、90 条提示词', () => {
    expect(GROUPS.length).toBe(15)
    expect(data.entries.length).toBe(90)
  })
})

describe('列表页：首页与全部目录（无筛选）', () => {
  it('首页 #/prompts', () => {
    legacyList({ view: 'home' })
    const { container } = renderList(undefined, true)
    expect(newCanon(container)).toStrictEqual(oldCanon())
    expect(container.querySelectorAll('.card').length).toBe(90)
    expect(container.querySelector('#cnt')!.textContent).toBe('90 / 90 条')
  })
  it.each(FOLDERS)('目录 %s', (folder) => {
    legacyList({ view: 'list', folder })
    const { container } = renderList(folder, false)
    expect(newCanon(container)).toStrictEqual(oldCanon())
    expect(container.querySelector('.card')).not.toBeNull()
  })
  it.each(EDGE_FOLDERS)('边界目录 %j（空目录、不存在、原型键）', (folder) => {
    legacyList({ view: 'list', folder })
    const { container } = renderList(folder, false)
    expect(newCanon(container)).toStrictEqual(oldCanon())
  })
})

describe('列表页：筛选步骤逐步比较（新旧执行同一串操作）', () => {
  type Step = { name: string; q?: string; lic?: string; prod?: boolean }
  const STEPS: Step[] = [
    { name: '搜索 剧本', q: '剧本' },
    { name: '搜索 男主（命中相关功能与角色类型）', q: '男主' },
    { name: '搜索 分镜', q: '分镜' },
    { name: '搜索 6.0 组装', q: '6.0 组装' },
    { name: '搜索 资产 场景', q: '资产 场景' },
    { name: '搜索 全角逗号 剧本，女主', q: '剧本，女主' },
    { name: '只有空格', q: '   ' },
    { name: '无结果', q: 'zzzz-no-such-text' },
    { name: '清空搜索', q: '' },
    { name: '来源 可直接用', lic: 'direct' },
    { name: '来源 仅参考', lic: 'ref' },
    { name: '来源 内部', lic: 'int' },
    { name: '来源 全部', lic: 'all' },
    { name: '只看已用于生产', prod: true },
    { name: '生产 + 可直接用 + 剧本', prod: true, lic: 'direct', q: '剧本' },
    { name: '取消生产', prod: false },
  ]
  const cases: [string, { view: string; folder?: string }, string | undefined, boolean][] = [
    ['首页', { view: 'home' }, undefined, true],
    ['目录 03-revision', { view: 'list', folder: '03-revision' }, '03-revision', false],
    ['目录 06-video/core', { view: 'list', folder: '06-video/core' }, '06-video/core', false],
  ]
  it.each(cases)('%s', (_n, route, folder, home) => {
    legacyList(route)
    const { container } = renderList(folder, home)
    const w = legacy.view
    let prod = false
    for (const s of STEPS) {
      if (s.q !== undefined) {
        const q = w.querySelector<HTMLInputElement>('#q')!
        q.value = s.q
        q.dispatchEvent(new legacy.win.Event('input'))
        const nq = container.querySelector<HTMLInputElement>('#q')!
        fireEvent.change(nq, { target: { value: s.q } })
      }
      if (s.lic) {
        w.querySelector<HTMLElement>(`#lic button[data-v="${s.lic}"]`)!.click()
        fireEvent.click(container.querySelector(`#lic button[data-v="${s.lic}"]`)!)
      }
      if (s.prod !== undefined && s.prod !== prod) {
        w.querySelector<HTMLElement>('#prod')!.click()
        fireEvent.click(container.querySelector('#prod')!)
        prod = s.prod
      }
      expect(newCanon(container), s.name).toStrictEqual(oldCanon())
    }
  })

  it('筛选条件跨页面保留：旧 state 是全局变量，新页面重新挂载后搜索框仍是原来的词', () => {
    legacyList({ view: 'home' })
    const a = renderList(undefined, true)
    legacy.view.querySelector<HTMLInputElement>('#q')!.value = '角色'
    legacy.view.querySelector<HTMLInputElement>('#q')!.dispatchEvent(new legacy.win.Event('input'))
    fireEvent.change(a.container.querySelector('#q')!, { target: { value: '角色' } })
    a.unmount()
    legacyList({ view: 'list', folder: '01-outline' })
    const b = renderList('01-outline', false)
    expect(b.container.querySelector<HTMLInputElement>('#q')!.value).toBe('角色')
    expect(newCanon(b.container)).toStrictEqual(oldCanon())
  })
})

describe('相关功能：funcIndex 与旧实现相等', () => {
  it('全部检索项（标题、说明、链接、关键词、pick）', () => {
    const old = JSON.parse(JSON.stringify(legacy.run('funcIndex()')))
    const now = JSON.parse(JSON.stringify(Func.funcIndex(data.roles)))
    expect(now.length).toBe(old.length)
    expect(now.length).toBeGreaterThan(30)
    expect(now).toStrictEqual(old)
  })
})

describe('详情页：90 条全部提示词', () => {
  const ids: string[] = data.entries.map((e: any) => e.id)
  it('覆盖 6.0 主模板、补丁条目、archive 条目', () => {
    expect(ids).toContain('6.0')
    expect(data.entries.some((e: any) => e.patches?.length)).toBe(true)
    expect(data.entries.some((e: any) => e.folder.startsWith('archive'))).toBe(true)
  })
  it('逐条比较', () => {
    let withCopy = 0
    for (const id of ids) {
      legacy.run(`viewEntry(${JSON.stringify(id)})`)
      const { container, unmount } = render(<Entry.PromptEntryPage id={id} />)
      expect(newCanon(container), id).toStrictEqual(oldCanon())
      if (container.querySelector('.btn-white')) withCopy++
      unmount()
    }
    expect(withCopy).toBeGreaterThan(60)
  })
  it.each(['999.9', '', '2', '2.5.1'])('不存在的 id %j', (id) => {
    legacy.run(`viewEntry(${JSON.stringify(id)})`)
    const { container } = render(<Entry.PromptEntryPage id={id} />)
    expect(newCanon(container)).toStrictEqual(oldCanon())
    expect(container.textContent).toBe('找不到这条提示词')
  })
  it.each(['constructor', '__proto__', 'toString'])('原型键 %j：旧页面渲染时抛 TypeError（vm 内的另一个领域，按消息判断；页面停在上一页），新页面显示“找不到”', (id) => {
    expect(() => legacy.run(`viewEntry(${JSON.stringify(id)})`)).toThrow(/Cannot read properties of undefined/)
    const { container } = render(<Entry.PromptEntryPage id={id} />)
    expect(container.textContent).toBe('找不到这条提示词')
  })
})

describe('更新记录页', () => {
  it('与旧 viewDoc 逐节点相等', () => {
    legacy.run("viewDoc('更新记录', DATA.changelog)")
    const { container } = render(<Changelog.ChangelogPage />)
    expect(newCanon(container)).toStrictEqual(oldCanon())
    expect(container.querySelector('h1')!.textContent).toBe('更新记录')
    expect(container.querySelectorAll('.md strong').length).toBeGreaterThan(5)
    expect(container.querySelector('.md h1')).toBeNull()
  })
})
