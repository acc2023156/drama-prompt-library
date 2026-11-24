import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from '../../../components/Icon'
import { StepNum } from '../../../components/StepNum'
import { SX_COLORS } from '../../../domain/sx'
import { liveWorks, workHref, workType } from '../../../domain/works'
import { type StorageSchema, get, set } from '../../../lib/storage'
import { toast } from '../../../lib/toast'
import { PartnerBanner } from '../../partner/PartnerBanner'
import { DEFAULT_PICK, type Pick, openHot, produce, randomName, storeRolePick } from './actions'
import { loadHot, useHot } from './hot'
import { Orbit } from './Orbit'
import type { Board, Range, RoleRow, StarRow } from './orbit-data'
import { G2, type LibNav, ROLES, RoleLibrary, normalizeNav } from './RoleLibrary'

/**
 * 标准版首页“人物即剧本”（旧 viewScriptSimple，site-template.html 第 2302–2524 行）。
 * 旧 openRole 会整页重画（闭包状态全部重置），这里用 key 重新挂载 Home 达到同样效果。
 */
export function SimpleHomePage() {
  const [rev, setRev] = useState(0)
  const reload = (scrollTo: string) => {
    flushSync(() => setRev((n) => n + 1))
    requestAnimationFrame(() => document.getElementById(scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  return <Home key={rev} onReload={reload} />
}

function Home({ onReload }: { onReload(scrollTo: string): void }) {
  const [st, setSt] = useState<Pick>(() => (get('sxPick') as Pick | null) || DEFAULT_PICK())
  const [allWorks] = useState(() => liveWorks(get('works')))
  const [mode, setModeState] = useState<string>(() => get('homeMode') || 'create')
  const [nav, setNav] = useState<LibNav>(() => Object.assign({ lv: 'root', g: 'male', i: 0 }, get('libNav') || {}) as LibNav)
  const [libDrawn, setLibDrawn] = useState(mode === 'lib')
  const [board, setBoard] = useState<Board>(mode === 'lib' ? 'role' : 'hot')
  const [range, setRange] = useState<Range>('24h')
  const [hotCat, setHotCat] = useState('热点')
  const [drawRev, setDrawRev] = useState(0)
  const hot = useHot()
  const rolesRef = useRef<HTMLDivElement>(null)

  const redraw = () => setDrawRev((n) => n + 1)
  // 旧页面在 /hot 返回后重画七星
  const prevHot = useRef(hot)
  useEffect(() => {
    if (prevHot.current === hot) return
    prevHot.current = hot
    redraw()
  }, [hot])

  // m 可能是存储里的其他值（旧页面原样写回），所以不收窄成 'lib' | 'create'
  function setMode(m: string) {
    setModeState(m)
    set('homeMode', m as 'lib' | 'create')
    setBoard(m === 'lib' ? 'role' : 'hot')
    redraw()
    loadHot()
    if (m === 'lib') setLibDrawn(true)
  }
  // 旧页面渲染末尾的 setMode(mode)：写回 homeMode、按需请求 /hot；只在挂载时执行
  useEffect(() => {
    set('homeMode', mode as 'lib' | 'create')
    loadHot()
  }, [])

  const save = (next: Pick) => {
    setSt(next)
    set('sxPick', next)
  }
  const list = ROLES[st.g]
  const t = st.idx != null ? list[st.idx] : null

  function openRole(d: RoleRow, write: boolean) {
    storeRolePick(d[1], d[2], write)
    onReload(write ? 'roles' : 'mLib')
  }
  const onStar = (d: StarRow) => (board === 'hot' ? openHot(d, hot) : openRole(d as RoleRow, false))

  function go(n: Partial<LibNav>) {
    const next = { ...normalizeNav(nav), ...n } as LibNav
    set('libNav', next as StorageSchema['libNav'])
    setNav(next)
  }

  function onMagic() {
    if (!t) {
      // 还没选主角：提示并带到角色卡片
      toast('先选一个主角')
      const r = rolesRef.current!
      r.scrollIntoView({ behavior: 'smooth', block: 'start' })
      r.classList.remove('flash')
      void r.offsetWidth
      r.classList.add('flash')
      setTimeout(() => r.classList.remove('flash'), 2100)
      return
    }
    // 名字为空时随机取一个（旧 randomize 同时填进 dock，但不存 sxPick）
    const cur = st.name.trim() ? st : { ...st, ...randomName(st.g) }
    if (cur !== st) flushSync(() => setSt(cur))
    location.hash = produce(cur, t)
  }

  function onUse() {
    const n = normalizeNav(nav)
    let next: Pick = { ...st }
    if (next.g !== n.g) next = { ...next, g: n.g as Pick['g'], name: '', title: '' }
    next.idx = n.i
    if (!next.name) next = { ...next, ...randomName(next.g) }
    flushSync(() => {
      save(next)
      setMode('create')
    })
    const r = rolesRef.current!.querySelector('.role.on')
    if (r) r.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // 文案同旧页面；直角引号写成转义序列，输出逐字节相同
    toast('已选好主角，按\u300c一键产出剧本\u300d')
  }

  function onAsset() {
    const n = normalizeNav(nav), r = ROLES[n.g][n.i]
    set('assetPick', { fn: 'role-board', name: r.type, profile: `${G2[n.g]}主角。表面：${r.surface}；内心：${r.hidden}；金手指：${r.gold}；关系：${r.rel}` })
    location.hash = '#/assets/role-board'
  }

  const q = st.q.trim()
  const shown = list.map((r, i) => ({ r, i })).filter(({ r }) => !q || Object.values(r).join(' ').includes(q))

  return (
    <>
      <div className="sx-top">
        <section className="sx-hero">
          <h1><span className="h1w">人物即剧本<a className="pt-tag" href="#/partner"><Icon name="sparkle" />AI短剧伙伴计划</a></span></h1>
          <div className="modeseg" id="modeSeg">
            {(['lib', 'create'] as const).map((m) => (
              <button key={m} data-m={m} className={m === mode ? 'on' : undefined} onClick={() => setMode(m)}>{m === 'lib' ? '角色库' : '创作平台'}</button>
            ))}
          </div>
        </section>
        <PartnerBanner />
      </div>
      <Orbit
        board={board}
        range={range}
        hotCat={hotCat}
        hot={hot}
        drawRev={drawRev}
        onRange={(r) => { setRange(r); redraw() }}
        onHotCat={(k) => { setHotCat(k); setBoard('hot'); redraw() }}
        onStar={onStar}
        onRole={openRole}
      />
      <section className="lib" id="mLib" style={mode === 'lib' ? undefined : { display: 'none' }}>
        {libDrawn && <RoleLibrary nav={normalizeNav(nav)} onGo={go} onUse={onUse} onAsset={onAsset} />}
      </section>
      <div id="mCreate" style={mode === 'create' ? undefined : { display: 'none' }}>
        <div id="heroCreate" className="create-intro" style={mode === 'create' ? undefined : { display: 'none' }}>
          <p>选一个主角，一键产出 10 集短剧剧本</p>
          <div className="sx-steps" id="sxSteps">
            {(['选频道', '选主角', '一键产出'] as const).map((l, i) => {
              const d = [1, t ? 1 : 0, 0][i], c = d ? 'done' : i === (t ? 2 : 1) ? 'on' : ''
              return <span key={l} className={c}><StepNum n={i + 1} state={c} />{l}</span>
            })}
          </div>
          <div className="locks"><span><Icon name="lock" />10 集</span><span><Icon name="lock" />每集 1 分钟</span><span><Icon name="lock" />简体中文</span><span><Icon name="lock" />一季完结</span></div>
        </div>
        <div className="sx-bar">
          <div className="gseg" id="gseg">
            {(['male', 'female'] as const).map((g) => (
              <button key={g} data-g={g} className={g === st.g ? 'on' : undefined} onClick={() => { if (st.g !== g) save({ ...st, g, idx: null, name: '', title: '' }) }}>{g === 'male' ? '男频' : '女频'}</button>
            ))}
          </div>
          <label className="search2"><Icon name="search" /><input id="sxq" placeholder="搜角色、金手指、流派，如“系统”“真假千金”" value={st.q} onChange={(e) => save({ ...st, q: e.target.value })} /></label>
        </div>
        <div className="roles" id="roles" ref={rolesRef}>
          {shown.length ? shown.map(({ r, i }) => (
            <button key={i} className={`role ${st.idx === i ? 'on' : ''}`} data-i={i} onClick={() => save(st.name ? { ...st, idx: i } : { ...st, idx: i, ...randomName(st.g) })}>
              <span className="ok"><Icon name="check" /></span>
              <span className="av" style={{ background: `linear-gradient(160deg,${SX_COLORS[i % 10]},#1a1a1d)` }}><Icon name={st.g === 'male' ? 'user' : 'female'} /></span>
              <h3>{r.type}</h3>
              <span className="s">{r.surface}</span>
              <span className="gold">✦ {r.gold}</span>
              <span className="tags">{r.genres.split('、').slice(0, 4).map((x, k) => <span key={k} className="tag">{x}</span>)}{r.heat === '有具体剧名' && <span className="tag prod">爆款验证</span>}</span>
            </button>
          )) : <div className="empty" style={{ gridColumn: '1/-1' }}>没有符合的角色</div>}
        </div>
        {allWorks.length > 0 && (
          <section className="minework">
            <div className="sec-head" style={{ margin: '0 0 14px' }}><h2 style={{ fontSize: 20 }}>我的作品</h2><span className="meta">{allWorks.length} 部</span></div>
            <div className="works">
              {allWorks.map((w, k) => (
                <a key={k} className="acard" href={workHref(w)} data-pro={w.kind === 'simple' ? undefined : '1'} style={{ textDecoration: 'none' }}>
                  <div className="t"><Icon name={w.kind === 'simple' ? (w.sx!.g === 'male' ? 'user' : 'female') : 'script'} />《{w.title || '未命名'}》<span className={`ui-tag ${w.kind === 'simple' ? 'simple' : 'mode'}`} style={{ marginLeft: 'auto' }}>{workType(w)}</span></div>
                  <div className="s">{w.kind === 'simple' ? `${w.sx!.name} · ${w.sx!.role.type}` : (w.W && w.W.pitch) || ''}</div>
                </a>
              ))}
            </div>
          </section>
        )}
        <div className="dock">
          <div className="who"><small>主角</small><b id="who">{t ? t.type : '还没选'}</b></div>
          <input
            className="in"
            id="sxName"
            placeholder="主角名字"
            value={st.name}
            onChange={(e) => {
              const old = st.name, name = e.target.value
              save(old && st.title.includes(old) ? { ...st, name, title: st.title.split(old).join(name || old) } : { ...st, name })
            }}
          />
          <input className="in" id="sxTitle" placeholder="剧名" value={st.title} onChange={(e) => save({ ...st, title: e.target.value })} />
          <button className="dice" id="dice" title="换一组名字" onClick={() => save({ ...st, ...randomName(st.g) })}><Icon name="dice" /></button>
          <button className={`magic${t ? '' : ' idle'}`} id="magic" onClick={onMagic}><Icon name="sparkle" />一键产出剧本</button>
        </div>
      </div>
    </>
  )
}
