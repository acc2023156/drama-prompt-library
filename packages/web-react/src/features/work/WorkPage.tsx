import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { vibeSx } from '../../domain/vibe'
import type { Work } from '../../domain/types'
import { replaceStateHash, setNavRoute } from '../../lib/nav'
import { get, set, type StorageSchema } from '../../lib/storage'
import { enterWork, getState, redoEpisode, resumeWriting, retryWork, showDraft, subscribe, type WorkPhase } from '../writing'
import { hashTab, TAB_FN } from './model'
import { ReadyView } from './ReadyView'
import { FailView, LoginGate, WaitView } from './StatusViews'

export interface WorkPageProps {
  wid: string
  /** outline / script / assets / board / listing；地址里没有时为 undefined */
  vtab?: string
}

interface View {
  phase: WorkPhase
  /** 进入时从 pl.works 读到的作品（同旧页面闭包里的 w）；作品不存在时为 null */
  w: Work | null
  tab: string
  epoch: number
}

/**
 * 氛围写作作品页（旧 viewVibeScript，快照第 2963–3136 行）。
 * 每次“进入”= 旧页面调一次 viewVibeScript：写 pl.lastVibe、补主角名与种子，交给写作引擎判断状态（等待 / 登录 / 失败 / 作品），
 * 再读一次作品作为本次显示的数据。写作引擎每次刷新（旧 yqRefresh）都重新进入；卸载时不停止写作，回来时由 enterWork 接着写。
 */
export function WorkPage({ wid, vtab }: WorkPageProps) {
  const [v, setV] = useState<View | null>(null)
  const alive = useRef(true)

  const enter = useCallback(
    (tab0: string | undefined, act?: () => WorkPhase) => {
      const list = get('works') || []
      const w = list.find((x) => x.id === wid)
      if (!w) {
        setV((p) => ({ phase: 'missing', w: null, tab: '', epoch: (p ? p.epoch : 0) + 1 }))
        return
      }
      set('lastVibe', w.id)
      if (!w.vname || !w.seed) {
        const s0 = vibeSx(w)
        w.vname = s0.name
        w.seed = w.seed || Math.floor(Math.random() * 1e9) + 1
        set('works', list)
      }
      const tab = tab0 || get('vibeTab') || 'outline'
      const phase = act ? act() : enterWork(wid)
      const cur = (get('works') || []).find((x) => x.id === wid) || null
      setV((p) => ({ phase: cur ? phase : 'missing', w: cur, tab, epoch: (p ? p.epoch : 0) + 1 }))
    },
    [wid],
  )

  useEffect(() => {
    alive.current = true
    enter(vtab)
    return () => {
      alive.current = false
    }
  }, [enter, vtab])

  // 写作进度：引擎每次 refresh 等同旧 yqRefresh，按地址栏里的分页重新进入
  const st = useSyncExternalStore(
    useCallback((fn: () => void) => subscribe(wid, fn), [wid]),
    () => getState(wid),
  )
  const seen = useRef(st.refresh)
  useEffect(() => {
    if (st.refresh === seen.current) return
    seen.current = st.refresh
    const h = hashTab(wid)
    if (h) enter(h.tab)
  }, [st.refresh, enter, wid])

  // 侧栏进入“当前作品”上下文；作品分页还要记住分页并改地址栏（不新增历史、不重画）
  useEffect(() => {
    if (!v || !v.w || v.phase === 'missing') return
    const w = v.w, ready = v.phase === 'ready'
    if (ready) {
      set('vibeTab', v.tab as StorageSchema['vibeTab'])
      replaceStateHash('#/script/v/' + w.id + '/' + v.tab)
    }
    // 地址里的分页不存在时旧页面画侧栏抛错，侧栏停在按地址画的那一版
    if (ready && !TAB_FN[v.tab]) return
    setNavRoute({ view: 'tool', tool: ready ? TAB_FN[v.tab] : 'script', sub: 'vibe', wid: w.id, vibe: { id: w.id, title: w.title, tab: v.tab } })
  }, [v])

  if (!v) return null
  if (v.phase === 'missing' || !v.w) return <div className="empty">找不到这部作品，可能已在别的浏览器里。</div>
  const w = v.w, tab = v.tab
  const again = (act?: () => WorkPhase, t = tab) => enter(t, act)
  if (v.phase === 'login')
    return (
      <LoginGate
        w={w}
        onLogin={() => {
          // 登录期间已离开本页时不再进入（旧页面会把作品页画到别的页面上）
          if (alive.current) again()
        }}
      />
    )
  if (v.phase === 'wait') return <WaitView key={v.epoch} w={w} onDone={() => again()} />
  if (v.phase === 'fail') return <FailView w={w} onRetry={() => again(() => retryWork(wid))} onDraft={() => again(() => showDraft(wid))} />
  return (
    <ReadyView
      w={w}
      tab={tab}
      epoch={v.epoch}
      setTab={(t) => setV((p) => p && { ...p, tab: t })}
      onResume={() => again(() => resumeWriting(wid))}
      onRedo={(k) => again(() => redoEpisode(wid, k), 'script')}
    />
  )
}
