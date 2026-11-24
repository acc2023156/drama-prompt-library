import { type FormEvent, useEffect, useRef, useState } from 'react'
import { BackBar } from '../../components/BackBar'
import { adminApi } from '../../lib/api'
import { ROLE_NAME, maskPhone } from '../../lib/auth'
import { adminKey } from '../../lib/storage'
import { toast } from '../../lib/toast'

interface AdminUser {
  uid: string
  phone?: string
  role?: string
  points?: number | null
  used_today?: number
  used_total?: number
  works?: number
  last_login?: number
}
interface UsersReply {
  day?: string
  users: AdminUser[]
}
interface Stats {
  today?: { n?: number; ok?: number; avg_ms?: number; busy?: number; timeout?: number }
  lastHour?: { n?: number }
  models?: { model: string; n?: number; ok?: number; avg_ms?: number }[]
}

const fmt = (t?: number) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }).slice(2, 16) : '')
const secs = (ms?: number) => (ms ? Math.round(ms / 1000) + 's' : '—')

/** 调用统计条（旧 viewAdmin 里的 .adm-stats）。 */
function StatsBox({ st }: { st: Stats }) {
  const t = st.today || {}
  const hr = st.lastHour || {}
  const pct = t.n ? Math.round(((t.ok || 0) / t.n) * 100) : 0
  return (
    <div className="adm-stats">
      <span>
        <b>{t.n || 0}</b>今日调用
      </span>
      <span>
        <b>{t.n ? pct + '%' : '—'}</b>成功率
      </span>
      <span>
        <b>{secs(t.avg_ms)}</b>平均耗时
      </span>
      <span>
        <b>{t.busy || 0}</b>忙线 429
      </span>
      <span>
        <b>{t.timeout || 0}</b>逾时
      </span>
      <span>
        <b>{hr.n || 0}</b>近 1 小时
      </span>
      {(st.models || []).map((m, i) => (
        <small key={i}>
          {m.model}：{String(m.n)} 次 · 成功 {m.ok || 0} · {secs(m.avg_ms)}
        </small>
      ))}
    </div>
  )
}

/** 一位用户一行：改身份、手动加点。 */
function UserRow({ u, reload }: { u: AdminUser; reload: () => void }) {
  const n = useRef<HTMLInputElement>(null)
  const note = useRef<HTMLInputElement>(null)
  const add = async () => {
    const delta = +n.current!.value
    if (!delta) return toast('输入点数')
    try {
      await adminApi('/admin/points', adminKey.get(), { method: 'POST', body: JSON.stringify({ uid: u.uid, delta, note: note.current!.value }) })
      toast(`${u.uid} ${delta > 0 ? '+' : ''}${delta}`)
      reload()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  const setRole = async (role: string) => {
    try {
      await adminApi('/admin/role', adminKey.get(), { method: 'POST', body: JSON.stringify({ uid: u.uid, role }) })
      toast('已改身份')
      reload()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  return (
    <div className="adm-r" data-uid={u.uid}>
      <span>
        <b>{u.uid}</b>
      </span>
      <span>{maskPhone(u.phone)}</span>
      <span>
        <select data-role="" defaultValue={u.role} onChange={(e) => setRole(e.target.value)}>
          {Object.entries(ROLE_NAME).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </span>
      <span>
        <b>{u.role === 'tester' ? '不限' : String(u.points)}</b>
      </span>
      <span>{u.used_today || 0}</span>
      <span>{u.used_total || 0}</span>
      <span>{String(u.works)}</span>
      <span>{fmt(u.last_login)}</span>
      <span className="adm-add">
        <input type="number" data-n="" placeholder="+点数" ref={n} />
        <input data-note="" placeholder="备注" ref={note} />
        <button className="btn-o" data-add="" onClick={add}>
          加点
        </button>
      </span>
    </div>
  )
}

type Body = { kind: 'idle' } | { kind: 'error'; text: string } | { kind: 'users'; users: AdminUser[]; seq: number }

/** 会员后台（旧 viewAdmin，3386）：口令存 sessionStorage.tjAdmin，作 X-Admin-Key；用户表、调用统计、加点、改身份。 */
export function AdminPage() {
  const [meta, setMeta] = useState('')
  const [body, setBody] = useState<Body>({ kind: 'idle' })
  const [stats, setStats] = useState<Stats | null>(null)
  const alive = useRef(true)
  const seq = useRef(0)
  const keyIn = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      const j = await adminApi<UsersReply>('/admin/users', adminKey.get())
      if (!alive.current) return
      if (!j || !Array.isArray(j.users)) throw new Error('bad reply')
      setMeta(`${j.users.length} 位 · ${j.day}`)
      // 统计失败静默；旧页面每次重画表格都会丢掉旧统计条，新的统计回来后再加到表格上方
      setStats(null)
      adminApi<Stats>('/admin/stats', adminKey.get())
        .then((st) => alive.current && setStats(st))
        .catch(() => {})
      setBody({ kind: 'users', users: j.users, seq: ++seq.current })
    } catch (e) {
      if (alive.current) setBody({ kind: 'error', text: (e as { status?: number }).status === 403 ? '密码不对' : '读取失败' })
    }
  }

  useEffect(() => {
    alive.current = true
    if (adminKey.get()) load()
    return () => {
      alive.current = false
    }
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    adminKey.set(keyIn.current!.value.trim())
    load()
  }

  return (
    <>
      <BackBar href="#/" />
      <div className="sec-head" style={{ marginTop: 56 }}>
        <h2>会员后台</h2>
        <span className="meta" id="admMeta">
          {meta}
        </span>
      </div>
      <form className="login-row adm-key" id="admKey" onSubmit={submit}>
        <input type="password" id="admKeyIn" placeholder="管理员密码" defaultValue={adminKey.get()} ref={keyIn} />
        <button className="btn-o" type="submit">
          进入
        </button>
      </form>
      <div id="admBody">
        {body.kind === 'error' && <div className="empty">{body.text}</div>}
        {body.kind === 'users' && (
          <>
            {stats && <StatsBox st={stats} />}
            <div className="adm-table" key={body.seq}>
              <div className="adm-r adm-h">
                <span>UID</span>
                <span>手机</span>
                <span>身份</span>
                <span>积分</span>
                <span>今日用</span>
                <span>累计用</span>
                <span>作品</span>
                <span>最后登录</span>
                <span>手动加点</span>
              </div>
              {body.users.map((u) => (
                <UserRow key={u.uid} u={u} reload={load} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
