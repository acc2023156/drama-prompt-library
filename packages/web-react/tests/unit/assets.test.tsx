import { act, fireEvent, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssetEditorPage } from '../../src/features/assets/AssetEditorPage'
import { AssetsHomePage } from '../../src/features/assets/AssetsHomePage'
import { AssetTrashPage } from '../../src/features/assets/AssetTrashPage'

vi.mock('../../src/data', async () => {
  const { loadData } = await import('../parity/data')
  return { DATA: loadData(), API_BASE: '', parseData: JSON.parse }
})

/** 资产库在 StrictMode（main.tsx 的挂载方式）下的行为：初始化与副作用跑两遍也不改变结果；卸载时清理监听与语音识别。 */

afterEach(() => {
  localStorage.clear()
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition
})

const strict = (el: React.ReactElement) => render(<StrictMode>{el}</StrictMode>)

describe('StrictMode', () => {
  it('带入 assetPick：表单取到名称与档案，assetPick 置 null', () => {
    localStorage.setItem('pl.assetPick', JSON.stringify({ fn: 'role-board', name: '林骁', profile: '冷面' }))
    const { container } = strict(<AssetEditorPage fn="role-board" idx={null} />)
    expect((container.querySelector('#nm') as HTMLInputElement).value).toBe('林骁')
    expect((container.querySelector('#pf') as HTMLTextAreaElement).value).toBe('冷面')
    expect(localStorage.getItem('pl.assetPick')).toBe('null')
  })
  it('风格弹层：点页面其他地方只收起一次，卸载后不再响应', () => {
    const { container, unmount } = strict(<AssetEditorPage fn="role-new" idx={null} />)
    fireEvent.click(container.querySelector('#sbtn')!)
    expect(container.querySelector('#spop')!.className).toBe('stylepop open')
    fireEvent.click(document.body)
    expect(container.querySelector('#spop')!.className).toBe('stylepop')
    const remove = vi.spyOn(document, 'removeEventListener')
    unmount()
    expect(remove).toHaveBeenCalledWith('click', expect.any(Function))
  })
  it('选择模式删除资产后重画，计数更新，回收桶入口出现', () => {
    localStorage.setItem('pl.assets', JSON.stringify([{ fn: 'role-new', name: 'a', prompt: 'p', state: {}, time: 1 }]))
    vi.stubGlobal('confirm', () => true)
    const { container } = strict(<AssetsHomePage />)
    expect(container.textContent).toContain('1 个')
    fireEvent.click(container.querySelector('#asPick')!)
    expect(container.querySelector('#asGrid')!.className).toBe('grid picking')
    fireEvent.click(container.querySelector('[data-ak="0"]')!)
    fireEvent.click(container.querySelector('[data-pk="go"]')!)
    expect(container.textContent).toContain('0 个')
    expect(localStorage.getItem('pl.assets')).toBe('[]')
    expect(JSON.parse(localStorage.getItem('pl.assetsTrash')!)).toEqual([{ fn: 'role-new', name: 'a', prompt: 'p', state: {}, time: 1, trashed: expect.any(Number) }])
    expect(container.querySelector('a[href="#/assets-trash"]')!.textContent).toBe('回收桶 1')
    vi.unstubAllGlobals()
  })
  it('选择模式下点卡片里的复制按钮只切换选中，不复制', () => {
    localStorage.setItem('pl.assets', JSON.stringify([{ fn: 'role-new', name: 'a', prompt: 'p', state: {}, time: 1 }]))
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { container } = strict(<AssetsHomePage />)
    fireEvent.click(container.querySelector('#asPick')!)
    fireEvent.click(container.querySelector('.acts .secondary')!)
    expect(writeText).not.toHaveBeenCalled()
    expect(container.querySelector('[data-ak="0"]')!.className).toBe('acard on')
    expect(container.querySelector('.pick-bar b')!.textContent).toBe('1')
    delete (navigator as { clipboard?: unknown }).clipboard
  })
  it('回收桶：进入时清掉过期资产（初始化跑两遍也只写回一次结果），还原后回到我的资产末尾', () => {
    const now = Date.now()
    localStorage.setItem('pl.assets', JSON.stringify([{ fn: 'role-new', name: 'a' }]))
    localStorage.setItem('pl.assetsTrash', JSON.stringify([{ fn: 'scene-var', name: 'b', trashed: now - 864e5 }, { fn: 'role-new', name: 'old', trashed: now - 31 * 864e5 }]))
    const { container } = strict(<AssetTrashPage />)
    expect(localStorage.getItem('pl.assetsTrash')).toBe(JSON.stringify([{ fn: 'scene-var', name: 'b', trashed: now - 864e5 }]))
    expect(container.querySelectorAll('.acard')).toHaveLength(1)
    expect(container.textContent).toContain('剩 29 天')
    fireEvent.click(container.querySelector('[data-rs="0"]')!)
    expect(localStorage.getItem('pl.assets')).toBe(JSON.stringify([{ fn: 'role-new', name: 'a' }, { fn: 'scene-var', name: 'b' }]))
    expect(localStorage.getItem('pl.assetsTrash')).toBe('[]')
    expect(container.textContent).toContain('回收桶是空的。')
  })
  it('卸载时停掉正在进行的语音识别', () => {
    const stop = vi.fn()
    ;(window as { SpeechRecognition?: unknown }).SpeechRecognition = class {
      start() {}
      stop = stop
    }
    const { container, unmount } = strict(<AssetEditorPage fn="role-new" idx={null} />)
    act(() => {
      fireEvent.click(container.querySelector('.wc-mic')!)
    })
    expect(container.querySelector('.wc-mic')!.className).toBe('wc-mic on')
    unmount()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
