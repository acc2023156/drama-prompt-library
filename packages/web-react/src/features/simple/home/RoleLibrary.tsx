import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/icons'
import { SX_COLORS } from '../../../domain/sx'
import type { SxTemplate } from '../../../domain/types'
import { DATA } from '../../../data'

export type RoleT = SxTemplate & { heat?: string }
export const ROLES = DATA.roles as Record<string, RoleT[]>

/** 角色库位置（pl.libNav）。 */
export interface LibNav {
  lv: 'root' | 'g' | 'wip' | 'role' | string
  g: string
  i: number
  [k: string]: unknown
}

export const G2: Record<string, string> = { male: '男频', female: '女频', cloth: '服装库', hair: '发型库' }
const WIP: Record<string, { ic: IconName; c: string; items: string[] }> = {
  cloth: { ic: 'shirt', c: '#3a6b8f', items: ['现代都市', '古装宫廷', '豪门礼服', '校园制服', '职场正装', '仙侠玄幻'] },
  hair: { ic: 'hair', c: '#8f5a3a', items: ['长直发', '短发利落', '古风发髻', '卷发', '马尾', '寸头'] },
}

/** 旧 drawLib 开头的修正：没有角色数据的频道（服装库、发型库）只能进“整理中”层级。改的是同一个对象的 lv，键顺序不变。 */
export const normalizeNav = (nav: LibNav): LibNav => (nav.lv === 'g' && !ROLES[nav.g] ? { ...nav, lv: 'wip' } : nav)

const css = (o: Record<string, string>) => o as CSSProperties
function Art({ g, i, big }: { g: string; i: number; big?: boolean }) {
  return <span className={`art ${big ? 'big' : ''}`} style={css({ '--c': SX_COLORS[i % 10] })}><Icon name={g === 'male' ? 'user' : 'female'} /></span>
}

export interface RoleLibraryProps {
  nav: LibNav
  onGo(n: Partial<LibNav>): void
  onUse(): void
  onAsset(): void
}

/** 角色库四级导航（旧 drawLib，site-template.html 第 2474–2521 行）：root → 男频/女频 → 角色详情；服装库/发型库为整理中。 */
export function RoleLibrary({ nav, onGo, onUse, onAsset }: RoleLibraryProps) {
  const total = ROLES.male.length + ROLES.female.length
  let body
  if (nav.lv === 'root') {
    body = (
      <>
        <p className="lib-tip">点一格进去看</p>
        <div className="lib-pairs">
          <div className="lib-pair">
            {['male', 'female'].map((g) => (
              <button key={g} className="lt" data-g={g} onClick={() => onGo({ lv: 'g', g })}>
                <span className="mosaic">{ROLES[g].slice(0, 4).map((_, i) => <Art key={i} g={g} i={i} />)}</span>
                <span className="lab"><b>{G2[g]}</b> {ROLES[g].length} 位</span>
              </button>
            ))}
          </div>
          <div className="lib-pair">
            {['cloth', 'hair'].map((g) => (
              <button key={g} className="lt wip" data-w={g} onClick={() => onGo({ lv: 'wip', g })}>
                <span className="art" style={css({ '--c': WIP[g].c })}><Icon name={WIP[g].ic} /></span>
                <span className="lab"><b>{G2[g]}</b> <span className="wipb">整理中</span></span>
              </button>
            ))}
          </div>
        </div>
      </>
    )
  } else if (nav.lv === 'wip') {
    const w = WIP[nav.g]
    body = (
      <>
        <p className="lib-tip">{G2[nav.g]}还在整理，先占好位置，之后会一格一格补上</p>
        <div className="lib-grid">
          {w.items.map((x) => (
            <div key={x} className="lt wip ph"><span className="art empty"><Icon name={w.ic} /></span><span className="lab"><b>{x}</b></span><span className="sub">待补上</span></div>
          ))}
        </div>
      </>
    )
  } else if (nav.lv === 'g') {
    body = (
      <>
        <p className="lib-tip">点一格进去看</p>
        <div className="lib-grid">
          {ROLES[nav.g].map((t, i) => (
            <button key={i} className="lt" data-i={i} onClick={() => onGo({ lv: 'role', i })}>
              <Art g={nav.g} i={i} />
              <span className="lab"><b>{t.type}</b></span>
              <span className="sub">✦ {t.gold}</span>
            </button>
          ))}
        </div>
      </>
    )
  } else {
    const t = ROLES[nav.g][nav.i]
    body = (
      <div className="lib-detail">
        <Art g={nav.g} i={nav.i} big />
        <div className="ld-main">
          <h3>{t.type}</h3>
          <div className="ld-sub">{G2[nav.g]}{t.heat === '有具体剧名' && <> · <span className="tag prod">爆款验证</span></>}</div>
          <div className="kv">
            <span>表面</span><span>{t.surface}</span><span>内心</span><span>{t.hidden}</span><span>金手指</span><span>{t.gold}</span>
            <span>开场</span><span>{t.hook}</span><span>关系</span><span>{t.rel}</span><span>要点</span><span>{t.note}</span>
          </div>
          <div className="tags" style={{ marginTop: 12 }}>{t.genres.split('、').map((x, k) => <span key={k} className="tag">{x}</span>)}</div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="magic" id="libUse" onClick={onUse}><Icon name="sparkle" />用这个角色写剧本</button>
            <button className="btn-o" id="libAsset" onClick={onAsset}><Icon name="board" />做角色设定板</button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="lib-card">
      <div className="lib-head"><h2>角色库（{total} 位）</h2><span>选一个主角，一键产出 10 集短剧剧本</span></div>
      {nav.lv !== 'root' && (
        <div className="lib-crumb">
          <button className="lib-back" id="libBack" onClick={() => onGo({ lv: nav.lv === 'role' ? 'g' : 'root', g: nav.lv === 'wip' ? 'male' : nav.g })}>← 回上一层</button>
          <span>{G2[nav.g]}{nav.lv === 'role' ? ' › ' + ROLES[nav.g][nav.i].type : ''}</span>
        </div>
      )}
      {body}
      <a className="lib-studio" href="#/assets/role-new"><Icon name="plus" />AI 角色工作室（生成原创角色）</a>
    </div>
  )
}
