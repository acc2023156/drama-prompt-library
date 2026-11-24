import { Icon } from '../../../components/Icon'
import { sxHL } from '../../../domain/sx'
import type { Work } from '../../../domain/types'
import type { VibeSx } from '../../../domain/vibe'
import { epText } from '../model'

/** 剧情对话分页：逐集剧本（sxHL 高亮）；模型写好的集在不写作时可以重写。 */
export function ScriptTab({ w, s, eps, onRedo }: { w: Work; s: VibeSx; eps: string[]; onRedo: (k: number) => void }) {
  return (
    <div className="scr">
      {eps.map((_, i) => (
        <div className="ep" id={'ep' + i} key={i}>
          <div className="h">
            <b>EP{String(i + 1).padStart(2, '0')}</b>
            <span>{s.outline[i][0]}</span>
            {s.real && s.written![i] && w.gen!.status !== 'writing' && (
              <button className="btn-o ep-redo" data-redo={i} onClick={() => onRedo(i)}>
                <Icon name="dice" />
                重写
              </button>
            )}
          </div>
          <pre dangerouslySetInnerHTML={{ __html: sxHL(epText(eps, i)) }} />
        </div>
      ))}
    </div>
  )
}
