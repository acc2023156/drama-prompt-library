import { useLayoutEffect } from 'react'
import { BackBar } from '../../components/BackBar'
import { Icon } from '../../components/Icon'
import { TRASH_DAYS, purgeTrash, workType } from '../../domain/works'
import { api } from '../../lib/api'
import { authGet } from '../../lib/auth'
import { get, set, useStored } from '../../lib/storage'
import { toast } from '../../lib/toast'

/** 云端删除（旧写法：已登录才发，忽略失败）。 */
function deleteCloud(ids: string[]) {
  if (authGet()) ids.forEach((id) => api('/works/' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {}))
}

/** 清掉回收站里超过 30 天的作品（旧 purgeTrash，1126）：写回本地，已登录时同步删云端。 */
function purge() {
  const { kept, gone } = purgeTrash(get('works'), Date.now())
  if (!gone.length) return
  set('works', kept)
  deleteCloud(gone.map((w) => w.id))
}

/** 还原或永久删除后写回 works；旧页面随后重画侧栏并重新进入本页（含再次清理过期作品）。 */
function save(ids: string[], restore: boolean) {
  const L = get('works') || []
  if (restore) {
    L.forEach((w) => {
      if (ids.includes(w.id)) {
        delete w.trashed
        w.time = Date.now()
      }
    })
    set('works', L)
  } else {
    set('works', L.filter((w) => !ids.includes(w.id)))
    deleteCloud(ids)
  }
  purge()
}

/** 回收桶（旧 viewTrash，3349）：删除的作品留 30 天，可以还原或永久删除。 */
export function TrashPage() {
  const [works] = useStored('works')
  // 进入页面先清理过期作品；清理前的这次渲染也不显示它们
  useLayoutEffect(purge, [])
  const now = Date.now()
  const cut = now - TRASH_DAYS * 864e5
  const list = (works || []).filter((w) => w.trashed && w.trashed >= cut).sort((a, b) => b.trashed! - a.trashed!)
  const left = (t: number) => Math.max(0, Math.ceil((t + TRASH_DAYS * 864e5 - now) / 864e5))

  return (
    <>
      <BackBar href="#/script" />
      <div className="sec-head" style={{ marginTop: 56 }}>
        <h2>回收桶</h2>
        <span className="meta">
          {list.length} 部 · 删除后保留 {TRASH_DAYS} 天
        </span>
        {list.length ? (
          <button
            className="ui-btn danger"
            id="trEmpty"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              if (confirm(`永久删除回收桶里全部 ${list.length} 部作品？删除后无法复原。`)) save(list.map((w) => w.id), false)
            }}
          >
            清空回收桶
          </button>
        ) : null}
      </div>
      {list.length ? (
        <div className="works">
          {list.map((w) => (
            <div className="acard" key={w.id}>
              <div className="t">
                <Icon name="script" />《{w.title || '未命名'}》
                <span className="ui-tag" style={{ marginLeft: 'auto' }}>
                  剩 {left(w.trashed!)} 天
                </span>
              </div>
              <div className="tags">
                <span className={w.kind === 'simple' ? 'ui-tag simple' : 'ui-tag mode'}>{workType(w)}</span>
              </div>
              <div className="acts">
                <button
                  className="ui-btn primary"
                  data-rs={w.id}
                  onClick={() => {
                    save([w.id], true)
                    toast('已还原')
                  }}
                >
                  <Icon name="back" />
                  还原
                </button>
                <button
                  className="ui-btn danger"
                  data-rm={w.id}
                  onClick={() => {
                    if (confirm('永久删除这部作品？删除后无法复原。')) {
                      save([w.id], false)
                      toast('已永久删除')
                    }
                  }}
                >
                  永久删除
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">回收桶是空的。</div>
      )}
    </>
  )
}
