import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/icons'
import { liveWorks, workHref, workType } from '../domain/works'
import { NAV, chapterOf } from '../lib/content'
import type { NavRoute } from '../lib/nav'
import { refreshRoute } from '../lib/nav'
import { SITE } from '../lib/site'
import { isPro, set, useStored } from '../lib/storage'
import { toast } from '../lib/toast'
import { isMobile, setPanel } from '../lib/ui'
import { ASSET_FN, ASSET_NAV, FUNCS } from './nav-data'
import { funcOf } from './routes'

/** 顶栏、侧栏目录与 PRO 开关：旧 drawNav（site-template.html 第 3212 行）的移植。 */

interface LinkOpt {
  cls?: string
  icon?: IconName
  on?: boolean
  d?: string
  n?: number
  pro?: boolean
}

const Title = ({ t, icon }: { t: string; icon?: IconName }) => (
  <div className="ps-title">
    {icon && <Icon name={icon} />}
    {t}
  </div>
)

const Hr = () => <div className="ps-hr" />

/** 目录标题文字（旧 drawNav 里的 title），顶栏外的“目录”按钮也用它。 */
export function navTitle(route: NavRoute): string {
  const fn = funcOf(route)
  const ch = chapterOf(route.folder || '')
  const F = FUNCS.find((f) => f.k === fn)
  return fn === 'prompts' ? (ch ? ch.label : '目录') : route.view === 'start' || route.view === 'partner' ? '目录' : (F ? F.label : '') + '目录'
}

export function PanelPill({ title }: { title: string }) {
  return (
    <>
      {title} <Icon name="panel" />
    </>
  )
}

export function TopSeg({ route }: { route: NavRoute }) {
  const fn = funcOf(route)
  return (
    <nav className="tb-seg" id="tbSeg">
      {FUNCS.map((f) => (
        <a key={f.k} href={f.href} className={fn === f.k && route.view !== 'start' && route.view !== 'partner' ? 'on' : ''}>
          <Icon name={f.icon} />
          {f.label}
        </a>
      ))}
    </nav>
  )
}

/** PRO 开关：开 = 专业版（完整流程），关 = 标准版（简化流程）；切换后重新渲染当前路由。 */
export function ProSwitch() {
  const [pro] = useStored('pro')
  const on = pro !== false
  return (
    <span className="pro-slot tb-pro">
      <button
        className={`pro ${on ? 'on' : ''}`}
        title={on ? '专业版：完整流程' : '标准版：简单几步出剧本'}
        onClick={() => {
          set('pro', !isPro())
          toast(isPro() ? '已切换到 PRO 专业版' : '已切换到标准版')
          refreshRoute()
        }}
      >
        <b>PRO</b>
        <span className={`sw ${on ? 'on' : ''}`} />
        {on ? null : <em>标准版</em>}
      </button>
    </span>
  )
}

export function SideNav({ route, hash, rev }: { route: NavRoute; hash: string; rev: number }) {
  const [works] = useStored('works')
  const [assets] = useStored('assets')
  const [pro] = useStored('pro')
  const ref = useRef<HTMLElement>(null)

  const cur = route.folder || ''
  const ch = chapterOf(cur)
  const fn = funcOf(route)
  const h = hash || '#/'
  const title = navTitle(route)

  let k = 0
  const A = (href: string, label: string, o: LinkOpt = {}): ReactNode => (
    <a
      key={k++}
      className={`${o.cls || ''} ${(o.on ?? h === href) ? 'on' : ''}`}
      href={href}
      data-pro={o.pro ? '' : undefined}
      onClick={() => {
        if (o.pro) set('pro', true)
        if (isMobile()) setPanel(false)
      }}
    >
      {o.icon && <Icon name={o.icon} />}
      <span>
        {label}
        {o.d && <span className="d">{o.d}</span>}
      </span>
      {o.n != null && <span className="n">{o.n}</span>}
      {o.pro && <span className="ptag">PRO</span>}
    </a>
  )
  const PICK = [<Hr key="pick-hr" />, <Title key="pick-t" t="精选提示词" icon="grid" />]
  const out: ReactNode[] = []

  if (route.vibe) {
    const V = route.vibe
    out.push(<Title key="vibe-t" t="当前作品" />, A('#/script/v/' + V.id + '/outline', '《' + V.title + '》', { cls: 'head fn', icon: 'script', on: false }))
    for (const [tk, l, ic] of [['outline', '各集大纲', 'text'], ['script', '剧情对话', 'pen'], ['assets', '角色资产库', 'user'], ['board', '分镜图', 'play'], ['listing', '上架资料', 'arrowUp']] as const)
      out.push(A('#/script/v/' + V.id + '/' + tk, l, { cls: 'fn sub', icon: ic, on: V.tab === tk }))
    out.push(<Hr key="vibe-hr" />)
  }

  if (fn === 'script') {
    const live = liveWorks(works)
    if (pro !== false && route.view !== 'start' && route.view !== 'partner') {
      out.push(<Title key="pro-t" t="PRO 专业版" />, A('#/script', '我的作品', { cls: 'head fn', icon: 'script', n: live.length }), A('#/script/new', '新增作品', { cls: 'head fn', icon: 'plus', on: route.sub === 'new' && !route.wid }))
      if (live.length) {
        out.push(<Title key="works-t" t="作品" />)
        for (const w of live) out.push(A(workHref(w), '《' + (w.title || '未命名') + '》', { on: !route.vibe && (route.wid === w.id || route.sid === w.id), d: workType(w) }))
      }
    } else {
      out.push(<Title key="std-t" t="标准版" />, A(route.view === 'start' ? '#/' : '#/script', '人物即剧本', { cls: 'head fn', icon: 'sparkle', on: !route.sub, d: '选主角，一键产出 10 集' }))
      out.push(A('#/script/new', '新增作品', { cls: 'head fn', icon: 'plus', pro: true, on: false }))
      // 同一份“我的作品”：标准版、氛围写作、五步表单都在这里；非标准版的点了会切到 PRO
      if (live.length) {
        out.push(<Title key="mine-t" t="我的作品" />)
        for (const w of live) {
          const simple = w.kind === 'simple'
          out.push(A(workHref(w), '《' + (w.title || '未命名') + '》', { on: route.sid === w.id, d: simple ? `${workType(w)} · ${w.sx?.name}` : workType(w), ...(simple ? {} : { pro: true }) }))
        }
      }
    }
    out.push(...PICK, ...NAV.slice(0, 3).map((n) => A('#/f/' + n.key, n.label, { cls: 'fn', icon: n.icon as IconName, n: SITE.inFolder(n.key).length })))
  } else if (fn === 'assets') {
    const mine = assets || []
    out.push(A('#/assets', '资产首页', { cls: 'head fn', icon: 'assets', on: !route.fn && !route.vibe }))
    for (const m of ASSET_NAV) {
      out.push(<Title key={'am-' + m.key} t={m.title} />)
      for (const i of m.items) out.push(A('#/assets/' + i.id, i.label, { cls: 'fn', icon: i.icon, on: route.fn === i.id && route.idx == null }))
    }
    if (mine.length) {
      out.push(<Title key="mine-assets" t="我的资产" />)
      mine.forEach((x, i) => out.push(A(`#/assets/${x.fn}?i=${i}`, x.name || '未命名', { cls: 'fn', icon: ASSET_FN[x.fn]?.menu === 'scene' ? 'mount' : 'user', on: route.fn === x.fn && route.idx === i, d: ASSET_FN[x.fn]?.label || '' })))
    }
    out.push(...PICK, A('#/f/06-video/styles', '画风块', { cls: 'fn', icon: 'film' }), A('#/f/archive/05-design', '角色与场景设定（归档）', { cls: 'fn', icon: 'box' }))
  } else if (fn === 'storyboard') {
    out.push(A('#/storyboard', '分镜首页', { cls: 'head fn', icon: 'play', on: route.vibe ? false : undefined }), A('#/assembler', '6.0 组装器', { cls: 'head fn', icon: 'wand', d: '把剧本组装成视频提示词' }))
    const v = NAV.find((n) => n.key === '06-video')!
    out.push(...PICK, ...v.subs!.map(([sk, l]) => A('#/f/' + sk, l, { cls: 'fn', icon: 'film', n: SITE.inFolder(sk).length })))
  } else {
    out.push(A('#/prompts', '全部提示词', { cls: 'head fn', icon: 'grid', on: route.view === 'home', n: SITE.entries.length }), <Title key="flow-t" t="按流程" />)
    for (const n of NAV) {
      out.push(A('#/f/' + n.key, n.label, { cls: 'head fn', icon: n.icon as IconName, on: cur === n.key && route.view === 'list', n: SITE.inFolder(n.key).length }))
      if (ch !== n) continue
      for (const [sk, l] of n.subs || [[n.key, '']]) {
        const list = SITE.inFolder(sk)
        if (!list.length) continue
        if (l) out.push(A('#/f/' + sk, l, { cls: 'head sub', on: cur === sk && route.view === 'list', n: list.length }))
        for (const e of list)
          out.push(
            <a
              key={k++}
              className={`sub ${route.id === e.id ? 'on' : ''}`}
              href={'#/e/' + e.id}
              onClick={() => {
                if (isMobile()) setPanel(false)
              }}
            >
              <span className="i">{e.id}</span>
              <span>{e.title}</span>
            </a>,
          )
      }
    }
    out.push(<Hr key="tools-hr" />, <Title key="tools-t" t="工具与资料" />, A('#/assembler', '6.0 组装器', { cls: 'fn', icon: 'wand' }), A('#/changelog', '更新记录', { cls: 'fn', icon: 'clock' }))
  }

  // 每次重画后把高亮项滚进可视区（旧 drawNav 末尾）
  useLayoutEffect(() => {
    ref.current?.querySelector('a.on')?.scrollIntoView({ block: 'nearest' })
  }, [rev, route])

  return (
    <aside className="pside" id="pside" ref={ref}>
      <div className="ps-row">
        <button className="pill" id="psClose" title="收起" onClick={() => setPanel(false)}>
          <PanelPill title={title} />
        </button>
      </div>
      {out}
    </aside>
  )
}
