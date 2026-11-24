import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import type { StyleItem } from '../../domain/styles'

const TABS = ['官方', '我的风格', '真人', '2D', '3D']

/**
 * 风格弹层与开关按钮（旧 viewAssetEditor 内的 spop、sbtn、drawStyles）。
 * 旧页面只在打开弹层、切页签、输入搜索词时重画风格格子，选中别的风格后格子里的高亮要等下次重画才更新；
 * drawn 记下最近一次重画时的页签、搜索词与选中风格，按它渲染，保持同样的时机。
 */
export function StylePop({ styles, style, onPick }: { styles: StyleItem[]; style: string; onPick(n: string): void }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('官方')
  const [q, setQ] = useState('')
  const [drawn, setDrawn] = useState<{ tab: string; q: string; style: string } | null>(null)
  const draw = (t = tab, query = q) => setDrawn({ tab: t, q: query.trim(), style })

  // 点页面其他地方收起；按钮与弹层内的点击已阻止冒泡
  useEffect(() => {
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const list = drawn ? styles.filter((s) => (drawn.tab === '官方' ? s.tab !== '我的风格' : s.tab === drawn.tab) && (!drawn.q || s.n.includes(drawn.q))) : []
  return (
    <>
      <div className={open ? 'stylepop open' : 'stylepop'} id="spop" onClick={(e) => e.stopPropagation()}>
        <div className="sh">
          <Icon name="search" />
          <input
            id="sq"
            placeholder="搜索风格"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              draw(tab, e.target.value)
            }}
          />
        </div>
        <div className="stabs" id="stabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={drawn ? (t === drawn.tab ? 'on' : '') : undefined}
              data-t={t}
              onClick={() => {
                setTab(t)
                draw(t)
              }}
            >
              {t}
            </button>
          ))}
          <span className="sp"></span>
          <a href="#/assembler" style={{ fontSize: '13px', textDecoration: 'none' }}>+ 创建风格</a>
        </div>
        <div className="sgrid" id="sgrid">
          {!drawn ? null : list.length ? (
            list.map((s, k) => (
              <button
                key={k}
                className={`stile ${s.n === drawn.style ? 'on' : ''}`}
                data-s={s.n}
                onClick={() => {
                  setOpen(false)
                  onPick(s.n)
                }}
              >
                <i style={{ background: s.g }}>
                  {s.n === '无' ? (
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="m6 18 12-12" /></svg>
                  ) : (
                    <Icon name="palette" />
                  )}
                </i>
                {s.n}
              </button>
            ))
          ) : (
            <div className="empty" style={{ gridColumn: '1/-1', padding: '20px 0' }}>
              {drawn.tab === '我的风格' ? '在 6.0 组装器里填写“自定义”画风后会出现在这里' : '没有符合的风格'}
            </div>
          )}
        </div>
      </div>
      <button
        className="tb"
        id="sbtn"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
          draw()
        }}
      >
        <Icon name="palette" />
        <span id="sname">{style === '无' ? '风格' : style}</span>
      </button>
    </>
  )
}
