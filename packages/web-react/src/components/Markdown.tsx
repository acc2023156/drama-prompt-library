import { useLayoutEffect, useRef } from 'react'
import { copyText } from '../lib/clipboard'
import { icoHtml } from './Icon'

declare global {
  interface Window {
    marked?: { parse(md: string, opt: { gfm: boolean; breaks: boolean }): string }
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** markdown 转 HTML：同旧 renderMd，有 window.marked 时用它（gfm、不转换单换行），否则原文放进 pre。 */
export function mdHtml(md: string): string {
  return window.marked ? window.marked.parse(md, { gfm: true, breaks: false }) : '<pre style="white-space:pre-wrap">' + esc(md) + '</pre>'
}

/** 渲染后的 DOM 处理（同旧 renderMd）：外链新窗口；每个 pre 换成带“复制”按钮的提示词正文卡片。 */
export function enhanceMd(box: HTMLElement): void {
  box.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => {
    a.target = '_blank'
    a.rel = 'noopener'
  })
  box.querySelectorAll('pre').forEach((pre) => {
    const code = pre.textContent || ''
    const w = document.createElement('div')
    w.className = 'code'
    w.innerHTML = `<div class="bar">${icoHtml('copy').replace('<svg', '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"')}提示词正文 · ${code.length} 字<span class="sp"></span><button class="copy">${icoHtml('copy')}复制</button></div><pre></pre>`
    w.querySelector('pre')!.textContent = code
    const btn = w.querySelector<HTMLButtonElement>('.copy')!
    btn.onclick = async () => {
      await copyText(code)
      btn.classList.add('done')
      const h = btn.innerHTML
      btn.innerHTML = icoHtml('check') + '已复制'
      setTimeout(() => {
        btn.classList.remove('done')
        btn.innerHTML = h
      }, 1300)
    }
    pre.replaceWith(w)
  })
}

/**
 * markdown 正文（仓库内的提示词与更新记录，来自 build.py data，非用户输入）。
 * marked 尚未打包进产物（新增依赖需 P0 合入），此前与旧页面在 marked 加载失败时的表现相同。
 */
export function Markdown({ md, className }: { md: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    box.innerHTML = mdHtml(md)
    enhanceMd(box)
  }, [md])
  return <div ref={ref} className={className} />
}
