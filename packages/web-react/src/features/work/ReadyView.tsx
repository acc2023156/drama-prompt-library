import { type CSSProperties, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from '../../components/Icon'
import type { Work } from '../../domain/types'
import { vibeData } from '../../domain/vibe'
import { wzMins } from '../../domain/wz'
import { toast } from '../../lib/toast'
import { CopyBtn } from './CopyBtn'
import { AI_SITES, progressOf, reviewText, TAB_FN, TABS } from './model'
import { AssetsTab } from './tabs/AssetsTab'
import { BoardTab } from './tabs/BoardTab'
import { OutlineTab } from './tabs/OutlineTab'
import { ScriptTab } from './tabs/ScriptTab'

export interface ReadyViewProps {
  w: Work
  tab: string
  /** 每次重新进入作品页（含写作进度刷新）加 1：旧页面整页重画，资产分页的角色 / 场景选择与导出菜单随之复位。 */
  epoch: number
  setTab: (tab: string) => void
  onResume: () => void
  onRedo: (k: number) => void
}

/** 作品页主体（旧 viewVibeScript 第 2975 行起）：标题与进度、分页、编辑 / AI 审稿、当前分页内容。 */
export function ReadyView({ w, tab, epoch, setTab, onResume, onRedo }: ReadyViewProps) {
  const { s, eps } = useMemo(() => vibeData(w), [w])
  const W = s.W, ai = W.ai || 'Claude', site = AI_SITES[ai]
  const prog = progressOf(w, s)
  // 不存在的分页（地址手写）：旧页面画到侧栏就抛错，分页按钮不高亮、内容为空
  const known = !!TAB_FN[tab]
  const toScript = (i: number) => {
    flushSync(() => setTab('script'))
    document.getElementById('ep' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <>
      <div className="res-back">
        <a className="pill" href="#/script">
          <Icon name="back" />
          返回
        </a>
      </div>
      <section className="done-hero">
        <h1>《{w.title}》</h1>
        {prog &&
          (prog.err ? (
            <div className="gen-prog err">
              第 {prog.nx} 集没写成
              <button className="btn-o" id="gResume" onClick={onResume}>
                接着写
              </button>
            </div>
          ) : (
            <div className={`gen-prog ${prog.note ? 'busy' : ''}`}>
              <span className="gw-spin" />
              {prog.note ? prog.note : `正在写第 ${prog.nx} / ${prog.n} 集`}
              <i style={{ '--p': `${prog.pct}%` } as CSSProperties} />
            </div>
          ))}
        <div className="stats">
          <span>
            <b>{s.outline.length}</b>集
          </span>
          <span>
            <b>{wzMins(W)}</b>分钟 / 集
          </span>
          <span>{W.aud}</span>
          <span>{W.pair}</span>
          {W.style && W.style !== '无' && <span>{W.style}</span>}
          <span>{W.ratio || '9:16'}</span>
        </div>
      </section>
      <div className="vt">
        <div className="vt-tabs" id="vtTabs">
          {TABS.map(([k, l]) => (
            <button key={k} data-t={k} className={k === tab && known ? 'on' : ''} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="vt-act">
          <a className="btn-o" id="vtEdit" href={`#/script/w/${w.id}`}>
            <Icon name="pen" />
            <span className="lbl">编辑作品</span>
          </a>
          <CopyBtn
            className="btn-o"
            id="vtAI"
            style={tab === 'assets' || tab === 'board' || tab === 'listing' ? { display: 'none' } : undefined}
            text={() => reviewText(w.title, eps)}
            after={() => {
              if (site) window.open(site, '_blank', 'noopener')
              toast(site ? `已复制，到 ${ai} 贴上就开始审稿` : '已复制审稿提示词')
            }}
          >
            <Icon name="sparkle" />
            <span className="lbl">AI 审稿</span>
          </CopyBtn>
        </div>
      </div>
      <div id="vtBody">
        {tab === 'outline' ? (
          <OutlineTab w={w} s={s} eps={eps} onScript={toScript} />
        ) : tab === 'script' ? (
          <ScriptTab w={w} s={s} eps={eps} onRedo={onRedo} />
        ) : tab === 'assets' ? (
          <AssetsTab key={epoch} w={w} s={s} W={W} eps={eps} />
        ) : tab === 'board' ? (
          <BoardTab w={w} s={s} W={W} eps={eps} />
        ) : null}
      </div>
    </>
  )
}
