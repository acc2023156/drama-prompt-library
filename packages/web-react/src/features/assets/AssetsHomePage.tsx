import { useState } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { Icon } from '../../components/Icon'
import { StepNum } from '../../components/StepNum'
import { get, set } from '../../lib/storage'
import { ASSET_MENUS } from './menus'
import { Pv } from './Pv'
import { type AssetSeed, fnOf, readAssets, seedBoard } from './seed'

/**
 * 资产首页（旧 viewAssets，site-template.html 第 1261–1291 行）：两张菜单卡、作品导入条、我的资产。
 * 旧页面删除资产、关闭导入条后整页重画，这里用 key 重新挂载达到同样效果（复制按钮的“已复制”状态随之复原）。
 */
export function AssetsHomePage() {
  const [rev, setRev] = useState(0)
  return <Home key={rev} onReload={() => setRev((n) => n + 1)} />
}

function Home({ onReload }: { onReload(): void }) {
  const [mine] = useState(readAssets)
  const [seed] = useState(() => get('assetSeed') as AssetSeed | null)
  return (
    <>
      <h1 className="as-title">选择起点，建立天玑资产</h1>
      {seed ? <SeedBar seed={seed} onClose={() => { set('assetSeed', null); onReload() }} /> : null}
      <div className="as-cards">
        {ASSET_MENUS.map((m, mi) => (
          <div key={m.key} className={`mcard ${mi ? 'r' : ''}`}>
            <h3>{m.title}</h3>
            {m.items.map((i) => (
              <a key={i.id} className="mi" href={`#/assets/${i.id}`} style={{ textDecoration: 'none' }}>
                <Icon name={i.icon} />
                {i.label}{' '}
                <span className="pop">
                  <Pv pv={i.pv} as="span" style={{ display: 'grid', height: '130px' }} />
                  <p>{i.desc}</p>
                </span>
              </a>
            ))}
            <div className="stackwrap">
              <div className="stack">
                {m.stack.map((s, k) => (
                  <b key={k}><Icon name={s} /></b>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <section className="mine">
        <div className="sec-head" style={{ margin: '0 0 14px' }}>
          <h2 style={{ fontSize: '20px' }}>我的资产</h2>
          <span className="meta">{mine.length} 个 · 只保存在这台电脑的浏览器里</span>
        </div>
        {mine.length ? (
          <div className="grid">
            {mine.map((a, k) => (
              <div key={k} className="acard">
                <div className="t">
                  <Icon name={fnOf(a.fn)?.menu.key === 'scene' ? 'mount' : 'user'} />
                  {String(a.name || '未命名')}
                  <span className="ui-tag mode" style={{ marginLeft: 'auto' }}>{fnOf(a.fn)?.label || ''}</span>
                </div>
                <div className="s">{String(a.prompt)}</div>
                <div className="acts">
                  <a className="ui-btn primary" href={`#/assets/${a.fn}?i=${k}`}><Icon name="pen" />打开</a>
                  <CopyButton className="ui-btn secondary" text={a.prompt as string}><Icon name="copy" />复制提示词</CopyButton>
                  <button
                    className="ui-btn danger"
                    data-del={k}
                    onClick={() => {
                      if (!confirm('删除这个资产？')) return
                      mine.splice(k, 1)
                      set('assets', mine)
                      onReload()
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty" style={{ padding: '30px 0' }}>还没有资产。点上面任一功能，填好后按“保存到我的资产”。</div>
        )}
      </section>
    </>
  )
}

/** 作品页带来的导入条：逐项进入编辑器（带入 pl.assetPick），全部完成后“去分镜”高亮。 */
function SeedBar({ seed, onClose }: { seed: AssetSeed; onClose(): void }) {
  const nx = seed.items.findIndex((x) => !x.done)
  return (
    <div className="seedbar">
      <span><StepNum n="" state="done" />从《{String(seed.title)}》导入完成</span>
      {seed.items.map((x, k) => (
        <button
          key={k}
          className={`btn-o ${x.done ? 'done' : ''} ${k === nx ? 'nx' : ''}`}
          data-seed={k}
          onClick={() => {
            set('assetPick', { ...x, k, wid: seed.wid })
            location.hash = '#/assets/' + x.fn
          }}
        >
          <StepNum n={k + 1} state={x.done ? 'done' : k === nx ? 'on' : ''} />
          {String(x.label)}{/[A-Za-z]$/.test(x.label) ? ' ' : ''}设定板
        </button>
      ))}
      <a className={`seed-go ${seed.items.every((x) => x.done) ? '' : 'soft'}`} href={seedBoard(seed)}><Icon name="play" />去分镜</a>
      <button className="x" id="seedX" title="关闭" onClick={onClose}>×</button>
    </div>
  )
}
