import { useMic } from '../lib/speech'
import { Icon } from './Icon'

/**
 * 输入框右下的话筒（旧 addMic + micListen，受控输入版）：说的话接在原文后面，边说边出字；再点一次停止。
 * 原文非空且不以标点结尾时用“，”连接。识别逻辑见 lib/speech.ts（与对话框、作品卡共用）。
 */
export function MicButton({ value, onText }: { value: string; onText(text: string): void }) {
  const { on, listenText } = useMic()
  return (
    <button
      type="button"
      className={on ? 'wc-mic on' : 'wc-mic'}
      title="用说的"
      onClick={(e) => {
        e.preventDefault()
        listenText(value, onText)
      }}
    >
      <Icon name="mic" />
    </button>
  )
}
