/** 触发浏览器下载：同旧 saveBlob，1.5 秒后释放对象地址。 */
export function saveBlob(blob: Blob, name: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1500)
}

/** 下载纯文本（带 BOM），同旧 showModal 的“下载 .txt”，1 秒后释放。 */
export function saveText(text: string, name: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
