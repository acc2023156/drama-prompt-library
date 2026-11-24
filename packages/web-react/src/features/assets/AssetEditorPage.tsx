import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BackBar } from '../../components/BackBar'
import { Icon } from '../../components/Icon'
import { DATA } from '../../data'
import { makeById } from '../../domain/library'
import { type StyleItem, styleList } from '../../domain/styles'
import { get, set } from '../../lib/storage'
import { toast } from '../../lib/toast'
import { AssetsHomePage } from './AssetsHomePage'
import type { AssetFn } from './menus'
import { MicButton, speechRec } from './Mic'
import { buildAssetPrompt } from './prompt'
import { Pv } from './Pv'
import { type AssetSeed, type AssetState, type SeedItem, fnOf, readAssets, seedBoard } from './seed'
import { StylePop } from './StylePop'

export interface AssetEditorPageProps {
  fn: string
  /** #/assets/:fn?i=<n>：编辑“我的资产”第 n 个；null 为新建 */
  idx: number | null
}

/** 节点编辑器（旧 viewAssetEditor，site-template.html 第 1293–1408 行）；功能 id 不在菜单里时显示资产首页（同旧页面）。 */
export function AssetEditorPage({ fn, idx }: AssetEditorPageProps) {
  const f = fnOf(fn)
  return f ? <Editor f={f} idx={idx} /> : <AssetsHomePage />
}

const RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
const RESES = ['1K', '2K', '4K']

type Pick = SeedItem & { k?: number; wid?: string }

/** 打开时的状态：已存资产取其 state；否则空白表单，pl.assetPick 指向本功能时带入名称与档案。 */
function initial(f: AssetFn, idx: number | null) {
  const saved = idx != null ? readAssets()[idx] : null
  const st: AssetState = saved ? { ...saved.state! } : { name: '', profile: '', extra: '', style: '无', ratio: '16:9', res: '2K', opts: [...(f.optDefault || [])] }
  const pk = !saved && (get('assetPick') as Pick | null)
  const fromSeed = pk && pk.fn === f.id ? pk : null
  if (fromSeed) {
    st.name = fromSeed.name
    st.profile = fromSeed.profile
  }
  st.imgs = []
  const styles: StyleItem[] = styleList(DATA.core.styles, makeById(DATA.entries), (get('asm') || {}).custom)
  return { saved, st, fromSeed, styles }
}

function Editor({ f, idx }: { f: AssetFn; idx: number | null }) {
  const [init] = useState(() => initial(f, idx))
  const { saved, fromSeed, styles } = init
  const [st, setSt] = useState(init.st)
  /** 手改过的提示词；表单任何一处改动都会按模板重新生成，丢掉手改（同旧 refresh） */
  const [edited, setEdited] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [drawTick, setDrawTick] = useState(0)
  const prompt = edited ?? buildAssetPrompt(f, st, styles)
  const role = f.menu.key === 'role'

  // 带入只用一次：旧页面读到后立即置 null
  useEffect(() => {
    if (fromSeed) set('assetPick', null)
  }, [fromSeed])

  /** 旧 refresh：改表单后重新生成提示词、重画连线，“返回”变成“储存并返回”。 */
  const refresh = (next: (s: AssetState) => AssetState) => {
    setSt(next)
    setEdited(null)
    setDirty(true)
    setDrawTick((n) => n + 1)
  }
  const field = (k: 'name' | 'profile' | 'ratio' | 'res') => (v: string) => refresh((s) => ({ ...s, [k]: v }))

  const save = () => {
    const list = readAssets()
    const { imgs: _imgs, ...keep } = st
    const item = { fn: f.id, name: st.name, prompt, state: keep, time: Date.now() }
    if (saved) list[idx!] = item
    else list.unshift(item)
    set('assets', list)
    toast(saved ? '已更新资产' : '已保存到我的资产')
    setDirty(false)
    const sd = get('assetSeed') as AssetSeed | null
    if (fromSeed && sd && sd.wid === fromSeed.wid && sd.items[fromSeed.k!]) {
      sd.items[fromSeed.k!].done = true
      set('assetSeed', sd)
      if (sd.items.every((x) => x.done)) {
        toast('资产都齐了，下一步：分镜')
        // 同旧页面：不随离开本页取消
        setTimeout(() => {
          location.hash = seedBoard(sd)
        }, 900)
      }
    }
  }

  /** 参考图只用于预览，不保存。 */
  const loadImage = (k: number, file: File | undefined) => {
    if (!file) return
    const rd = new FileReader()
    rd.onload = () =>
      refresh((s) => {
        const imgs = s.imgs!.slice()
        imgs[k] = rd.result as string
        return { ...s, imgs }
      })
    rd.readAsDataURL(file)
  }

  const graph = useRef<HTMLDivElement>(null)
  const wires = useRef<SVGSVGElement>(null)
  const ins = useRef<HTMLDivElement>(null)
  const out = useRef<HTMLDivElement>(null)
  // 旧 drawWires：按节点实际位置画到输出节点的连线，窗口尺寸变化时重画；连线层被样式隐藏时不画
  useLayoutEffect(() => {
    const draw = () => {
      const g = graph.current, w = wires.current, o = out.current
      if (!g || !w || !o || getComputedStyle(w).display === 'none') return
      const gr = g.getBoundingClientRect(), orc = o.getBoundingClientRect()
      const x2 = orc.left - gr.left, y2 = orc.top - gr.top + orc.height / 2
      w.setAttribute('viewBox', `0 0 ${gr.width} ${gr.height}`)
      w.innerHTML = `<defs><linearGradient id="wg" x1="0" x2="1"><stop offset="0" stop-color="#3fb6ff"/><stop offset="1" stop-color="#ffd23f"/></linearGradient></defs>` +
        [...ins.current!.querySelectorAll('.node')].map((n) => {
          const r = n.getBoundingClientRect()
          const x1 = r.right - gr.left, y1 = r.top - gr.top + r.height / 2, c = (x2 - x1) / 2
          return `<path d="M${x1} ${y1} C${x1 + c} ${y1} ${x2 - c} ${y2} ${x2} ${y2}" fill="none" stroke="url(#wg)" stroke-width="2.2" opacity=".85"/>`
        }).join('') +
        `<circle cx="${x2}" cy="${y2}" r="7" fill="#18181b" stroke="#fff" stroke-width="1.5"/>`
    }
    draw()
    addEventListener('resize', draw)
    return () => removeEventListener('resize', draw)
  }, [drawTick])

  const mic = !!speechRec()
  const profile = (
    <textarea
      id="pf"
      className={mic ? 'has-mic' : undefined}
      rows={4}
      placeholder={role ? '年龄、身份、性格、外貌、标志性服装……' : '时代、地点、空间布局、主要陈设、氛围……'}
      value={String(st.profile)}
      onChange={(e) => field('profile')(e.target.value)}
    />
  )

  return (
    <>
      <BackBar href="#/assets" dirty={dirty} onSave={save} />
      <div className="ed-head" style={{ marginTop: '44px' }}>
        <h2>{f.menu.title} · {f.label}</h2>
        <span className="d">{f.desc}</span>
      </div>
      <div className="graph" id="graph" ref={graph}>
        <svg className="wires" id="wires" ref={wires} />
        <div className="inputs" id="ins" ref={ins}>
          {f.inputs.map((l, k) => (
            <div key={k} className="node" data-in={k}>
              <div className="nh"><Icon name="img" />图{k + 1} · {l}</div>
              <label className="drop" id={'drop' + k}>
                {st.imgs![k] ? <img src={st.imgs![k]} alt="" /> : '点击上传参考图'}
                <input type="file" accept="image/*" hidden data-file={k} onChange={(e) => loadImage(k, e.target.files?.[0])} />
              </label>
            </div>
          ))}
          <div className="node" data-in="t">
            <div className="nh"><Icon name="text" />Text · {role ? '角色' : '场景'}信息</div>
            <input id="nm" placeholder={f.name} value={String(st.name)} onChange={(e) => field('name')(e.target.value)} />
            {!/\{profile\}/.test(f.tpl) ? null : mic ? (
              <div className="mic-w">
                {profile}
                <MicButton value={String(st.profile)} onText={field('profile')} />
              </div>
            ) : (
              profile
            )}
          </div>
        </div>
        <div></div>
        <div className="outnode node" id="out" ref={out}>
          <div className="nh"><Icon name={f.icon} />{f.label}</div>
          <div className="res" style={{ padding: 0 }}><Pv pv={f.pv} /></div>
          <div className="meta"><span>输出预览（示意）</span><span id="outRatio">{st.ratio} · {st.res}</span></div>
        </div>
      </div>
      <div className="composer2">
        <div className="slots" id="slots">
          <span className="slot"><Icon name="plus" /></span>
          {f.inputs.map((_, k) => (
            <span key={k} className="slot">
              {st.imgs![k] ? <img src={st.imgs![k]} /> : <Icon name="img" />}
              <span>图{k + 1}</span>
            </span>
          ))}
          <span className="slot"><Icon name="text" /><span>Text</span></span>
        </div>
        <textarea
          id="prompt"
          spellCheck={false}
          value={prompt}
          onChange={(e) => {
            setEdited(e.target.value)
            setDirty(true)
          }}
        />
        {f.opts ? (
          <div className="opts" id="opts">
            {f.opts.map((o) => (
              <span
                key={o}
                className={`ck ${st.opts.includes(o) ? 'on' : ''}`}
                data-o={o}
                onClick={() => refresh((s) => ({ ...s, opts: s.opts.includes(o) ? s.opts.filter((x) => x !== o) : f.opts!.filter((x) => x === o || s.opts.includes(x)) }))}
              >
                {o}
              </span>
            ))}
          </div>
        ) : null}
        <div className="tools2">
          <StylePop styles={styles} style={st.style} onPick={(n) => refresh((s) => ({ ...s, style: n }))} />
          <span className="tb">
            <Icon name="ratio" />
            <select id="ratio" value={st.ratio} onChange={(e) => field('ratio')(e.target.value)}>
              {RATIOS.map((r) => <option key={r}>{r}</option>)}
            </select>
            <select id="res" value={st.res} onChange={(e) => field('res')(e.target.value)}>
              {RESES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </span>
          <span className="sp"></span>
          <button className="tb" id="save" onClick={save}><Icon name="save" />保存到我的资产</button>
        </div>
      </div>
    </>
  )
}
