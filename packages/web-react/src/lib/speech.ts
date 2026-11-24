import { useEffect, useRef, useState } from 'react'
import { toast } from './toast'

/**
 * 语音输入（旧 micListen / addMic，site-template.html 第 1763–1780 行）：浏览器 SpeechRecognition，
 * 识别结果接在输入框原文后面，边说边出字。对话框麦克风、作品卡故事框与独家点子框（直接写 textarea）、
 * 资产编辑器话筒（MicButton，受控值加回调）共用这一份识别逻辑。
 */

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
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

  /** 识别核心：base 为 null 表示没有可写的输入框（不开始识别）；每次识别结果经 write 写回。 */
  function run(base: string | null, write: (text: string) => void, sep?: string): void {
    if (rec.current) {
      rec.current.stop()
      return
    }
    const Rec = speechCtor()
    if (!Rec || base == null) return
    const r = new Rec()
    r.lang = 'zh-CN'
    r.interimResults = true
    r.continuous = true
    const prefix = base.replace(/\s+$/, ''),
      join = !prefix ? '' : sep != null ? sep : /[，。！？、,.!?\n]$/.test(prefix) ? '' : '，'
    rec.current = r
    setOn(true)
    r.onresult = (e) => {
      let t = ''
      for (const x of Array.from(e.results)) t += x[0].transcript
      write(prefix + join + t)
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

  /** 写进 textarea（同旧 micListen）。sep：接在原文后的分隔；缺省时原文以标点结尾就不加，否则加全角逗号。 */
  function listen(ta: HTMLTextAreaElement | null, sep?: string): void {
    run(ta ? ta.value : null, (v) => writeValue(ta!, v), sep)
  }

  /** 受控输入：以 value 为原文，识别结果经 onText 回传（资产编辑器的话筒）。 */
  function listenText(value: string, onText: (text: string) => void, sep?: string): void {
    run(value, onText, sep)
  }

  /** 停止识别（旧 drawBody 里的 $('cMic')._rec.stop()）。 */
  const stop = () => rec.current?.stop()
  return { on, listen, listenText, stop }
}
