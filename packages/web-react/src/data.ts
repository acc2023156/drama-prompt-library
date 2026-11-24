/** build.py data 产出的内容数据（构建时由 plugins/tj-inject.ts 写进 index.html 的 #tj-data）。 */
export interface Entry {
  id: string
  title: string
  chapter?: string
  license: string
  status?: string
  patches?: string[]
  tool?: string
  folder: string
  path: string
  body: string
}

export interface TjData {
  groups: { key: string; label: string }[]
  entries: Entry[]
  core: {
    parts: string[]
    styles: Record<string, string>
    options: Record<string, string>
  }
  roles: unknown
  changelog: string
}

declare global {
  interface Window {
    TJ_API_BASE?: string
  }
}

export function parseData(text: string | null | undefined): TjData {
  if (!text) throw new Error('页面里没有内嵌数据（#tj-data 为空）')
  return JSON.parse(text) as TjData
}

export const DATA: TjData = parseData(document.getElementById('tj-data')?.textContent)

/** 后端地址；空字符串表示与网页同源。 */
export const API_BASE: string = window.TJ_API_BASE ?? ''
