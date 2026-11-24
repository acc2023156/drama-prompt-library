import type { Plugin } from 'vite'
import { loadDataJson } from './load-data'

const DATA_MARK = "/*__DATA__*/null"
const API_BASE_MARK = "/*__API_BASE__*/''"

/** 与旧页面一致：去掉首尾空白与末尾斜杠，留空表示与网页同源。 */
export function normalizeApiBase(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '')
}

// 把所有 < 写成 <：JSON 与 JS 字符串里都合法，且不会出现 </script 或 <!-- 提前结束内联脚本
const escapeInline = (json: string) => json.replace(/</g, '\\u003c')

function replaceOnce(html: string, mark: string, value: string): string {
  const first = html.indexOf(mark)
  if (first < 0 || html.indexOf(mark, first + mark.length) >= 0) {
    throw new Error(`index.html 里占位符 ${mark} 必须恰好出现一次`)
  }
  // 用函数形式替换，避免数据里的 $& 之类被当成替换模式
  return html.replace(mark, () => value)
}

/** 把内容数据与后端地址写进 index.html 的两个占位符。 */
export function injectHtml(html: string, dataJson: string, apiBase: string): string {
  return replaceOnce(replaceOnce(html, DATA_MARK, escapeInline(dataJson)), API_BASE_MARK, escapeInline(JSON.stringify(apiBase)))
}

export function tjInject(): Plugin {
  let dataJson: string | undefined
  return {
    name: 'tj-inject',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        dataJson ??= loadDataJson()
        return injectHtml(html, dataJson, normalizeApiBase(process.env.TIANJI_API_BASE))
      },
    },
  }
}
