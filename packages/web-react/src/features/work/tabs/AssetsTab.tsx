import { type CSSProperties, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { SX_COLORS } from '../../../domain/sx'
import type { Work, WzSettings } from '../../../domain/types'
import type { VibeSx } from '../../../domain/vibe'
import { set } from '../../../lib/storage'
import { assetItems } from '../model'

/** 角色资产库分页：角色 / 场景两组卡片，点卡片带着全部条目进资产库做设定板（写 pl.assetSeed 与 pl.assetPick）。 */
export function AssetsTab({ w, s, W, eps }: { w: Work; s: VibeSx; W: WzSettings; eps: string[] }) {
  const [akind, setAkind] = useState<'role' | 'scene'>('role')
  const items = assetItems(s, W, eps)
  const keyed = items.map((x, k) => ({ ...x, k }))
  const roles = keyed.filter((x) => x.fn === 'role-board'), scenes = keyed.filter((x) => x.fn !== 'role-board')
  const gOf = (x: { label: string }) => (x.label.startsWith('女') ? 'female' : x.label.startsWith('男') ? 'male' : s.g)
  const list = akind === 'role' ? roles : scenes
  const pick = (k: number) => {
    set('assetSeed', { wid: w.id, title: w.title, items: items as unknown as Record<string, unknown>[] })
    set('assetPick', { ...items[k], k, wid: w.id })
    location.hash = '#/assets/' + items[k].fn
  }
  return (
    <>
      <div className="vak">
        <button className={akind === 'role' ? 'on' : ''} data-ak="role" onClick={() => setAkind('role')}>
          角色 {roles.length}
        </button>
        <button className={akind === 'scene' ? 'on' : ''} data-ak="scene" onClick={() => setAkind('scene')}>
          场景 {scenes.length}
        </button>
      </div>
      <div className="vgrid">
        {list.map((x) => {
          const named = x.fn === 'role-board' && x.name !== '对手'
          return (
            <button className="vp" data-as={x.k} key={x.k} onClick={() => pick(x.k)}>
              <span className="vp-img">
                <span className="vtile" style={{ '--c': SX_COLORS[x.k % 10] } as CSSProperties}>
                  <Icon name={x.fn === 'role-board' ? (gOf(x) === 'female' ? 'female' : 'user') : 'mount'} />
                </span>
                {x.k === 0 && <i className="vp-tag">主角</i>}
                <em className="vp-go">做设定板</em>
              </span>
              <b>{named ? x.name : x.label}</b>
              <small>{named ? x.label : x.sub || ''}</small>
            </button>
          )
        })}
      </div>
    </>
  )
}
