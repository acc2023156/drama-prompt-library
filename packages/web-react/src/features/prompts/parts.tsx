import { Fragment } from 'react'
import { type Entry, DATA } from '../../data'
import { licClass, usage } from '../../domain/library'

/** 提示词标签：旧 tagsHtml（site-template.html 第 1146 行）。full 为详情页写法（状态不截断）。 */
export function Tags({ e, full }: { e: Entry; full?: boolean }) {
  return (
    <>
      {e.status && <span className="tag prod">{full ? e.status : e.status.includes('已用于生产') ? '已用于生产' : e.status.slice(0, 10)}</span>}
      <span className={`tag ${licClass(e.license)}`.trim()}>{e.license}</span>
      {e.patches && <span className="tag patch">{`补 6.0【${e.patches.join('】【')}】`}</span>}
      {e.tool && <span className="tag tool">{`适用 ${e.tool}`}</span>}
    </>
  )
}

/** 提示词卡片网格：旧 cardsHtml。 */
export function Cards({ list }: { list: Entry[] }) {
  if (!list.length) return <div className="empty">没有符合条件的提示词</div>
  return (
    <div className="grid">
      {list.map((e) => (
        <a key={e.id} className="card" href={'#/e/' + e.id} style={{ textDecoration: 'none' }}>
          <span className="id">{e.id}</span>
          <h3>{e.title}</h3>
          <div className="desc">{usage(e.body)}</div>
          <div className="tags">
            <Tags e={e} />
          </div>
        </a>
      ))}
    </div>
  )
}

/** 首页无筛选时按目录分组：旧 grouped。 */
export function Grouped({ list }: { list: Entry[] }) {
  return (
    <>
      {DATA.groups.map((g) => {
        const l = list.filter((e) => e.folder === g.key)
        if (!l.length) return null
        return (
          <Fragment key={g.key}>
            <div className="sec-head" style={{ margin: '30px 0 12px' }}>
              <h2 style={{ fontSize: 18 }}>{g.label}</h2>
              <span className="meta">{l.length} 条</span>
            </div>
            <Cards list={l} />
          </Fragment>
        )
      })}
    </>
  )
}
