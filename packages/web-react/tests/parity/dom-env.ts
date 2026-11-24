import { JSDOM } from 'jsdom'

/**
 * 在 node 环境里手动装一个 jsdom 窗口当全局（结果页对照放在 node 项目，自己装 DOM；
 * legacy.ts 与 plugins/load-data.ts 现在在 node、jsdom 两个项目里都能 import）。
 * 必须在导入 react-dom、@testing-library/react 与被测组件之前调用。
 */
const FORCE = new Set(['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'history', 'Event', 'EventTarget', 'MouseEvent', 'KeyboardEvent', 'Node', 'Element', 'HTMLElement', 'getComputedStyle'])
// 保留 Node 自己的：URL（文件路径解析要用）、Blob（测试里另行替换）、定时器与微任务
const KEEP = new Set(['URL', 'URLSearchParams', 'Blob', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'queueMicrotask', 'console', 'performance', 'structuredClone', 'fetch', 'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal'])

export function installDom(): JSDOM {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' })
  const win = dom.window as any
  const g = globalThis as any
  for (const key of Object.getOwnPropertyNames(win)) {
    if (KEEP.has(key)) continue
    if (key in g && !FORCE.has(key)) continue
    try {
      Object.defineProperty(g, key, { configurable: true, get: () => win[key], set: (v) => void Object.defineProperty(g, key, { value: v, writable: true, configurable: true }) })
    } catch {
      // 个别属性不可重定义，忽略
    }
  }
  for (const k of ['window', 'self']) Object.defineProperty(g, k, { value: win, writable: true, configurable: true })
  g.IS_REACT_ACT_ENVIRONMENT = true
  return dom
}
