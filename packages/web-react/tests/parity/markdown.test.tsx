import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { type LegacyDom, loadLegacyDom } from './prompts-legacy'
import { loadData } from './data'

/**
 * Markdown 组件对照：旧 renderMd 在 jsdom 沙箱里真跑，与新 Markdown 组件对全部 99 篇内容比较渲染后的 HTML。
 * 99 = 90 条提示词正文 + 更新记录（去掉首行标题，同旧 viewDoc）+ 6.0 各部分（core.parts 共 8 段）。
 */
const data = loadData()
let legacy: LegacyDom
let M: typeof import('../../src/components/Markdown')

beforeAll(async () => {
  const s = document.createElement('script')
  s.id = 'tj-data'
  s.type = 'application/json'
  s.textContent = JSON.stringify(data)
  document.head.appendChild(s)
  legacy = loadLegacyDom(data)
  M = await import('../../src/components/Markdown')
})

const SOURCES: [string, string][] = [
  ...data.entries.map((e: any): [string, string] => [`条目 ${e.id}`, e.body]),
  ['更新记录', data.changelog.replace(/^# .*\n/, '')],
  ...data.core.parts.map((p: string, i: number): [string, string] => [`6.0 第 ${i + 1} 部分`, p]),
]

const oldHtml = (md: string): string => legacy.run<HTMLElement>(`renderMd(${JSON.stringify(md)})`).innerHTML

describe('Markdown 组件与旧 renderMd', () => {
  it('内容共 99 篇', () => {
    expect(data.entries.length).toBe(90)
    expect(data.core.parts.length).toBe(8)
    expect(SOURCES.length).toBe(99)
  })

  it('全部 99 篇渲染后的 HTML 逐字符相等', () => {
    let code = 0
    let links = 0
    for (const [name, md] of SOURCES) {
      const { container, unmount } = render(<M.Markdown md={md} />)
      const html = (container.firstElementChild as HTMLElement).innerHTML
      expect(html, name).toBe(oldHtml(md))
      code += container.querySelectorAll('.code').length
      links += container.querySelectorAll('a[target="_blank"]').length
      unmount()
    }
    // 不是空比较：代码卡与外链都出现过
    expect(code).toBeGreaterThan(60)
    expect(links).toBeGreaterThan(0)
  })

  it('外层结构同旧 renderMd：单个无 class 的 div', () => {
    const { container } = render(<M.Markdown md="# 标题" />)
    expect(container.children.length).toBe(1)
    const box = container.firstElementChild as HTMLElement
    expect(box.tagName).toBe('DIV')
    expect(box.hasAttribute('class')).toBe(false)
    expect(box.innerHTML).toBe(oldHtml('# 标题'))
  })

  it('marked 选项同旧页面：gfm 开、breaks 关（单换行不转 br，表格与删除线按 gfm 渲染）', () => {
    const md = '第一行\n第二行\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~删~~'
    const html = M.mdHtml(md)
    expect(html).not.toContain('<br')
    expect(html).toContain('<table>')
    expect(html).toContain('<del>')
    expect(oldHtml(md)).toBe(html)
  })

  it('不再依赖 window.marked：全局没有 marked 也能渲染', () => {
    expect((window as any).marked).toBeUndefined()
    expect(M.mdHtml('**粗**')).toContain('<strong>粗</strong>')
  })

  it('代码卡复制按钮：新旧复制同一段正文，按钮显示“已复制”并带 done 类', async () => {
    const md = '正文\n\n```\n复制我\n第二行\n```\n'
    const copied: string[] = []
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void copied.push(t) }, configurable: true })

    legacy.view.innerHTML = ''
    legacy.view.appendChild(legacy.run<HTMLElement>(`renderMd(${JSON.stringify(md)})`))
    legacy.view.querySelector<HTMLElement>('.code .copy')!.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(legacy.copied).toEqual(['复制我\n第二行\n'])
    expect(legacy.view.querySelector('.code .copy')!.classList.contains('done')).toBe(true)

    const { container } = render(<M.Markdown md={md} />)
    fireEvent.click(container.querySelector('.code .copy')!)
    await waitFor(() => expect(copied).toEqual(['复制我\n第二行\n']))
    await waitFor(() => expect(container.querySelector('.code .copy')!.classList.contains('done')).toBe(true))
    expect(container.querySelector('.code .copy')!.textContent).toBe('已复制')
    expect(legacy.view.querySelector('.code .copy')!.textContent).toBe('已复制')
  })
})
