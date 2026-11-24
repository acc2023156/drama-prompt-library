import { act, fireEvent, render } from '@testing-library/react'
import type { ComponentType } from 'react'
import { expect } from 'vitest'
import { countNodes, snapChildren } from './assembler-dom-snapshot'
import { type LegacyDom, loadLegacyDom } from './assembler-legacy-dom'

/** 把内容数据写进 #tj-data，必须在第一次 import src/data.ts 之前调用。 */
export function installData(data: unknown): void {
  document.getElementById('tj-data')?.remove()
  const s = document.createElement('script')
  s.id = 'tj-data'
  s.type = 'application/json'
  s.textContent = JSON.stringify(data)
  document.head.appendChild(s)
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface Ep {
  wid: string
  i: number
}
interface Download {
  name: string
  blob: Blob
}

/** 新页面一侧：剪贴板、下载链接的记录（jsdom 没有这些能力）。 */
export const neu = { copied: [] as string[], downloads: [] as Download[] }
export function installNewSideStubs(): void {
  const urls = new Map<string, Blob>()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void neu.copied.push(t) }, configurable: true })
  URL.createObjectURL = (b: Blob) => {
    const u = 'blob:new/' + urls.size
    urls.set(u, b as Blob)
    return u
  }
  URL.revokeObjectURL = () => {}
  const anchorClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.download) neu.downloads.push({ name: this.download, blob: urls.get(this.href)! })
    else anchorClick.call(this)
  }
}

export const stats = { pairs: 0, compares: 0, nodes: 0 }

const legacyCache = new WeakMap<object, LegacyDom>()
/** 为这份内容数据建好旧页面沙箱（加载整份脚本较慢，同一份数据只建一次）。 */
export function prepareLegacy(data: object): void {
  if (!legacyCache.has(data)) legacyCache.set(data, loadLegacyDom({ data }))
}
/** 取沙箱，每次清空存储与 #view。 */
function legacyFor(data: object, storage: Record<string, string>): LegacyDom {
  const l = legacyCache.get(data)
  if (!l) throw new Error('先调用 prepareLegacy(data)')
  l.window.localStorage.clear()
  for (const [k, v] of Object.entries(storage)) l.window.localStorage.setItem(k, v)
  l.view.innerHTML = ''
  l.window.location.hash = ''
  l.copied.length = 0
  l.downloads.length = 0
  const t = l.window.document.getElementById('toast')!
  t.className = 'toast'
  t.textContent = ''
  return l
}

const dump = (ls: Storage) => Object.fromEntries(Object.keys(ls).sort().map((k) => [k, ls.getItem(k)]))

export async function readBlob(blob: Blob, win: { FileReader: typeof FileReader }): Promise<string> {
  const buf = await new Promise<ArrayBuffer>((res, rej) => {
    const fr = new win.FileReader()
    fr.onload = () => res(fr.result as ArrayBuffer)
    fr.onerror = () => rej(fr.error)
    fr.readAsArrayBuffer(blob)
  })
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(buf)
}

export interface Action {
  name: string
  legacy(l: LegacyDom): Promise<void> | void
  neu(box: HTMLElement): Promise<void> | void
}

const q = <T extends Element>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel)
  if (!el) throw new Error('找不到元素 ' + sel)
  return el
}
const clickEl = (find: (box: ParentNode) => Element): Action['neu'] => async (box) => {
  await act(async () => {
    fireEvent.click(find(box))
  })
}
const click = (sel: string): Action['neu'] => clickEl((box) => q(box, sel))
/** 画风名、条款名可含引号与尖括号，不拼进选择器，按 data 属性比对。 */
const byData = (selector: string, attr: string, value: string) => (box: ParentNode): Element => {
  const el = [...box.querySelectorAll(selector)].find((e) => e.getAttribute(attr) === value)
  if (!el) throw new Error(`找不到 ${selector}[${attr}=${value}]`)
  return el
}
const tick = () => sleep(0)

/** 新旧页面共用的操作；每个操作在两边做同一件事。 */
export const A = {
  style: (v: string): Action => ({
    name: `点画风 ${v}`,
    legacy: (l) => (byData('#sty button', 'data-v', v)(l.view) as HTMLElement).click(),
    neu: clickEl(byData('#sty button', 'data-v', v)),
  }),
  custom: (text: string): Action => ({
    name: `填自定义画风 ${JSON.stringify(text).slice(0, 20)}`,
    legacy: (l) => {
      const ta = q<HTMLTextAreaElement>(l.view, '#customStyle')
      ta.value = text
      ta.dispatchEvent(new l.window.Event('input'))
    },
    neu: async (box) => {
      await act(async () => {
        fireEvent.change(q(box, '#customStyle'), { target: { value: text } })
      })
    },
  }),
  toggle: (o: string): Action => ({
    name: `切换条款 ${o}`,
    legacy: (l) => (byData('.sw', 'data-o', o)(l.view) as HTMLElement).click(),
    neu: clickEl(byData('.sw', 'data-o', o)),
  }),
  copy: (): Action => ({
    name: '复制全部',
    legacy: async (l) => {
      q<HTMLElement>(l.view, '#cpAll').click()
      await tick()
    },
    neu: click('#cpAll'),
  }),
  download: (): Action => ({
    name: '下载 .txt',
    legacy: (l) => q<HTMLElement>(l.view, '#dl').click(),
    neu: click('#dl'),
  }),
  /** 点“返回 / 储存并返回”：旧页面里只有变脏之后才会存。 */
  back: (): Action => ({
    name: '点返回',
    legacy: (l) => q<HTMLElement>(l.view, '#pgBack').click(),
    neu: click('#pgBack'),
  }),
}

export interface Pair {
  legacy: LegacyDom
  box: HTMLElement
  /** 旧 viewAssembler 是否抛了异常（页面保持空） */
  legacyThrew: boolean
  compare(label: string): void
  run(...actions: Action[]): Promise<void>
  /** 每步操作后都比较 */
  runCompare(label: string, ...actions: Action[]): Promise<void>
  unmount(): void
}

export interface MountOptions {
  data: unknown
  storage?: Record<string, string>
  ep?: Ep
}

/** 同一份存储、同一份内容数据，旧页面（jsdom 沙箱）与新组件各渲染一遍。 */
export function mountPair(C: ComponentType<{ ep?: Ep }>, o: MountOptions, legacyCall = 'viewAssembler(__ep)'): Pair {
  localStorage.clear()
  for (const [k, v] of Object.entries(o.storage ?? {})) localStorage.setItem(k, v)
  neu.copied.length = 0
  neu.downloads.length = 0
  const legacy = legacyFor(o.data as object, o.storage ?? {})
  ;(legacy.window as unknown as { __ep?: Ep }).__ep = o.ep
  let legacyThrew = false
  try {
    legacy.exec(legacyCall)
  } catch {
    legacyThrew = true
  }
  const r = render(<C ep={o.ep} />)
  stats.pairs++

  const pair: Pair = {
    legacy,
    box: r.container,
    legacyThrew,
    compare(label) {
      const a = snapChildren(legacy.view)
      const b = snapChildren(r.container)
      expect(b, `${label}：DOM`).toStrictEqual(a)
      expect(dump(localStorage), `${label}：localStorage`).toStrictEqual(dump(legacy.window.localStorage))
      stats.compares++
      stats.nodes += countNodes(a)
    },
    async run(...actions) {
      for (const a of actions) {
        await a.legacy(legacy)
        await a.neu(r.container)
        await tick()
      }
    },
    async runCompare(label, ...actions) {
      for (const a of actions) {
        await pair.run(a)
        pair.compare(`${label} → ${a.name}`)
      }
    },
    unmount: () => r.unmount(),
  }
  return pair
}
