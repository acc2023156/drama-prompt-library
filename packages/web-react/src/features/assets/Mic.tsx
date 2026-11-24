import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { toast } from '../../lib/toast'

/** 浏览器语音识别（旧 SpeechRec）；不支持时为 undefined，旧页面此时不加话筒按钮。 */
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
type RecognitionCtor = new () => Recognition
export const speechRec = (): RecognitionCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition || w.webkitSpeechRecognition
}

/**
 * 输入框右下的话筒（旧 addMic + micListen）：说的话接在原文后面，边说边出字；再点一次停止。
 * 原文非空且不以标点结尾时用“，”连接。
 */
export function MicButton({ value, onText }: { value: string; onText(text: string): void }) {
  const [on, setOn] = useState(false)
  const rec = useRef<Recognition | null>(null)
  useEffect(() => () => rec.current?.stop(), [])
  const listen = () => {
    if (rec.current) {
      rec.current.stop()
      return
    }
    const Rec = speechRec()
    if (!Rec) return
    const r = new Rec()
    r.lang = 'zh-CN'
    r.interimResults = true
    r.continuous = true
    const base = value.replace(/\s+$/, ''), join = !base ? '' : /[，。！？、,.!?\n]$/.test(base) ? '' : '，'
    rec.current = r
    setOn(true)
    r.onresult = (e) => {
      let t = ''
      for (const x of Array.from(e.results)) t += x[0].transcript
      onText(base + join + t)
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
  return (
    <button
      type="button"
      className={on ? 'wc-mic on' : 'wc-mic'}
      title="用说的"
      onClick={(e) => {
        e.preventDefault()
        listen()
      }}
    >
      <Icon name="mic" />
    </button>
  )
}
