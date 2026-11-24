import { Icon } from '../../../components/Icon'
import { showModal } from '../../../components/TextModal'
import { nfmt } from '../../../domain/text'
import type { Work } from '../../../domain/types'
import type { VibeSx } from '../../../domain/vibe'
import { epText } from '../model'

/** 各集大纲分页：策划卡（重度思考时有）与分集表；“剧情对话”跳到剧情对话分页的那一集。 */
export function OutlineTab({ w, s, eps, onScript }: { w: Work; s: VibeSx; eps: string[]; onScript: (i: number) => void }) {
  const C = w.gen && w.gen.data && w.gen.data.card, R = (C && C.rules) || {}
  const rules = ([['权力上限', R.power], ['利益', R.stakes], ['空间升级', R.spaces], ['关键物证', R.evidence], ['主角的代价', R.limit], ['称谓变化', R.address]] as [string, unknown][]).filter((x) => x[1])
  const fixed = s.real && w.gen!.data!.fixed
  return (
    <>
      {C && (
        <details className="pcard" open>
          <summary>
            <Icon name="sparkle" />
            策划卡
          </summary>
          {C.mystery && (
            <p className="pc-m">
              <b>主线谜底</b>
              {C.mystery}
            </p>
          )}
          <div className="pc-rules">
            {rules.map(([k, v]) => (
              <div key={k}>
                <b>{k}</b>
                <span>{String(v)}</span>
              </div>
            ))}
          </div>
          <div className="pc-cast">
            {(C.cast || []).map((c, i) => (
              <div key={i}>
                <b>{c.name}</b>
                <small>
                  {c.role || ''}
                  {c.age ? ' · ' + c.age + ' 岁' : ''}
                </small>
                {c.look && (
                  <p>
                    <i>外观</i>
                    {c.look}
                  </p>
                )}
                {c.want && (
                  <p>
                    <i>欲望</i>
                    {c.want}
                  </p>
                )}
                {c.flaw && (
                  <p>
                    <i>弱点</i>
                    {c.flaw}
                  </p>
                )}
                {c.voice && (
                  <p>
                    <i>说话</i>
                    {c.voice}
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="vtable">
        <div className="vr vh">
          <span>集</span>
          <span>集名</span>
          <span>状态</span>
          <span>字数</span>
          <span>大纲</span>
        </div>
        {s.outline.map(([h, b], i) => (
          <div className="vr" key={i}>
            <span>第 {i + 1} 集</span>
            <span className="vn">{h}</span>
            {s.real && !s.written![i] ? (
              <span className="wait">待写</span>
            ) : (
              <span className="ok">
                已完成
                {fixed && fixed[i] ? <em className="fixn">修 {fixed[i]} 处</em> : null}
              </span>
            )}
            <span>{nfmt(epText(eps, i).length)}</span>
            <span className="vb">
              <button className="btn-o" data-ol={i} onClick={() => showModal(`第 ${i + 1} 集｜${h}`, b, `第${i + 1}集-分集大纲.txt`)}>
                分集大纲
              </button>
              <button className="btn-o" data-sc={i} onClick={() => onScript(i)}>
                剧情对话
              </button>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
