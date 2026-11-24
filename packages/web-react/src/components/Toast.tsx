import { useToast } from '../lib/toast'

/** 底部提示条（旧 #toast），由 lib/toast 的 toast() 驱动。 */
export function Toast() {
  const t = useToast()
  return (
    <div className={t.show ? 'toast show' : 'toast'} id="toast">
      {t.text}
    </div>
  )
}
