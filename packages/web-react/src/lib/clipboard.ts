import { toast } from './toast'

/** 复制文本：同旧 copyText，剪贴板接口不可用时退回 execCommand('copy')，成功后提示。按钮的“已复制”状态由调用方组件处理。 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  toast('已复制到剪贴板')
}
