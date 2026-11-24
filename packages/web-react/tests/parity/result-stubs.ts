/** 结果页对照的打桩工具（新旧两边共用）。不依赖 legacy.ts，可在 jsdom 环境里直接静态导入。 */

/** 记录 Blob 内容的替身（新旧两边都用它，下载内容才能逐字比较）。 */
export class RecBlob {
  constructor(
    public parts: unknown[],
    public opt?: { type?: string },
  ) {}
  get text() {
    return this.parts.join('')
  }
}

export interface Calls {
  clipboard: string[]
  downloads: { download: string; href: string; text: string; type?: string }[]
  scroll: { id: string; arg: unknown }[]
  confirm: string[]
  revoked: string[]
}
export const newCalls = (): Calls => ({ clipboard: [], downloads: [], scroll: [], confirm: [], revoked: [] })

/** 在 jsdom 窗口上装下载与滚动的记录（click 不真跳转）。blobs 为 createObjectURL 收到的对象，按地址取回内容。 */
export function patchWindow(win: any, calls: Calls, blobs: Map<string, RecBlob>) {
  win.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const b = blobs.get(this.href)
    calls.downloads.push({ download: this.download, href: this.href, text: b ? b.text : '', type: b?.opt?.type })
  }
  win.Element.prototype.scrollIntoView = function (this: Element, arg: unknown) {
    calls.scroll.push({ id: this.id, arg })
  }
}

