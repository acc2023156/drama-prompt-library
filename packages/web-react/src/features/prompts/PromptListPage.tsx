import { Icon } from '../../components/Icon'
import { DATA } from '../../data'
import { filtered } from '../../domain/prompts-filter'
import { FUNCS } from '../../app/nav-data'
import { NAV } from '../../lib/content'
import { SITE } from '../../lib/site'
import { set } from '../../lib/storage'
import { type RoleTypes, funcHits } from './func-index'
import { setPromptFilter, usePromptFilter } from './filter-state'
import { Cards, Grouped } from './parts'

export interface PromptListPageProps {
  /** 首页模式（#/prompts，旧 view:'home'）或某目录（#/f/:folder） */
  folder?: string
  home: boolean
}

const LICENSES: [string, string][] = [['all', '全部来源'], ['direct', '可直接用'], ['ref', '仅参考'], ['int', '内部']]

/** 更新记录里的“版本：…”（旧 versionLine）。 */
const versionLine = (): string => {
  const m = DATA.changelog.match(/版本：([^｜\n]+)/)
  return m ? m[1].trim() : ''
}

/** 搜索框与筛选条：旧 composer + bindComposer。条件存在模块级状态里，跨路由保留。 */
function Composer({ compact }: { compact?: boolean }) {
  const f = usePromptFilter()
  return (
    <div className="composer" style={compact ? { margin: 0, maxWidth: 'none' } : undefined}>
      <div className="top">
        Prompt Library
        <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>{versionLine()}</span>
      </div>
      <label className="search">
        <Icon name="search" />
        <input id="q" placeholder="搜索，如：剧本、角色、男主、女主、分镜" value={f.q} onChange={(ev) => setPromptFilter({ q: ev.target.value })} />
      </label>
      <div className="row">
        <span className="seg" id="lic">
          {LICENSES.map(([v, label]) => (
            <button key={v} data-v={v} className={v === f.lic ? 'on' : undefined} onClick={() => setPromptFilter({ lic: v })}>
              {label}
            </button>
          ))}
        </span>
        <button className={f.prod ? 'chip-btn on' : 'chip-btn'} id="prod" onClick={() => setPromptFilter({ prod: !f.prod })}>
          <Icon name="check" />
          只看已用于生产
        </button>
      </div>
    </div>
  )
}

/** 搜索命中的相关功能（旧 drawFuncHits）；点击带 pick 的项先写 pro、sxPick，再由链接跳转。 */
function FuncHits({ q }: { q: string }) {
  const hits = funcHits(DATA.roles as RoleTypes, q)
  if (!hits.length) return null
  const F = Object.fromEntries(FUNCS.map((f) => [f.k, f]))
  const show = hits.slice(0, 9)
  return (
    <>
      <div className="sec-head" style={{ margin: '30px 0 12px' }}>
        <h2 style={{ fontSize: 18 }}>相关功能</h2>
        <span className="meta">{`${hits.length} 项${hits.length > show.length ? ' · 显示前 ' + show.length + ' 项' : ''}`}</span>
      </div>
      <div className="fhits">
        {show.map((x, k) => (
          <a
            key={k}
            className="fhit"
            href={x.href}
            data-k={k}
            onClick={() => {
              const p = x.pick
              if (!p) return
              set('pro', p.pro)
              if (p.g) set('sxPick', { g: p.g, idx: p.idx ?? null, name: '', title: '', q: '' })
            }}
          >
            <span className="ft">
              <Icon name={F[x.fn].icon} />
              {F[x.fn].label}
            </span>
            <b>{x.title}</b>
            <span className="fd">{x.desc}</span>
          </a>
        ))}
      </div>
      <div className="sec-head" style={{ margin: '30px 0 0' }}>
        <h2 style={{ fontSize: 18 }}>提示词</h2>
      </div>
    </>
  )
}

/** 提示词首页与目录列表：旧 viewList（site-template.html 第 3467 行）。 */
export function PromptListPage({ folder, home }: PromptListPageProps) {
  const f = usePromptFilter()
  const dir = folder as string
  // 旧 GROUP_LABEL 是普通对象，#/f/constructor 这类键会取到原型上的值并转成字符串显示，这里保持一致
  const label = home ? '全部提示词' : String(SITE.groupLabel[dir] || NAV.find((n) => n.key === dir)?.label || dir)
  const base = home ? SITE.entries : SITE.inFolder(dir)
  const list = filtered(base, f)
  const count = <span className="meta" id="cnt">{`${list.length} / ${base.length} 条`}</span>
  return (
    <>
      {home ? (
        <section className="hero">
          <svg className="rings" viewBox="0 0 200 200" fill="none" stroke="#ff3355" strokeWidth=".4">
            <circle cx="100" cy="100" r="96" />
            <circle cx="100" cy="100" r="80" />
            <circle cx="100" cy="100" r="58" strokeDasharray="2 3" />
            <path d="M100 4 183 148H17Z" />
            <path d="M100 196 17 52h166Z" />
          </svg>
          <h1>
            短剧提示词
            <br />
            从灵感到成片的模块库
          </h1>
          <Composer />
        </section>
      ) : (
        <>
          <div className="sec-head" style={{ marginTop: 36 }}>
            <h2>{label}</h2>
            {count}
          </div>
          <Composer compact />
        </>
      )}
      {home ? (
        <div className="sec-head">
          <h2>全部提示词</h2>
          {count}
          <span className="sp" />
          <a className="btn-white" href="#/assembler">
            <Icon name="wand" />
            组装视频提示词
          </a>
        </div>
      ) : (
        <div style={{ height: 18 }} />
      )}
      <div id="fhits">{home && <FuncHits q={f.q} />}</div>
      <div id="cards">{home && !f.q && f.lic === 'all' && !f.prod ? <Grouped list={list} /> : <Cards list={list} />}</div>
    </>
  )
}
