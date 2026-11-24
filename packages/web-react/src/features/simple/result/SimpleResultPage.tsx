import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from '../../../components/Icon'
import { ICONS } from '../../../components/icons'
import { showModal } from '../../../components/TextModal'
import { DATA } from '../../../data'
import { makeLib } from '../../../domain/library'
import { SX_COLORS, sxBuildWork, sxHL, sxPrompt, sxScript, sxScriptText } from '../../../domain/sx'
import type { SxState, Work } from '../../../domain/types'
import { copyText } from '../../../lib/clipboard'
import { saveText } from '../../../lib/download'
import { get, isPro, set } from '../../../lib/storage'
import { toast } from '../../../lib/toast'

export interface SimpleResultPageProps {
  sid: string
  /** #/script/s/:id?new=1：刚产出 */
  fresh: boolean
}

type Tab = 'outline' | 'script'

const CONFETTI_COLORS = ['#731dfb', '#3fb6ff', '#ffd23f', '#3ddc97', '#ff5d6c', '#ffffff']
const epNo = (i: number) => `EP${String(i + 1).padStart(2, '0')}`

/** 旧页面撒花：60 片，每片先取 left 再取 animation-delay（随机序与旧模板一致）。 */
function makeConfetti() {
  return Array.from({ length: 60 }, () => ({ left: Math.random() * 100, delay: Math.random() * 0.6 }))
}

/** 复制全部：点击后 1.3 秒内显示“已复制”（旧 copyText 对按钮的反馈）。 */
function CopyAllButton({ getText }: { getText: () => string }) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      className={done ? 'btn-o done' : 'btn-o'}
      id="scCopy"
      title="复制全部"
      onClick={async () => {
        await copyText(getText())
        setDone(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setDone(false), 1300)
      }}
    >
      {done ? (
        <>
          <Icon name="check" />
          已复制
        </>
      ) : (
        <>
          <Icon name="copy" />
          <span className="lbl">复制全部</span>
        </>
      )}
    </button>
  )
}

/** 旧 viewScriptResult（site-template.html 第 3137 行）：标准版生成结果页。 */
export function SimpleResultPage({ sid, fresh }: SimpleResultPageProps) {
  return <ResultLoader key={sid} sid={sid} fresh={fresh} />
}

/** 挂载时读一次作品，同旧页面渲染时 store('works') 取一次；之后的变化由路由重新挂载带来。 */
function ResultLoader({ sid, fresh }: SimpleResultPageProps) {
  const [w] = useState(() => (get('works') || []).find((x) => x.id === sid))
  // 旧页面对没有 sx 的作品会抛异常、保留上一页（站内链接到不了）；这里按“找不到”处理，避免整个应用崩溃
  if (!w || !w.sx) return <div className="empty">找不到这部剧本，可能已在别的浏览器里。</div>
  return <ResultView w={w} s0={w.sx} fresh={fresh} />
}

function ResultView({ w, s0, fresh }: { w: Work; s0: SxState; fresh: boolean }) {
  const [seed, setSeed] = useState(s0.seed)
  const [ui, setUi] = useState<{ tab: Tab; anim: boolean; n: number }>({ tab: s0.seed ? 'script' : 'outline', anim: fresh, n: 0 })
  const [confetti] = useState(() => (fresh ? makeConfetti() : null))
  const [back] = useState(() => (w.kind === 'simple' && !isPro() ? '#/' : '#/script'))
  const rbody = useRef<HTMLDivElement>(null)

  // 旧页面直接改 s.seed；这里 seed 单独成状态，其余字段保持读到的原样
  const s = useMemo<SxState>(() => (seed === s0.seed ? s0 : { ...s0, seed }), [s0, seed])
  const t = s.role
  const { tab, anim, n } = ui
  const scripts = useMemo(() => (tab === 'script' ? sxScript(s) : []), [tab, s])

  const roles = (DATA.roles as Record<string, { type: string }[]>)[s.g]
  const avatar = SX_COLORS[roles.findIndex((x) => x.type === t.type) % 10] || '#4a5d78'
  const delay = (i: number) => ({ animationDelay: `${anim ? i * 0.07 : 0}s` })

  /** 旧 setSeed：换一个随机种子并写回作品。 */
  const reseed = () => {
    const next = Math.floor(Math.random() * 1e9) + 1
    set('works', sxBuildWork(get('works') || [], { ...s0, seed: next }, Date.now()).list)
    setSeed(next)
  }
  /** 旧 draw：重画分页内容；n 变化让条目重新挂载，动画重新播放。 */
  const draw = (tab: Tab, anim: boolean) => setUi((u) => ({ tab, anim, n: u.n + 1 }))

  const rows: [string, string][] = [['表面', t.surface], ['内心', t.hidden], ['金手指', t.gold], ['关系', t.rel], ['要点', t.note]]
  const tabBtn = (id: Tab, label: string) => (
    <button
      data-t={id}
      className={tab === id ? 'on' : undefined}
      onClick={() => {
        if (id === 'script' && !seed) reseed()
        draw(id, false)
      }}
    >
      {label}
    </button>
  )

  return (
    <>
      <div className="res-back">
        <a className="pill" href={back} id="resBack">
          <Icon name="back" />
          返回
        </a>
      </div>
      <section className="done-hero">
        {confetti && (
          <div className="confetti">
            {confetti.map((c, i) => (
              <i key={i} style={{ left: `${c.left}%`, background: CONFETTI_COLORS[i % 6], animationDelay: `${c.delay}s` }} />
            ))}
          </div>
        )}
        <span className="badge">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: ICONS.check }} />
          {fresh ? '剧本大纲完成！' : '我的剧本'}
        </span>
        <h1>{`《${s.title}》`}</h1>
        <div className="stats">
          <span><b>10</b>集</span>
          <span><b>~10</b>分钟总片长</span>
          <span><b>~4,000</b>字</span>
          <span><b>1</b>位主角</span>
        </div>
      </section>
      <div className="res-grid">
        <aside className="hero-card">
          <div className="av" style={{ background: `linear-gradient(160deg,${avatar},#1a1a1d)` }}>
            <Icon name={s.g === 'male' ? 'user' : 'female'} />
          </div>
          <h3>{s.name}</h3>
          <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{`${s.g === 'male' ? '男频' : '女频'} · ${t.type}`}</div>
          <div className="kv">
            {rows.map(([k, v]) => (
              <Fragment key={k}>
                <span>{k}</span>
                <span>{v}</span>
              </Fragment>
            ))}
          </div>
          <div className="tags" style={{ marginTop: 12 }}>
            {t.genres.split('、').map((x, i) => (
              <span className="tag" key={i}>{x}</span>
            ))}
          </div>
        </aside>
        <div>
          <div className="rtabs">
            <div className="gseg" id="rtab">
              {tabBtn('outline', '分集大纲')}
              {tabBtn('script', '完整台词')}
            </div>
            <button
              className="btn-o"
              id="redo"
              onClick={() => {
                reseed()
                draw('script', true)
                toast('已重写一版台词')
              }}
            >
              <Icon name="dice" />
              <span className="lbl">重写</span>
            </button>
            <button className="btn-o" id="seePrompt" onClick={() => showModal(`《${s.title}》10 集剧本提示词`, sxPrompt(s, makeLib(DATA.entries.map((e) => ({ ...e })))), `${s.title}-10集剧本提示词.txt`)}>
              <Icon name="sparkle" />
              <span className="lbl">AI 精写提示词</span>
            </button>
            <div className="act" id="scAct" style={{ visibility: tab === 'script' ? 'visible' : 'hidden' }}>
              <CopyAllButton getText={() => sxScriptText(s)} />
              <button className="btn-o" id="scDl" title="下载 .txt" onClick={() => saveText(sxScriptText(s), `${s.title}-10集完整台词.txt`)}>
                <Icon name="dl" />
                <span className="lbl">下载 .txt</span>
              </button>
            </div>
          </div>
          <div id="rbody" ref={rbody}>
            {tab === 'outline' ? (
              <div className="eps" key={n}>
                {s.outline.map(([h, b], i) => (
                  <div className="ep" style={delay(i)} key={i}>
                    <div className="h"><b>{epNo(i)}</b><span>{h}</span></div>
                    <p>{b}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="scr" key={n}>
                {scripts.map((x, i) => (
                  <div className="ep" style={delay(i)} key={i}>
                    <div className="h"><b>{epNo(i)}</b><span>{s.outline[i][0]}</span></div>
                    <pre dangerouslySetInnerHTML={{ __html: sxHL(x.split('\n').slice(1).join('\n').trim()) }} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="next">
            <h4 id="nxH">{tab === 'script' ? '10 集完整台词已生成' : '下一步：把大纲写成完整台词'}</h4>
            <div className="row">
              <button
                className="magic"
                id="toScript"
                style={{ height: 44, display: tab === 'script' ? 'none' : undefined }}
                onClick={() => {
                  if (!seed) reseed()
                  // 旧页面先同步重画再滚动；flushSync 保证滚动时新内容已在页面里
                  flushSync(() => draw('script', true))
                  rbody.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                <Icon name="script" />
                完整台词
              </button>
              <a className="btn-o" href="#/script" style={{ textDecoration: 'none' }}>
                再来一部
              </a>
              <button
                className="btn-o"
                id="toPro"
                onClick={() => {
                  set('pro', true)
                  location.hash = '#/script/w/' + w.id
                }}
              >
                到 PRO 版细修
              </button>
              <a className="btn-o pt-entry" href="#/partner" style={{ textDecoration: 'none' }}>
                <Icon name="sparkle" />
                AI短剧伙伴计划
              </a>
              <button
                className="btn-o"
                id="delWork"
                style={{ marginLeft: 'auto' }}
                onClick={() => {
                  if (!confirm('删除这部剧本？')) return
                  set('works', (get('works') || []).filter((x) => x.id !== w.id))
                  location.hash = '#/script'
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
