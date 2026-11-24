import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { TRASH_DAYS, liveWorks, workHref, workType } from '../../domain/works'
import { wzEps, wzMins } from '../../domain/wz'
import type { Work, WzSettings } from '../../domain/types'
import { get, set } from '../../lib/storage'
import { toast } from '../../lib/toast'
import { Chat } from './Chat'
import { useClosePopsOnDocumentClick } from './pops'

/**
 * PRO 剧本首页（旧 viewScriptHome，site-template.html 第 1539–1569 行）：对话框 + 作品网格 + 批量移到回收桶。
 * 旧页面移完后整页重画（对话框状态、选择状态全部重来），这里用 key 重新挂载达到同样效果。
 * 旧页面第 1553 行给 [data-cp] 绑了复制 wzPrompt，但页面里没有 data-cp 元素，属于不可达代码，未迁移。
 */
export function ScriptHomePage() {
  const [rev, setRev] = useState(0)
  useClosePopsOnDocumentClick()
  return <Home key={rev} onReload={() => setRev((n) => n + 1)} />
}

const when = (t: number) => new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function Home({ onReload }: { onReload(): void }) {
  const [works] = useState(() => liveWorks(get('works')))
  const [trashN] = useState(() => (get('works') || []).filter((w) => w.trashed).length)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(() => new Set())

  function moveToTrash() {
    if (!picked.size) return
    if (!confirm(`把 ${picked.size} 部作品移到回收桶？\n${TRASH_DAYS} 天内可以在回收桶还原，之后会永久删除。`)) return
    const ids = new Set([...picked].map((k) => works[k].id)), list: Work[] = get('works') || [], now = Date.now()
    list.forEach((w) => {
      if (ids.has(w.id)) {
        w.trashed = now
        w.time = now
      }
    })
    set('works', list)
    toast(`已移到回收桶（${ids.size} 部）`)
    onReload()
  }

  return (
    <>
      <Chat />
      <div className="wz-head" style={{ marginTop: 34 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>剧本</h1>
          <div className="row hd-acts">
            {trashN > 0 && <a className="ui-btn ghost" href="#/trash"><Icon name="trash" />{`回收桶 ${trashN}`}</a>}
            <a className="btn-white" href="#/script/new"><Icon name="plus" />新增作品</a>
            {works.length > 0 && (
              <button className="ui-btn secondary" id="pickBtn" onClick={() => { setPicking(!picking); setPicked(new Set()) }}><Icon name="check" />删除作品</button>
            )}
          </div>
        </div>
      </div>
      {works.length ? (
        <div className={picking ? 'works picking' : 'works'} id="workGrid">
          {works.map((w, k) => (
            <div
              key={k}
              className={picked.has(k) ? 'acard on' : 'acard'}
              data-wk={k}
              onClickCapture={(e) => {
                // 选择模式下点卡片任意处（含“打开”按钮）只切换选中，不跳转
                if (!picking) return
                e.preventDefault()
                e.stopPropagation()
                const next = new Set(picked)
                if (next.has(k)) next.delete(k)
                else next.add(k)
                setPicked(next)
              }}
            >
              <i className="pick-box"><Icon name="check" /></i>
              <div className="t"><Icon name="script" />《{w.title || '未命名'}》<span className={`ui-tag ${w.kind === 'simple' ? 'simple' : 'mode'}`} style={{ marginLeft: 'auto' }}>{workType(w)}</span></div>
              <div className="tags">{[w.W.aud, w.W.pair, w.W.genre].filter(Boolean).map((t, i) => <span key={i} className="ui-tag">{t}</span>)}</div>
              <div className="s">{`${w.W.pitch || '（未填卖点）'}\n${wzEps(w.W as WzSettings)} 集 × ${wzMins(w.W as WzSettings)} 分钟 · ${when(w.time as number)}`}</div>
              <div className="acts">
                <a className="ui-btn primary" href={workHref(w)}><Icon name={w.kind === 'vibe' ? 'user' : 'script'} />{w.kind === 'vibe' ? '角色与剧情' : '打开'}</a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">还没有作品。点右上角{'「'}新增作品{'」'}开始。<br /><span style={{ fontSize: 12 }}>作品只保存在这台电脑的浏览器里。</span></div>
      )}
      <div className={picking ? 'pick-bar open' : 'pick-bar'}>
        <span>已选 <b>{picked.size}</b> 部</span>
        <button className="ui-btn secondary" id="pkAll" onClick={() => setPicked(new Set(works.map((_, k) => k)))}>全选</button>
        <button className="ui-btn secondary" id="pkCancel" onClick={() => { setPicking(false); setPicked(new Set()) }}>取消</button>
        <button className="ui-btn primary danger-fill" id="pkGo" disabled={!picked.size} onClick={moveToTrash}><Icon name="trash" />移到回收桶</button>
      </div>
    </>
  )
}
