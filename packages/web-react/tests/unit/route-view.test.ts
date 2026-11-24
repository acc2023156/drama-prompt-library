import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteView } from '../../src/app/RouteView'
import { parseRoute } from '../../src/app/routes'
import { MemoryStorage } from '../parity/legacy'

const deps = { entryFolder: () => '02-adaptation', findWork: (id: string) => (id === 'wabc' ? { id, title: 't' } : undefined) }
const pkgOf = (hash: string) => {
  const html = renderToStaticMarkup(createElement(RouteView, { route: parseRoute(hash, deps) }))
  return html.match(/data-placeholder="([^"]+)"/)?.[1] ?? (html === '' ? '(空)' : html)
}

let mem: MemoryStorage
beforeEach(() => {
  mem = new MemoryStorage()
  vi.stubGlobal('localStorage', mem)
})
afterEach(() => {
  vi.unstubAllGlobals()
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
