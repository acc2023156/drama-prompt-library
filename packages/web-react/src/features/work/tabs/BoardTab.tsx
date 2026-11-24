import { type CSSProperties, useCallback, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { SX_COLORS, sxHL } from '../../../domain/sx'
import type { Work, WzSettings } from '../../../domain/types'
import { epMat, type VibeSx } from '../../../domain/vibe'
import { wzMins } from '../../../domain/wz'
import { epText } from '../model'
import { Vm } from '../Vm'

/** 分镜图分页：每集一张卡（时长、角色数、场景数），预览弹层与“编辑 / 去生成”跳组装器的分镜编辑（#/assembler?ep=作品.集）。 */
export function BoardTab({ w, s, W, eps }: { w: Work; s: VibeSx; W: WzSettings; eps: string[] }) {
  const [vm, setVm] = useState<{ kind: 'vid' | 'seg'; i: number } | null>(null)
  const close = useCallback(() => setVm(null), [])
  const sec = Math.round((wzMins(W) || 1) * 60), dur = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
  const ar = (W.ratio || '9:16').replace(':', '/')
  const gen = (i: number) => {
    setVm(null)
    location.hash = `#/assembler?ep=${w.id}.${i}`
  }
  // 旧页面读 w.videos，但没有任何地方写它，始终为空
  const vidUrl = (i: number) => ((w.videos as string[] | undefined) || [])[i]
  const tile = (i: number) => ({ '--ar': ar, '--c': SX_COLORS[i % 10] }) as CSSProperties

  const vidView = (i: number) => {
    const u = vidUrl(i)
    return (
      <div className="vm-vid" style={tile(i)}>
        {u ? (
          <video src={u} controls autoPlay playsInline />
        ) : (
          <>
            <div className="vm-empty">
              <span>
                <Icon name="play" />
              </span>
              <p>这一集还没有视频</p>
              <button className="bigbtn vm-gen" data-gen={i} onClick={() => gen(i)}>
                <Icon name="sparkle" />
                去生成
              </button>
            </div>
            <div className="vm-bar">
              <span>00:00</span>
              <span className="mute">{dur}</span>
              <i />
            </div>
          </>
        )}
        <button className="vm-x" data-close>
          <Icon name="x" />
        </button>
      </div>
    )
  }
  const segView = (i: number) => {
    const t = epText(eps, i), M = epMat(t), u = vidUrl(i)
    const mats = [...M.people.map((n) => ({ n, ic: (n === s.name && s.g === 'female') || (n === s.name2 && s.leads[1].startsWith('女')) ? 'female' as const : 'user' as const })), ...M.locs.map((n) => ({ n, ic: 'mount' as const }))]
    return (
      <div className="vm-seg">
        <div className="vm-h">
          <b>第 {i + 1} 集：{s.outline[i][0]}</b>
          <button className="vm-x in" data-close>
            <Icon name="x" />
          </button>
        </div>
        <div className="vm-scroll">
          <div className="vm-player">
            {u ? (
              <video src={u} controls playsInline />
            ) : (
              <span className="vm-pf" style={tile(i)}>
                <Icon name="play" />
                <button className="btn-o" data-gen={i} onClick={() => gen(i)}>
                  去生成
                </button>
              </span>
            )}
            <em className="dur">{sec}s</em>
          </div>
          <div className="vm-mats">
            {mats.map((x, k) => (
              <span className="vm-mat" title={x.n} key={k}>
                <i style={{ '--c': SX_COLORS[(k + i) % 10] } as CSSProperties}>
                  <Icon name={x.ic} />
                </i>
                <small>{x.n}</small>
              </span>
            ))}
          </div>
          <pre className="vm-txt" dangerouslySetInnerHTML={{ __html: sxHL(t) }} />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="vep-grid">
        {s.outline.map(([h], i) => {
          const M = epMat(epText(eps, i)), sc = M.locs.length, ro = Math.max(1, M.people.length)
          return (
            <div className="vep" key={i}>
              <button className="vep-th" data-vid={i} style={{ '--c': SX_COLORS[i % 10] } as CSSProperties} onClick={() => setVm({ kind: 'vid', i })}>
                <Icon name="play" />
                <em className="dur">{dur}</em>
              </button>
              <div className="vep-b">
                <div className="vep-tags">
                  <span>待生成</span>
                  <span>{W.ratio || '9:16'}</span>
                </div>
                <h3>
                  第 {i + 1} 集：{h}
                </h3>
                <div className="vep-meta">
                  <span>角色 {ro}</span>
                  <span>场景 {sc}</span>
                  <span>分镜视频 0/{sc}</span>
                </div>
                <div className="vep-act">
                  <button className="vep-play" data-pv={i} title="预览" onClick={() => setVm({ kind: 'seg', i })}>
                    <Icon name="play" />
                  </button>
                  <button className="btn-o" data-sb={i} onClick={() => gen(i)}>
                    编辑
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {vm && <Vm onClose={close}>{vm.kind === 'vid' ? vidView(vm.i) : segView(vm.i)}</Vm>}
    </>
  )
}
