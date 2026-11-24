import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from '../../components/Icon'
import type { Listing, Work } from '../../domain/types'
import { vibeData } from '../../domain/vibe'
import { wzMins } from '../../domain/wz'
import { saveBlob } from '../../lib/download'
import { toast } from '../../lib/toast'
import { makeZip } from '../../lib/zip'
import { CopyBtn } from './CopyBtn'
import { exportFiles } from './export'
import { AI_SITES, progressOf, reviewText, TAB_FN, TABS } from './model'
import { AssetsTab } from './tabs/AssetsTab'
import { BoardTab } from './tabs/BoardTab'
import { ListingTab } from './tabs/ListingTab'
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
  onListing: (L: Listing) => void
}

/** 导出菜单：项目 ZIP 与 XTASY 导入包；点菜单外任何地方收起。 */
function ExportMenu({ build }: { build: () => ReturnType<typeof exportFiles> }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.export-wrap')) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])
  const save = (suffix: string) => {
    const x = build()
    saveBlob(makeZip(x.files), `${x.safe}-${suffix}.zip`)
    setOpen(false)
  }
  return (
    <div className="export-wrap" ref={wrap}>
      <button
        className="btn-o"
        id="vtExport"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        <Icon name="dl" />
        <span className="lbl">导出</span>
      </button>
      <div className={open ? 'export-menu open' : 'export-menu'} id="exportMenu">
        <button
          id="exportZip"
          onClick={() => {
            save('天玑项目')
            toast('项目 ZIP 已导出到本地')
          }}
        >
          <Icon name="dl" />
          导出到本地（ZIP）
        </button>
        <button
          id="exportXtasy"
          onClick={() => {
            save('XTASY导入包')
            window.open('https://xtasyart.com/', '_blank', 'noopener')
            toast('XTASY 导入包已下载，请在新页面选择导入')
          }}
        >
          <Icon name="arrowUp" />
          导入到 XTASY
        </button>
      </div>
    </div>
  )
}

/** 作品页主体（旧 viewVibeScript 第 2975 行起）：标题与进度、分页、编辑 / 导出 / AI 审稿、当前分页内容。 */
export function ReadyView({ w, tab, epoch, setTab, onResume, onRedo, onListing }: ReadyViewProps) {
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
          <ExportMenu key={epoch} build={() => exportFiles(w, s, W, eps, new Date())} />
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
        ) : tab === 'listing' ? (
          <ListingTab w={w} onSaved={onListing} />
        ) : tab === 'assets' ? (
          <AssetsTab key={epoch} w={w} s={s} W={W} eps={eps} />
        ) : tab === 'board' ? (
          <BoardTab w={w} s={s} W={W} eps={eps} />
        ) : null}
      </div>
    </>
  )
}
