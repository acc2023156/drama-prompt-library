import type { CSSProperties } from 'react'
import { DEPTH, DEPTH_TIME, depthOf } from '../../../domain/yq'

/** 思考强度弹层的内容：轻 / 中 / 重三档滑杆。对话框底栏与作品卡共用（旧 drawThink / drawT）。 */
export function ThinkSlider({ depth, id, onPick }: { depth: string | undefined; id?: string; onPick(d: string): void }) {
  const d = depthOf({ depth }), k = DEPTH.indexOf(d)
  return (
    <>
      <div className="tk-h"><b>{d.slice(0, 1)}</b><span>{DEPTH_TIME[d]}</span></div>
      {/* 旧页面每次选完整个弹层重画，滑杆是新元素：用 key 让 React 同样换一个 */}
      <input
        key={d}
        type="range"
        className="tk-r"
        id={id}
        min="0"
        max="2"
        step="1"
        defaultValue={k}
        style={{ '--p': `${k * 50}%` } as CSSProperties}
        onInput={(e) => onPick(DEPTH[+e.currentTarget.value])}
      />
      <div className="tk-l"><span>轻</span><span>中</span><span>重</span></div>
    </>
  )
}

/** 按钮上的“轻度思考”等字样。 */
export const thinkLabel = (depth: string | undefined): string => depthOf({ depth }).slice(0, 1) + '度思考'
