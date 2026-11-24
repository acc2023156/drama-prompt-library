import { type FormEvent, useEffect } from 'react'
import { doLogin, logout } from './session'
import { ROLE_NAME, maskPhone, useAuth } from '../lib/auth'
import { setAccount, useAccountOpen } from '../lib/ui'

/** 右上角账户、积分与空间面板：旧 HTML 骨架（第 1003–1023 行）+ drawAccount（第 3331 行）+ 开关（第 3419–3427 行）。 */

const Avatar = () => <span className="account-avatar">天</span>

function MenuIcon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: d }} />
}

export function Account() {
  const A = useAuth()
  const open = useAccountOpen()
  const u = A && A.user
  const pts = u ? (u.points === null ? '∞' : u.points) : '登录'

  useEffect(() => {
    const close = () => setAccount(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccount(false)
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const onLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await doLogin((document.getElementById('accPhone') as HTMLInputElement).value)
  }

  return (
    <div className={open ? 'account open' : 'account'} id="account">
      <button
        className="account-trigger"
        id="accountTrigger"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls="accountPanel"
        aria-label="账户与积分"
        onClick={(e) => {
          e.stopPropagation()
          setAccount(!open)
        }}
      >
        <svg className="spark" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.5c1.1 5.1 4.2 8.2 9.3 9.3-5.1 1.1-8.2 4.2-9.3 9.3-1.1-5.1-4.2-8.2-9.3-9.3C7.8 10.7 10.9 7.6 12 2.5Z" />
        </svg>
        <span className="points-number">{pts}</span>
        <Avatar />
      </button>
      <section className="account-panel" id="accountPanel" aria-label="账户信息" onClick={(e) => e.stopPropagation()}>
        {!u ? (
          <div className="account-head">
            <Avatar />
            <div>
              <div className="account-name">登录天玑</div>
              <div className="account-tier">换装置也能接着写</div>
            </div>
          </div>
        ) : (
          <div className="account-head">
            <Avatar />
            <div>
              <div className="account-name">{u.uid}</div>
              <div className="account-tier">
                {ROLE_NAME[u.role] || u.role} · {maskPhone(u.phone)}
              </div>
            </div>
            <button className="acc-out" id="accOut" title="登出" onClick={logout}>
              登出
            </button>
          </div>
        )}
        <div className="account-label">当前空间</div>
        <button className="space-card" type="button">
          <span className="space-icon">天</span>
          <span className="space-copy">
            <b>个人空间</b>
            <span>仅自己可见</span>
          </span>
          <span className="space-arrow">›</span>
        </button>
        <div className="points-card">
          {!u ? (
            <>
              <form className="login-row" id="accForm" onSubmit={onLogin}>
                <input id="accPhone" inputMode="numeric" maxLength={11} placeholder="手机号 8–11 码" />
                <button className="upgrade" type="submit">
                  登录
                </button>
              </form>
              <div className="points-row">
                <span>新号送 50 积分，每天补到 40</span>
              </div>
            </>
          ) : (
            <>
              <div className="points-balance">积分余额：{u.points === null ? '不限' : u.points}</div>
              <div className="points-row">
                <span>{u.cap ? `每天 0 点补到 ${u.cap} · 写一集 1 点` : '内部测试不扣点'}</span>
                <button
                  className="upgrade"
                  type="button"
                  id="accUp"
                  onClick={() => {
                    setAccount(false)
                    location.hash = '#/membership'
                  }}
                >
                  升级会员
                </button>
              </div>
            </>
          )}
        </div>
        <nav className="account-menu">
          <a className="account-link" href="#/hotwords">
            <MenuIcon d='<path d="M12 3c1 3.2 4.5 4.6 4.5 9a4.5 4.5 0 0 1-9 0c0-2 .8-3.2 1.8-4.2.3 1.6 1.1 2.4 2 2.7C11 8.2 11.2 5.6 12 3Z"/>' />
            热词
          </a>
          <a className="account-link" href="#/help">
            <MenuIcon d='<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.8 2c-1.1.7-1.6 1.1-1.6 2.4M12 17.2v.1"/>' />
            帮助中心
          </a>
          <a className="account-link" href="#/manual">
            <MenuIcon d='<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 7h6M9 11h5"/>' />
            使用手册
          </a>
          <button className="account-link" type="button">
            <MenuIcon d='<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h6"/>' />
            快捷键
          </button>
          <button className="account-link" type="button">
            <MenuIcon d='<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 15V9l3 6V9M14 15l2-6 2 6M14.8 13h2.4"/>' />
            AI 生成水印设置
          </button>
        </nav>
      </section>
    </div>
  )
}
