import { useEffect, useRef, useState } from 'react'
import { doLogin } from '../../app/session'
import { BackBar } from '../../components/BackBar'
import { Icon } from '../../components/Icon'
import { applyGenPatch, genParse } from '../../domain/gen'
import type { Gen, Work } from '../../domain/types'
import { WZ_DEF } from '../../domain/wz'
import { depthOf } from '../../domain/yq'
import { tjApi } from '../../lib/api'
import { get, set } from '../../lib/storage'
import { mmss } from './model'

/** 作品页的三种状态页：等待（旧 genWait）、登录闸（loginGate）、失败（genFail）。 */

const Hero = ({ title }: { title: string }) => (
  <section className="done-hero">
    <h1>《{title}》</h1>
  </section>
)

/** 旧 updateGen：给作品合并 gen 并写回 pl.works（只给旧版云端作业的轮询用，yq 引擎的状态由写作引擎写）。 */
function updateGen(wid: string, patch: Partial<Gen>): void {
  const r = applyGenPatch(get('works') || [], wid, patch)
  if (r) set('works', r.list)
}

/**
 * 等待页：yq 引擎只走秒表（写作由 enterWork 启动）；旧版云端作业每 8 秒轮询一次 GET /jobs/:id，
 * 90 秒还没建单或建单失败就记为出错，结束后 onDone 重新进入作品页。
 */
export function WaitView({ w, onDone }: { w: Work; onDone: () => void }) {
  const g = w.gen as Gen
  const [sec, setSec] = useState<number | null>(null)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    let alive = true, n = 0
    const iv = setInterval(async () => {
      setSec(Math.floor((Date.now() - (g.at as number)) / 1000))
      if (g.engine === 'yq') return
      if (n++ % 8) return
      const cur = ((get('works') || []).find((x) => x.id === w.id) || ({} as Work)).gen || ({} as Gen)
      if (!cur.id) {
        if (cur.status === 'error' || Date.now() - (g.at as number) > 90000) {
          clearInterval(iv)
          if (cur.status !== 'error') updateGen(w.id, { status: 'error', err: 'start failed' })
          done.current()
        }
        return
      }
      try {
        const j = await tjApi('/jobs/' + cur.id)
        if (j.status === 'done' && j.result) {
          clearInterval(iv)
          updateGen(w.id, { status: 'done', data: genParse(j.result) as Gen['data'] })
          if (alive) done.current()
        } else if (j.status === 'error') {
          clearInterval(iv)
          updateGen(w.id, { status: 'error', err: j.error || '' })
          if (alive) done.current()
        }
      } catch {
        // 同旧实现：轮询失败等下一次
      }
    }, 1000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [w.id, g])
  const label = g.engine === 'yq' ? (depthOf(Object.assign({}, WZ_DEF, w.W)) === '重度' ? (g.card ? 'AI 正在依策划卡排大纲' : 'AI 正在写策划卡') : 'AI 正在排大纲') : 'AI 正在写这部剧'
  return (
    <>
      <BackBar href="#/script" />
      <Hero title={w.title} />
      <div className="gen-wait">
        <span className="gw-spin" />
        <b>{label}</b>
        <em id="gwT">{sec === null ? '00:00' : mmss(sec)}</em>
      </div>
    </>
  )
}

/** 登录闸：未登录又没开写过的作品，输入手机号登录后重新进入作品页（会自动开写）。 */
export function LoginGate({ w, onLogin }: { w: Work; onLogin: () => void }) {
  const ip = useRef<HTMLInputElement>(null)
  useEffect(() => ip.current?.focus(), [])
  return (
    <>
      <BackBar href="#/script" />
      <Hero title={w.title} />
      <div className="gen-wait">
        <b>输入手机号就能开写</b>
        <form
          className="login-row"
          id="gateForm"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await doLogin(ip.current!.value)) onLogin()
          }}
        >
          <input id="gatePhone" ref={ip} inputMode="numeric" maxLength={11} placeholder="手机号 8–11 码" />
          <button className="bigbtn" type="submit">
            <Icon name="sparkle" />
            开写
          </button>
        </form>
      </div>
    </>
  )
}

/** 失败页：再写一次（retryWork）或先看本地模板草稿（showDraft）。 */
export function FailView({ w, onRetry, onDraft }: { w: Work; onRetry: () => void; onDraft: () => void }) {
  return (
    <>
      <BackBar href="#/script" />
      <Hero title={w.title} />
      <div className="gen-wait">
        <b>这次没写成</b>
        <div className="row">
          <button className="bigbtn" id="gRetry" onClick={onRetry}>
            <Icon name="sparkle" />
            再写一次
          </button>
          <button className="btn-o" id="gDraft" onClick={onDraft}>
            先看草稿
          </button>
        </div>
      </div>
    </>
  )
}
