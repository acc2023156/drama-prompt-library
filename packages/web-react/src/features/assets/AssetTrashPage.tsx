import { useLayoutEffect } from 'react'
import { BackBar } from '../../components/BackBar'
import { Icon } from '../../components/Icon'
import { purgeAssetTrash } from '../../domain/asset-trash'
import { TRASH_DAYS } from '../../domain/works'
import { type StorageSchema, get, set, useStored } from '../../lib/storage'
import { toast } from '../../lib/toast'
import { fnOf } from './seed'
import { purgeStoredAssetTrash } from './trash-store'

type Trashed = StorageSchema['assetsTrash'][number]

/** 写回回收桶；旧页面随后重画侧栏并重新进入本页（含再次清理过期资产）。 */
function done(keep: Trashed[]) {
  set('assetsTrash', keep)
  purgeStoredAssetTrash()
}

/** 资产回收桶（旧 viewAssetTrash，site-template.html 第 3374 行）：从“我的资产”移出的资产留 30 天，可以还原或永久删除。 */
export function AssetTrashPage() {
  const [stored] = useStored('assetsTrash')
  // 进入页面先清理过期资产；清理前的这次渲染也不显示它们
  useLayoutEffect(purgeStoredAssetTrash, [])
  const now = Date.now()
  const list = purgeAssetTrash(stored, now).kept
  const left = (t: number) => Math.max(0, Math.ceil((t + TRASH_DAYS * 864e5 - now) / 864e5))

  return (
    <>
      <BackBar href="#/assets" />
      <div className="sec-head" style={{ marginTop: 56 }}>
        <h2>回收桶</h2>
        <span className="meta">
          {list.length} 个 · 删除后保留 {TRASH_DAYS} 天
        </span>
        {list.length ? (
          <button
            className="ui-btn danger"
            id="trEmpty"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              if (confirm(`永久删除回收桶里全部 ${list.length} 个资产？删除后无法复原。`)) done([])
            }}
          >
            清空回收桶
          </button>
        ) : null}
      </div>
      {list.length ? (
        <div className="grid">
          {list.map((a, k) => (
            <div className="acard" key={k}>
              <div className="t">
                <Icon name={fnOf(a.fn)?.menu.key === 'scene' ? 'mount' : 'user'} />
                {String(a.name || '未命名')}
                <span className="ui-tag" style={{ marginLeft: 'auto' }}>
                  剩 {left(a.trashed)} 天
                </span>
              </div>
              <div className="tags">
                <span className="ui-tag mode">{fnOf(a.fn)?.label || ''}</span>
              </div>
              <div className="acts">
                <button
                  className="ui-btn primary"
                  data-rs={k}
                  onClick={() => {
                    // 还原到“我的资产”末尾，去掉 trashed
                    const { trashed: _, ...asset } = list[k]
                    set('assets', [...(get('assets') || []), asset])
                    done(list.filter((_, i) => i !== k))
                    toast('已还原')
                  }}
                >
                  <Icon name="back" />
                  还原
                </button>
                <button
                  className="ui-btn danger"
                  data-rm={k}
                  onClick={() => {
                    if (confirm('永久删除这个资产？删除后无法复原。')) {
                      done(list.filter((_, i) => i !== k))
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
