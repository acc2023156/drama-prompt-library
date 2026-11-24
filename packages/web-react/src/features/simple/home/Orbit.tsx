import { type CSSProperties, type MouseEvent, useEffect, useRef } from 'react'
import {
  type Board, type HotFeed, type LiveRow, type Range, type RoleRow, type StarRow,
  STAR_COLORS, hotData, hotItems, hotPal, hotTabs, roleData,
} from './orbit-data'

const RANGES: [Range, string][] = [['1h', '1 小时'], ['24h', '24 小时'], ['7d', '7 天']]
const css = (o: Record<string, string>) => o as CSSProperties

export interface OrbitProps {
  board: Board
  range: Range
  hotCat: string
  hot: HotFeed | null
  /** 每次重画（旧 drawOrbit）加一：行星节点重建，轨道动画从头开始，同旧页面。 */
  drawRev: number
  onRange(r: Range): void
  onHotCat(k: string): void
  /** 点星体、核心或排行行：热点进氛围写作，角色进角色库。 */
  onStar(d: StarRow): void
  /** 角色排行的两个按钮：角色库 / 开剧本。 */
  onRole(d: RoleRow, write: boolean): void
}

/** 剧本热点七星 / 开阳角色七星（旧 drawOrbit、drawHseg，site-template.html 第 2368–2418 行）。 */
export function Orbit({ board, range, hotCat, hot, drawRev, onRange, onHotCat, onStar, onRole }: OrbitProps) {
  const lv: LiveRow[] | null | false = board === 'hot' && hotItems(hot, hotCat)
  const data: StarRow[] = board === 'hot' ? lv || hotData(range) : roleData()
  const cols = lv ? hotPal(hotCat) : STAR_COLORS
  const short = (t: string) => (t.length > 8 ? t.slice(0, 8) + '…' : t)
  const heatOf = (d: StarRow) => (board === 'hot' ? (d[2] as number) : (d[3] as number))
  const top = data[0]
  const tabs = hotTabs(hot)

  const stageRef = useRef<HTMLDivElement>(null)
  const lastStar = useRef(0)
  useEffect(() => {
    lastStar.current = 0
  }, [drawRev])

  // 悬停减速、鼠标落星：纯展示，直接操作舞台节点（同旧实现）
  const rate = (v: number) => stageRef.current?.getAnimations?.({ subtree: true }).forEach((a) => { a.playbackRate = v })
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const stage = e.currentTarget
    const now = performance.now()
    if (now - lastStar.current < 35 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    lastStar.current = now
    const r = stage.getBoundingClientRect(), st = document.createElement('i')
    st.className = 'star-fall'
    st.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;--dx:${(Math.random() * 30 - 15).toFixed(0)}px;--c:${cols[Math.floor(Math.random() * cols.length)]}`
    stage.append(st)
    setTimeout(() => st.remove(), 900)
  }

  return (
    <section className="orbit-sec" aria-labelledby="orbitTitle">
      <div className="orbit-head">
        <div>
          <h2 id="orbitTitle">{board === 'hot' ? '剧本热点七星 ' : '开阳角色七星 '}<span className="tag int">测试</span></h2>
          <p id="orbitSub">{lv ? '点一颗星，带灵感直接开写' : board === 'hot' ? '七颗星对应七个剧本主题，星体大小代表热度指数' : '开阳精选角色映射到天玑角色原型，点击星体或排行即可查看'}</p>
        </div>
        <span className="sp"></span>
        <div className="orbit-ranges" id="orbitRanges" style={{ visibility: board === 'hot' && !lv ? 'visible' : 'hidden' }}>
          {RANGES.map(([r, label]) => (
            <button key={r} className={r === range ? 'on' : undefined} data-r={r} onClick={() => onRange(r)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="orbit-layout">
        <div className="orbit-left">
          <div className="hseg" id="hseg" style={{ display: tabs.length && board === 'hot' ? undefined : 'none' }}>
            {tabs.map((k) => {
              const c = hotPal(k)
              return (
                <button key={k} data-h={k} className={k === hotCat && board === 'hot' ? 'on' : ''} style={css({ '--a': c[0], '--b': c[6] })} onClick={() => onHotCat(k)}>{k}</button>
              )
            })}
          </div>
          <div className="orbit-stage" id="orbitStage" aria-label="七星行星动态排行" ref={stageRef} onMouseEnter={() => rate(0.3)} onMouseLeave={() => rate(1)} onMouseMove={onMove}>
            <span className="orbit-stars"></span>
            <i className="orbit-line o1"></i>
            <i className="orbit-line o2"></i>
            <i className="orbit-line o3"></i>
            <button
              className="orbit-core"
              id="orbitCore"
              style={lv ? { background: `radial-gradient(circle at 35% 30%,#ffffffaa,${cols[0]} 48%,${cols[6]})`, boxShadow: `0 0 45px ${cols[0]}88` } : undefined}
              onClick={() => onStar(top)}
            >
              {lv ? (
                <span><b>{short(top[0])}</b><strong>1</strong><small>热度第一</small></span>
              ) : (
                <span><b>{top[0]}</b><strong>{heatOf(top)}</strong><small>热度第一</small></span>
              )}
            </button>
            {data.slice(1).map((d, j) => {
              const i = j + 1, heat = heatOf(d), ring = j < 1 ? 1 : j < 3 ? 2 : 3
              return (
                <span key={`${drawRev}-${j}`} className={`planet-path ring${ring}`} style={css({ '--angle': `${[25, 145, 255, 70, 190, 310][j]}deg`, '--dur': `${[24, 32, 28, 38, 34, 42][j]}s` })}>
                  <button className="planet" style={css({ '--size': `${Math.round(48 + heat * 0.32)}px`, '--color': cols[i] })} aria-label={`第 ${i + 1} 名 ${d[0]}`} onClick={() => onStar(d)}>
                    <b>{lv ? short(d[0]) : d[0]}</b>
                    <span>{lv ? '第 ' + (i + 1) : heat}</span>
                  </button>
                </span>
              )
            })}
          </div>
        </div>
        <div className="orbit-side" id="orbitRanks">
          <h3>TOP 7 {board === 'hot' ? (lv ? hotCat : '热点主题') : '角色排行'}</h3>
          {data.map((d, i) => {
            const heat = heatOf(d), share = board === 'hot' ? d[3] : d[4], trend = board === 'hot' ? d[4] : d[5]
            const meta = lv ? d[1] || '' : board === 'hot' ? `声量 ${share}% · 趋势 ${trend}` : `${d[6]} · 热度 ${heat}`
            return (
              <div
                key={`${drawRev}-${i}`}
                className={`rank-row ${lv ? 'live' : ''}`}
                data-star={i}
                style={css({ '--c': cols[i] })}
                onClick={(e) => {
                  if ((e.target as Element).closest('.rank-actions')) return
                  onStar(d)
                }}
              >
                <i>{String(i + 1).padStart(2, '0')}</i>
                <span><b>{d[0]}</b><small>{meta}</small></span>
                <strong>{lv ? '' : heat}</strong>
                {board === 'role' && (
                  <span className="rank-actions">
                    <button data-view={i} onClick={() => onRole(d as RoleRow, false)}>角色库</button>
                    <button data-write={i} onClick={() => onRole(d as RoleRow, true)}>开剧本</button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <p className="orbit-note" id="orbitNote"></p>
    </section>
  )
}
