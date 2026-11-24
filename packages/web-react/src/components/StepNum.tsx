import { Icon } from './Icon'

/** 步骤数字（旧 sn）：state = 'done'（紫底打勾）| 'on'（紫底数字）| ''（黑底数字）。 */
export function StepNum({ n, state = '' }: { n: number | string; state?: '' | 'on' | 'done' }) {
  return <i className={`sn ${state}`}>{state === 'done' ? <Icon name="check" /> : n}</i>
}
