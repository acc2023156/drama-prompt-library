/**
 * 读取上传的剧本或小说（旧 readAnyFile，site-template.html 第 1601–1619 行）。
 * docx、pdf 与旧页面一样在用到时才从 cdnjs 动态加载 mammoth、pdf.js（不打进产物）；txt / md 依序试 UTF-8、GB18030、Big5。
 */

export const MAMMOTH_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
export const PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
export const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

interface Mammoth {
  extractRawText(o: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(o: { data: ArrayBuffer }): {
    promise: Promise<{ numPages: number; getPage(i: number): Promise<{ getTextContent(): Promise<{ items: { str: string; hasEOL?: boolean }[] }> }> }>
  }
}

// 两个库由 CDN 脚本挂到全局；与旧页面一样直接引用全局名（脚本未载入时报 “mammoth is not defined”，提示文字因此相同）
declare const mammoth: Mammoth
declare const pdfjsLib: PdfJs

/** 页面里已有同一地址的脚本就直接返回（旧页面同样不管它当初是否载入成功）。 */
function loadJs(src: string): Promise<void> {
  return new Promise((ok, bad) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok()
    const s = document.createElement('script')
    s.src = src
    s.onload = () => ok()
    s.onerror = () => bad(new Error('载入失败'))
    document.head.appendChild(s)
  })
}

export async function readAnyFile(file: File): Promise<string> {
  const name = file.name.toLowerCase(), buf = await file.arrayBuffer()
  if (name.endsWith('.docx')) {
    await loadJs(MAMMOTH_SRC)
    return (await mammoth.extractRawText({ arrayBuffer: buf })).value
  }
  if (name.endsWith('.pdf')) {
    await loadJs(PDFJS_SRC)
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise, out: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const c = await (await pdf.getPage(i)).getTextContent()
      out.push(c.items.map((x) => x.str + (x.hasEOL ? '\n' : '')).join(''))
    }
    return out.join('\n')
  }
  for (const enc of ['utf-8', 'gb18030', 'big5']) {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(buf).replace(/^﻿/, '')
    } catch {
      // 换下一种编码
    }
  }
  return new TextDecoder('utf-8').decode(buf)
}
