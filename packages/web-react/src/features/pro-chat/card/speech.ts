import { useEffect, useRef, useState } from 'react'
import { toast } from '../../../lib/toast'

/**
 * 语音输入（旧 micListen / addMic，site-template.html 第 1763–1780 行）：浏览器 SpeechRecognition，
 * 识别结果接在输入框原文后面，边说边出字。对话框麦克风、作品卡故事框与独家点子框三处共用。
 */

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & Iterable<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}

/** 浏览器的语音识别构造函数（旧 SpeechRec）；不支持时为 undefined，界面上就不出现麦克风按钮。 */
export function speechCtor(): (new () => Recognition) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition || w.webkitSpeechRecognition
}

/** 改 textarea 的值并派发 input：绕过 React 对 value 的记录，让组件的输入处理照常执行（同旧 ta.value=…; dispatchEvent）。 */
function writeValue(ta: HTMLTextAreaElement, v: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, v)
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}

/** 一个麦克风按钮的识别状态：on 对应旧按钮的 on 类；listen 再按一次即停止（旧 btn._rec）。 */
export function useMic() {
  const rec = useRef<Recognition | null>(null)
  const [on, setOn] = useState(false)
  useEffect(() => () => rec.current?.stop(), [])

  /** sep：接在原文后的分隔；缺省时原文以标点结尾就不加，否则加全角逗号。 */
  function listen(ta: HTMLTextAreaElement | null, sep?: string): void {
    if (rec.current) {
      rec.current.stop()
      return
    }
    const Rec = speechCtor()
    if (!Rec || !ta) return
    const r = new Rec()
    r.lang = 'zh-CN'
    r.interimResults = true
    r.continuous = true
    const base = ta.value.replace(/\s+$/, ''),
      join = !base ? '' : sep != null ? sep : /[，。！？、,.!?\n]$/.test(base) ? '' : '，'
    rec.current = r
    setOn(true)
    r.onresult = (e) => {
      let t = ''
      for (const x of e.results) t += x[0].transcript
      writeValue(ta, base + join + t)
    }
    r.onend = r.onerror = () => {
      rec.current = null
      setOn(false)
    }
    try {
      r.start()
    } catch {
      rec.current = null
      setOn(false)
      toast('这个浏览器不支持语音输入')
    }
  }

  /** 停止识别（旧 drawBody 里的 $('cMic')._rec.stop()）。 */
  const stop = () => rec.current?.stop()
  return { on, listen, stop }
}
