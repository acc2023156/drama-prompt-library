import { type ReactNode, useEffect, useLayoutEffect } from 'react'
import { TextModalHost } from '../components/TextModal'
import { Toast } from '../components/Toast'
import { onAlignRequest, useNavOverride } from '../lib/nav'
import { get } from '../lib/storage'
import { isMobile, setPanel } from '../lib/ui'
import { Account } from './Account'
import { PanelPill, ProSwitch, SideNav, TopSeg, navTitle } from './Nav'
import type { Route } from './routes'

/** 右上“返回”与左上“目录”同一个高度，不论侧栏开关、手机或电脑（旧 alignBack，第 3709 行）。 */
export function alignBack(): void {
  const rb = document.querySelector<HTMLElement>('#view .res-back')
  if (!rb) return
  rb.style.marginTop = ''
  const off = document.body.classList.contains('ps-off')
  const ref = off ? document.querySelector('.ps-float') : document.getElementById('psClose')
  const pill = rb.querySelector('.pill')
  if (!ref || !pill || !ref.getClientRects().length) return
  const ps = document.getElementById('pside')
  const refTop = ref.getBoundingClientRect().top + (off ? scrollY : ps ? ps.scrollTop : 0)
  const myTop = pill.getBoundingClientRect().top + scrollY
  rb.style.marginTop = parseFloat(getComputedStyle(rb).marginTop) + refTop - myTop + 'px'
  rb.style.top = Math.max(8, off ? refTop : ref.getBoundingClientRect().top + (ps ? ps.scrollTop : 0)) + 'px'
}

const Logo = () => (
  <svg viewBox="0 0 40 40">
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffd23f" />
        <stop offset=".45" stopColor="#3fb6ff" />
        <stop offset="1" stopColor="#7a5cff" />
      </linearGradient>
    </defs>
    <path d="M6 6 34 18 21 21 17 34Z" fill="url(#lg)" />
    <path d="M21 21 34 18 26 26Z" fill="#1e7fd6" opacity=".7" />
  </svg>
)

/** 页面骨架：旧 HTML 第 995–1031 行（顶栏、侧栏、#view、#toast）+ route() 的换页副作用。 */
export function Layout({ route, hash, rev, children }: { route: Route; hash: string; rev: number; children: ReactNode }) {
  const nav = useNavOverride() ?? route

  // 每次换路由（含合成 hashchange）：手机收起侧栏、桌面沿用 pl.panel；滚到顶；对齐返回按钮
  useLayoutEffect(() => {
    document.body.classList.toggle('ps-off', isMobile() || get('panel') === false)
    window.scrollTo(0, 0)
    const raf = requestAnimationFrame(alignBack)
    const t1 = setTimeout(alignBack, 80)
    const t2 = setTimeout(alignBack, 400)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [rev])

  useEffect(() => {
    const onResize = () => requestAnimationFrame(alignBack)
    addEventListener('resize', onResize)
    const off = onAlignRequest(alignBack)
    return () => {
      removeEventListener('resize', onResize)
      off()
    }
  }, [])

  const title = navTitle(nav)
  return (
    <>
      <header className="topbar">
        <a className={route.view === 'start' ? 'tb-logo on' : 'tb-logo'} href="#/" aria-label="首页">
          <Logo />
          <span className="tb-name">天玑</span>
        </a>
        <TopSeg route={nav} />
        <ProSwitch />
        <Account />
      </header>
      <div className="shell">
        <SideNav route={nav} hash={hash} rev={rev} />
        <main>
          <div className="ps-float">
            <button className="pill" id="psOpen" onClick={() => setPanel(true)}>
              <PanelPill title={title} />
            </button>
          </div>
          <div className="wrap" id="view">
            {children}
          </div>
        </main>
      </div>
      <Toast />
      <TextModalHost />
    </>
  )
}
