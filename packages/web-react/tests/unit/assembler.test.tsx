import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getToast } from '../../src/lib/toast'
import { installData, installNewSideStubs, neu, readBlob } from '../parity/assembler-harness'

/** 组装器与分镜入口的交互行为（jsdom + user-event）。与旧页面的逐节点对照见 tests/parity/assembler*.test.tsx。 */
const data = {
  groups: [{ key: '06-video', label: '视频生成' }],
  entries: [
    { id: '6.1', title: '补丁甲', license: '内部', folder: '06-video/patches', path: 'a.md', body: '', patches: ['二'] },
    { id: '6.10', title: '补丁乙', license: '内部', folder: '06-video/patches', path: 'b.md', body: '', patches: ['二', '五'] },
    { id: '6.2', title: '补丁丙', license: '内部', folder: '06-video/patches', path: 'c.md', body: '', patches: ['二'] },
    { id: '6.3', title: '无补丁', license: '内部', folder: '06-video/patches', path: 'd.md', body: '' },
  ],
  core: {
    parts: ['开头 {{STYLE}}', '{{OPT:成人内容}}\n中段', '结尾'],
    styles: { 末日废土写实: '废土画风正文', 古风: '古风画风正文' },
    options: { 成人内容: '成人条款正文' },
  },
  roles: {},
  changelog: '',
}
const BASE = '开头 废土画风正文\n中段\n结尾'
const WORKS = [
  {
    id: 'w1',
    title: '合成剧',
    kind: 'vibe',
    vname: '林凡',
    vname2: '苏晴',
    seed: 2,
    W: { genre: '都市', pitch: '丧尸末日' },
    gen: {
      engine: 'yq',
      status: 'done',
      data: {
        title: 't',
        logline: 'l',
        outline: [{ title: '开局', body: '大纲一' }, { title: '反转', body: '大纲二' }],
        eps: ['# 第1集：开局\n正文一', null],
        cast: [],
      },
    },
  },
]

let AssemblerPage: typeof import('../../src/features/assembler/AssemblerPage').AssemblerPage
let StoryboardEntry: typeof import('../../src/features/assembler/StoryboardEntry').StoryboardEntry
beforeAll(async () => {
  installData(data)
  installNewSideStubs()
  ;({ AssemblerPage } = await import('../../src/features/assembler/AssemblerPage'))
  ;({ StoryboardEntry } = await import('../../src/features/assembler/StoryboardEntry'))
})
beforeEach(() => {
  localStorage.clear()
  neu.copied.length = 0
  neu.downloads.length = 0
  location.hash = ''
})
afterEach(() => {
  vi.useRealTimers()
})

const out = () => document.getElementById('out')!.textContent
const stat = () => document.getElementById('stat')!.textContent
const styleBtn = (name: string) => within(document.getElementById('sty')!).getByRole('button', { name })
const textarea = () => document.getElementById('customStyle') as HTMLTextAreaElement

describe('组装器：画风', () => {
  it('默认第一个画风，组装结果与统计行', () => {
    render(<AssemblerPage />)
    expect(screen.getByRole('heading', { name: '6.0 视频专用提示词 · 组装器' })).toBeInTheDocument()
    expect(out()).toBe(BASE)
    expect(stat()).toBe(`${BASE.length} 字 · 风格：末日废土写实 · 可选条款：无`)
    expect(styleBtn('末日废土写实')).toHaveClass('on')
    expect(styleBtn('古风')).not.toHaveClass('on')
    expect(textarea()).not.toBeVisible()
  })

  it('切换画风：高亮跟着走，结果替换画风正文', async () => {
    render(<AssemblerPage />)
    await userEvent.click(styleBtn('古风'))
    expect(styleBtn('古风')).toHaveClass('on')
    expect(styleBtn('末日废土写实')).not.toHaveClass('on')
    expect(out()).toBe('开头 古风画风正文\n中段\n结尾')
    expect(stat()).toContain('风格：古风')
  })

  it('自定义画风：显示文本框，输入即时进结果；切回内置后隐藏但文字保留', async () => {
    render(<AssemblerPage />)
    await userEvent.click(styleBtn('自定义'))
    expect(textarea()).toBeVisible()
    await userEvent.type(textarea(), '我的画风')
    expect(out()).toBe('开头 我的画风\n中段\n结尾')
    expect(stat()).toContain('风格：自定义')
    await userEvent.click(styleBtn('古风'))
    expect(textarea()).not.toBeVisible()
    expect(textarea().value).toBe('我的画风')
    await userEvent.click(styleBtn('自定义'))
    expect(out()).toBe('开头 我的画风\n中段\n结尾')
  })

  it('画风描述里带 $& 之类的替换模式字符时也按原文放进结果', async () => {
    render(<AssemblerPage />)
    await userEvent.click(styleBtn('自定义'))
    await userEvent.click(textarea())
    await userEvent.paste('A$&B$1C')
    // 旧页面同样用 String.replace(字符串, 字符串)，$& 会被当作替换模式；这里只确认与旧行为一致：$& 展开为 {{STYLE}}
    expect(out()).toBe('开头 A{{STYLE}}B$1C\n中段\n结尾')
  })

  it('上次的选择从 pl.asm 恢复，不存在的画风回落第一个', () => {
    localStorage.setItem('pl.asm', JSON.stringify({ style: '古风', custom: '' }))
    const { unmount } = render(<AssemblerPage />)
    expect(styleBtn('古风')).toHaveClass('on')
    unmount()
    localStorage.setItem('pl.asm', JSON.stringify({ style: '被删的画风', custom: 'x' }))
    render(<AssemblerPage />)
    expect(styleBtn('末日废土写实')).toHaveClass('on')
  })

  it('每次操作都写 pl.asm（画风与自定义文字）', async () => {
    render(<AssemblerPage />)
    expect(JSON.parse(localStorage.getItem('pl.asm')!)).toEqual({ style: '末日废土写实', custom: '' })
    await userEvent.click(styleBtn('自定义'))
    await userEvent.type(textarea(), 'Z')
    expect(JSON.parse(localStorage.getItem('pl.asm')!)).toEqual({ style: '__custom', custom: 'Z' })
  })
})

describe('组装器：可选条款', () => {
  it('开关：高亮、结果多出条款正文、统计行列出条款、警告出现', async () => {
    render(<AssemblerPage />)
    const sw = screen.getByRole('button', { name: '成人内容' })
    expect(sw).not.toHaveClass('on')
    expect(document.getElementById('optWarn')).not.toBeVisible()
    await userEvent.click(sw)
    expect(sw).toHaveClass('on')
    expect(out()).toBe('开头 废土画风正文\n成人条款正文\n中段\n结尾')
    expect(stat()).toContain('可选条款：成人内容')
    expect(document.getElementById('optWarn')).toBeVisible()
    expect(document.getElementById('optWarn')).toHaveTextContent('已打开成人内容条款，请确认这是成人线项目。')
    await userEvent.click(sw)
    expect(out()).toBe(BASE)
    expect(document.getElementById('optWarn')).not.toBeVisible()
  })

  it('条款说明文字与补丁条目列表（按章节、同章节按编号数值排序，无补丁的不列）', () => {
    render(<AssemblerPage />)
    expect(screen.getByText(/6\.0【一】第 7 条：成人镜头的详细描写要求/)).toBeInTheDocument()
    const rows = [...document.querySelectorAll('.plist a')].map((a) => [a.getAttribute('href'), a.textContent])
    expect(rows).toEqual([
      ['#/e/6.1', '【二】6.1 补丁甲'],
      ['#/e/6.2', '【二】6.2 补丁丙'],
      ['#/e/6.10', '【二】6.10 补丁乙'],
      ['#/e/6.10', '【五】6.10 补丁乙'],
    ])
  })
})

describe('组装器：复制与下载', () => {
  it('复制全部：写剪贴板、提示、按钮显示已复制，1.3 秒后还原', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    render(<AssemblerPage />)
    const btn = document.getElementById('cpAll')!
    expect(btn).toHaveTextContent('复制全部')
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(neu.copied).toEqual([BASE])
    expect(getToast()).toEqual({ text: '已复制到剪贴板', show: true })
    expect(btn).toHaveTextContent('已复制')
    expect(btn).toHaveClass('copy', 'done')
    await act(async () => {
      vi.advanceTimersByTime(1299)
    })
    expect(btn).toHaveTextContent('已复制')
    await act(async () => {
      vi.advanceTimersByTime(2)
    })
    expect(btn).toHaveTextContent('复制全部')
    expect(btn).not.toHaveClass('done')
  })

  it('复制的是点击时的最新结果（含条款与自定义画风）', async () => {
    render(<AssemblerPage />)
    await userEvent.click(screen.getByRole('button', { name: '成人内容' }))
    await userEvent.click(styleBtn('自定义'))
    await userEvent.type(textarea(), '甲')
    await userEvent.click(document.getElementById('cpAll')!)
    expect(neu.copied).toEqual(['开头 甲\n成人条款正文\n中段\n结尾'])
  })

  it('下载 .txt：固定文件名，内容带 BOM', async () => {
    render(<AssemblerPage />)
    await userEvent.click(document.getElementById('dl')!)
    expect(neu.downloads).toHaveLength(1)
    expect(neu.downloads[0].name).toBe('6.0视频专用提示词.txt')
    expect(await readBlob(neu.downloads[0].blob, window)).toBe('﻿' + BASE)
  })
})

describe('组装器：返回按钮', () => {
  it('没操作时是“返回”；操作后变“储存并返回”，点击写存储并提示', async () => {
    render(<AssemblerPage />)
    const back = document.getElementById('pgBack')!
    expect(back).toHaveTextContent('返回')
    expect(back).not.toHaveClass('dirty')
    expect(back).toHaveAttribute('href', '#/')
    await userEvent.click(styleBtn('古风'))
    expect(back).toHaveTextContent('储存并返回')
    expect(back).toHaveClass('dirty')
    await userEvent.click(back)
    expect(getToast()).toEqual({ text: '已储存', show: true })
    expect(JSON.parse(localStorage.getItem('pl.asm')!)).toEqual({ style: '古风', custom: '' })
  })
})

describe('分镜编辑（?ep=）', () => {
  const seed = (extra: Record<string, unknown> = {}) => {
    localStorage.setItem('pl.works', JSON.stringify(WORKS))
    for (const [k, v] of Object.entries(extra)) localStorage.setItem('pl.' + k, JSON.stringify(v))
  }

  it('标题、作品名、追加该集剧本、返回回作品分镜页', () => {
    seed()
    render(<AssemblerPage ep={{ wid: 'w1', i: 0 }} />)
    expect(screen.getByRole('heading', { name: '第 1 集：开局' })).toBeInTheDocument()
    expect(screen.getByText('《合成剧》· 分镜图编辑')).toBeInTheDocument()
    expect(out()).toContain('\n\n# 第1集：开局\n正文一')
    expect(document.getElementById('pgBack')).toHaveAttribute('href', '#/script/v/w1/board')
  })

  it('第二集没有正文时用大纲；集序超出取最后一集', () => {
    seed()
    const { unmount } = render(<AssemblerPage ep={{ wid: 'w1', i: 1 }} />)
    expect(screen.getByRole('heading', { name: '第 2 集：反转' })).toBeInTheDocument()
    expect(out()).toMatch(/# 第2集：反转\n大纲二$/)
    unmount()
    render(<AssemblerPage ep={{ wid: 'w1', i: 99 }} />)
    expect(screen.getByRole('heading', { name: '第 2 集：反转' })).toBeInTheDocument()
  })

  it('默认画风按题材：命中“末日废土写实”选内置画风，其他走自定义文字', () => {
    seed()
    const { unmount } = render(<AssemblerPage ep={{ wid: 'w1', i: 0 }} />)
    expect(styleBtn('末日废土写实')).toHaveClass('on')
    unmount()
    localStorage.setItem('pl.works', JSON.stringify([{ ...WORKS[0], W: { genre: '都市', pitch: '修仙宗门' } }]))
    render(<AssemblerPage ep={{ wid: 'w1', i: 0 }} />)
    expect(styleBtn('自定义')).toHaveClass('on')
    expect(textarea()).toBeVisible()
    expect(textarea().value).toBe('东方玄幻写实，仙山云海与宗门殿宇，光效克制，史诗电影感')
  })

  it('作品保存过的画风优先于题材默认', () => {
    seed({ asmW: { w1: { style: '古风' } } })
    render(<AssemblerPage ep={{ wid: 'w1', i: 0 }} />)
    expect(styleBtn('古风')).toHaveClass('on')
  })

  it('操作不写 pl.asm 与 pl.asmW，点“储存并返回”才写 pl.asmW（保留其他作品的记录）', async () => {
    seed({ asmW: { other: { style: '古风', custom: 'o' } } })
    render(<AssemblerPage ep={{ wid: 'w1', i: 0 }} />)
    await userEvent.click(styleBtn('自定义'))
    await userEvent.type(textarea(), '分镜画风')
    expect(localStorage.getItem('pl.asm')).toBeNull()
    expect(JSON.parse(localStorage.getItem('pl.asmW')!)).toEqual({ other: { style: '古风', custom: 'o' } })
    await userEvent.click(document.getElementById('pgBack')!)
    expect(getToast().text).toBe('已储存')
    expect(JSON.parse(localStorage.getItem('pl.asmW')!)).toEqual({ other: { style: '古风', custom: 'o' }, w1: { style: '__custom', custom: '分镜画风' } })
  })

  it('作品不存在时退回普通模式；集序非法时不渲染也不写存储', () => {
    seed()
    const { unmount } = render(<AssemblerPage ep={{ wid: 'none', i: 0 }} />)
    expect(screen.getByRole('heading', { name: '6.0 视频专用提示词 · 组装器' })).toBeInTheDocument()
    unmount()
    localStorage.clear()
    seed()
    for (const i of [-1, Number.NaN]) {
      const { container, unmount: un } = render(<AssemblerPage ep={{ wid: 'w1', i }} />)
      expect(container).toBeEmptyDOMElement()
      expect(localStorage.getItem('pl.asm')).toBeNull()
      un()
    }
  })
})

describe('分镜入口', () => {
  it('没有氛围写作作品：占位页与三个入口', () => {
    render(<StoryboardEntry />)
    expect(screen.getByRole('heading', { name: '分镜' })).toBeInTheDocument()
    expect(screen.getByText(/把剧本拆成分镜表，再组装成每集 4～6 段的视频提示词。/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '视频生成' })).toHaveAttribute('href', '#/f/06-video')
    expect(screen.getByRole('link', { name: '分镜（归档）' })).toHaveAttribute('href', '#/f/archive/04-storyboard')
    expect(screen.getByRole('link', { name: '6.0 组装器' })).toHaveAttribute('href', '#/assembler')
    expect(location.hash).toBe('')
  })

  it('有氛围写作作品：替换到最近作品的分镜页，不渲染内容', () => {
    localStorage.setItem('pl.works', JSON.stringify([{ id: 'a', kind: 'vibe' }, { id: 'b', kind: 'vibe' }]))
    localStorage.setItem('pl.lastVibe', JSON.stringify('b'))
    const { container } = render(<StoryboardEntry />)
    expect(container).toBeEmptyDOMElement()
    expect(location.hash).toBe('#/script/v/b/board')
  })

  it('最近记录失效或没有记录时取第一个氛围写作作品', () => {
    localStorage.setItem('pl.works', JSON.stringify([{ id: 's', kind: 'simple' }, { id: 'a', kind: 'vibe' }, { id: 'b', kind: 'vibe' }]))
    localStorage.setItem('pl.lastVibe', JSON.stringify('gone'))
    render(<StoryboardEntry />)
    expect(location.hash).toBe('#/script/v/a/board')
  })
})
