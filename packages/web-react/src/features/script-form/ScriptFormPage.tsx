import { type ChangeEvent, type FormEvent, Fragment, useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { ICONS } from '../../components/icons'
import { StepNum } from '../../components/StepNum'
import { showModal } from '../../components/TextModal'
import { nfmt } from '../../domain/text'
import type { Work, WzMode, WzSettings } from '../../domain/types'
import { liveWorks } from '../../domain/works'
import { MODE, SUPP, WZ_DEF, WZ_OPT, langOf, wzBuildWork, wzDupCheck, wzSeedAssets, wzSettings, wzTitle } from '../../domain/wz'
import { get, set } from '../../lib/storage'
import { toast } from '../../lib/toast'
import { formView, pitchPrompt } from './progress'

export interface ScriptFormPageProps {
  /** #/script/w/:wid 编辑已有作品；不传为新增 */
  wid?: string
}

type Field = keyof WzSettings

/**
 * 新增 / 编辑作品的五步表单（旧 viewScriptNew，site-template.html 第 1884–2040 行）：
 * 策划文件、骨架、第一季规格、补充设定、确认与建立；右侧预览与进度。
 * 旧页面只在 drawS1 时重画第 1 步内容、在 update() 时刷新预览等区域，输入框本身不重画；
 * 这里设定 W 放在 ref 里（与旧闭包对象一样就地修改），输入框不受控，第 1 步用 key 重画，update() 的结果存成快照再渲染。
 */
export function ScriptFormPage({ wid }: ScriptFormPageProps) {
  const [works] = useState<Work[]>(() => get('works') || [])
  const [w] = useState(() => (wid ? works.find((x) => x.id === wid) ?? null : null))
  const ref = useRef<WzSettings>(null as unknown as WzSettings)
  if (!ref.current) {
    const W = Object.assign({}, WZ_DEF, w ? w.W : get('scriptDraft') || {}) as WzSettings
    W.id = (w ? w.id : null) as unknown as string
    W.dup = null
    ref.current = W
  }
  const W = ref.current
  // drawS1 的快照：第 1 步按当时的设定重画
  const [s1, setS1] = useState(() => ({ rev: 0, W: { ...W } }))
  const [docInfo, setDocInfo] = useState('')
  // update() 的快照
  const [U, setU] = useState<WzSettings | null>(null)
  const title = useRef<HTMLInputElement>(null)

  function drawS1() {
    setS1((s) => ({ rev: s.rev + 1, W: { ...W } }))
    setDocInfo('')
  }
  function update() {
    W.dup = wzDupCheck(W, liveWorks(get('works')))
    setU({ ...W })
    if (!W.id) {
      const { dup: _dup, ...keep } = W
      set('scriptDraft', keep)
    }
  }
  useEffect(update, [])

  /** 旧 bind()：输入框、下拉、勾选写回 W 后 update()。 */
  const field = (k: Field) => (e: FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const el = e.currentTarget as HTMLInputElement
    ;(W as unknown as Record<string, unknown>)[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' && k === 'wpm' ? +el.value || 400 : el.value
    update()
  }
  const onText = (k: Field) => ({ onInput: field(k) })
  const onPick = (k: Field) => ({ onChange: field(k) })

  function chip(k: 'hooks' | 'eps' | 'mins', raw: string) {
    const val = isNaN(+raw) ? raw : +raw
    const cur = W[k]
    if (Array.isArray(cur)) W.hooks = cur.includes(val as string) ? cur.filter((x) => x !== val) : [...cur, val as string]
    else (W as unknown as Record<string, unknown>)[k] = val
    update()
  }

  function setMode(m: WzMode) {
    W.mode = m
    drawS1()
    update()
  }

  function readFile(k: 'doc' | 'novel') {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.currentTarget.files![0]
      if (!f) return
      if (f.size > 4e6) {
        toast('文件太大')
        return
      }
      const rd = new FileReader()
      rd.onload = () => {
        W[k] = rd.result as string
        drawS1()
        update()
        toast(`已读取 ${f.name}`)
      }
      rd.readAsText(f, 'utf-8')
    }
  }

  function readDoc() {
    if (!W.doc.trim()) return toast('先贴上策划文件')
    const t = wzTitle({ ...W, title: '' })
    if (t && !W.title.trim()) {
      W.title = t
      title.current!.value = t
    }
    setDocInfo(`已读取：约 ${nfmt(W.doc.length)} 字${t ? '，剧名《' + t + '》' : ''}。`)
    update()
  }

  function story() {
    const el = document.querySelector<HTMLInputElement>('[data-f="pitch"]')!
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => el.focus(), 350)
  }

  function aiPitch() {
    const { main, sup } = wzSettings(W)
    showModal('「AI 帮我想」卖点提示词', pitchPrompt(W, main, sup), '卖点提示词.txt')
  }

  /** 旧 wzCreate：建立作品，把主角、对手、场景带到资产库。 */
  function create() {
    const { list, item } = wzBuildWork(get('works') || [], W, undefined, Date.now())
    set('works', list)
    W.id = item.id
    const { seed, leads } = wzSeedAssets(W, item)
    set('assetSeed', seed as never)
    toast(`已配好${leads.join('、')}，从第 1 个开始`)
    location.hash = '#/assets'
    if (!w) set('scriptDraft', null)
  }

  const v = U ? formView(U) : null
  const on = (k: 'hooks' | 'eps' | 'mins', val: string | number) => (Array.isArray(W[k]) ? (W[k] as unknown[]).includes(val) : W[k] === val)
  const Chip = ({ k, val, label }: { k: 'hooks' | 'eps' | 'mins'; val: string | number; label?: string }) => (
    <span className={`ck ${on(k, val) ? 'on' : ''}`} data-k={k} data-v={String(val)} onClick={() => chip(k, String(val))}>{label ?? val}</span>
  )
  const sel = (k: Field, opts: string[], cur: unknown) => (
    <select className="sel" data-f={k} defaultValue={opts.includes(cur as string) ? (cur as string) : undefined} {...onPick(k)}>
      {opts.map((o) => <option key={o}>{o}</option>)}
    </select>
  )
  const stepState = (i: number) => (v && v.prog[i][1] ? 'done' : 'on')
  const head = w ? '编辑作品' : '新增作品'

  return (
    <>
      <div className="wz-head">
        <div className="crumb"><a href="#/script">天玑</a>／<a href="#/script">剧本</a>／<span>{head}</span></div>
        <h1>{head}</h1>
        <p className="cheer" id="cheer">{v?.cheer}</p>
      </div>
      <div className="wz">
        <div>
          <section className="step">
            <h3><StepNum n={1} state={stepState(0)} /><span id="s1T">{MODE[W.mode].step}</span><em className="ok" id="s1Tag">{v?.s1Ready ? '✓ 已就绪' : ''}</em></h3>
            <div className="tabs2" id="tabs">
              {Object.entries(MODE).map(([k, m]) => <button key={k} className={k === W.mode ? 'on' : undefined} data-m={k} onClick={() => setMode(k as WzMode)}>{m.tab}</button>)}
            </div>
            <div id="s1">
              <StepOne key={s1.rev} S={s1.W} docInfo={docInfo} novelInfo={v?.novelInfo ?? ''} onText={onText} onFile={readFile} onReadDoc={readDoc} onStory={story} />
            </div>
            {works.length > 0 && (
              <details className="drafts">
                <summary>最近的作品（{works.length} 份，点{'「'}载入{'」'}接着用）</summary>
                {works.slice(0, 5).map((x, i) => (
                  <div key={i} className="d">
                    <a className="btn-o" style={{ height: 30 }} href={'#/script/w/' + x.id}>载入</a>
                    <b>《{x.title || '未命名'}》</b>
                    <span className="sp">{`${MODE[x.W.mode as WzMode].tab}・${new Date(x.time as number).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}</span>
                  </div>
                ))}
              </details>
            )}
          </section>

          <section className="step">
            <h3><StepNum n={2} state={stepState(1)} />骨架</h3>
            <label className="fl">作品名称</label>
            <input ref={title} className="in" data-f="title" placeholder="留空，AI 帮你取" defaultValue={W.title} {...onText('title')} />
            <div className="g3" style={{ marginTop: 12 }}>
              {([['aud', '受众'], ['pair', '配对'], ['genre', '类型']] as const).map(([k, l]) => (
                <div key={k}><label className="fl">{l}</label>{sel(k, WZ_OPT[k], W[k])}</div>
              ))}
            </div>
            <label className="fl">一句话卖点<span className="tip">可以自己写，或请 AI 想；选好之后也能直接改</span></label>
            <div className="inrow">
              <input className="in" data-f="pitch" placeholder="例：重逢的前任，成了她新公司的老板" defaultValue={W.pitch} {...onText('pitch')} />
              <button className="btn-o" id="aiPitch" onClick={aiPitch}>AI 帮我想</button>
            </div>
            <label className="fl">核心爽点（可多选）</label>
            <div className="chips">{WZ_OPT.hooks.map((h) => <Chip key={h} k="hooks" val={h} />)}</div>
            <div className="g2" style={{ marginTop: 4 }}>
              <div><label className="fl">台词词库 <span className="req">必填</span></label>{sel('lang', ['简中词库', '繁中词库'], langOf(W))}</div>
              <div><label className="fl">剧本字形</label>{sel('glyph', ['简体', '繁体'], W.glyph)}</div>
            </div>
            <p className="hint">词库和字形分开：例如繁体字配简中词库也可以。</p>
          </section>

          <section className="step">
            <h3><StepNum n={3} state={stepState(2)} />第一季规格</h3>
            <div className="g2">
              <div>
                <label className="fl">第一季集数 <span className="req">必填</span></label>
                <div className="chips">{WZ_OPT.eps.map((n) => <Chip key={n} k="eps" val={n} label={n + ' 集'} />)}<Chip k="eps" val="自定义" /></div>
                <input className="in" type="number" min="1" data-f="epsCustom" placeholder="集数" defaultValue={W.epsCustom} style={{ marginTop: 8, display: W.eps === '自定义' ? 'block' : 'none' }} {...onText('epsCustom')} />
              </div>
              <div>
                <label className="fl">每集时长 <span className="req">必填</span></label>
                <div className="chips">{WZ_OPT.mins.map((n) => <Chip key={n} k="mins" val={n} label={n + ' 分钟'} />)}<Chip k="mins" val="自定义" /></div>
                <input className="in" type="number" min="1" step="0.5" data-f="minsCustom" placeholder="分钟" defaultValue={W.minsCustom} style={{ marginTop: 8, display: W.mins === '自定义' ? 'block' : 'none' }} {...onText('minsCustom')} />
              </div>
            </div>
            <div className="sumbox">
              <div id="sum">
                {v && (v.eps && v.mins
                  ? <>每集约 <b>{nfmt(v.per)}</b> 字・{v.eps} 集合计约 <b>{nfmt(v.per * v.eps)}</b> 字・总片长约 <b>{nfmt(Math.round(v.eps * v.mins))}</b> 分钟</>
                  : '请填好集数和每集时长')}
              </div>
              <div style={{ marginTop: 8, color: 'var(--text-2)', fontSize: 13 }}>字数换算：每分钟约<input className="in" type="number" min="100" data-f="wpm" defaultValue={W.wpm} {...onText('wpm')} />字（公司标准 400，可调整）</div>
            </div>
            <label className="cb"><input type="checkbox" data-f="sequel" defaultChecked={W.sequel} {...onPick('sequel')} /><div><b>预留续季空间</b>{'　'}<span>最后一集留下 2–3 条可延续的线，不把伏笔收完</span></div></label>
            <label className="fl" style={{ marginTop: 16 }}>主写 AI</label>
            <select className="sel" data-f="ai" defaultValue={WZ_OPT.ai.some(([x]) => x === W.ai) ? W.ai : undefined} {...onPick('ai')}>
              {WZ_OPT.ai.map(([x, l]) => <option key={x} value={x}>{l}</option>)}
            </select>
            <p className="hint">天玑只负责产生提示词，复制后贴到这里选的 AI 去写。</p>
          </section>

          <section className="step">
            <h3><StepNum n={4} state={stepState(3)} />补充设定<small>（选填，会一起交给写作模型）</small></h3>
            {SUPP.map(([k, l, ph, big]) => (
              <SuppField key={k} k={k} l={l} ph={ph} big={big} value={W[k]} onInput={field(k)} />
            ))}
          </section>

          <section className="step">
            <h3><StepNum n={5} state={stepState(4)} />确认与建立</h3>
            <div className="score">
              <span style={{ color: 'var(--text-2)', fontSize: 13 }}>辨识度</span>
              <b id="score">{v ? `${v.score} / 10` : ''}</b>
              <div className="bar"><i id="scoreBar" style={v ? { width: v.score * 10 + '%' } : undefined} /></div>
            </div>
            <p className="hint" id="scoreHint">{v?.scoreHint}</p>
            <label className="cb"><input type="checkbox" data-f="adult" defaultChecked={W.adult} {...onPick('adult')} /><div><b>所有角色均已年满 18 岁</b></div></label>
            <label className="fl" style={{ marginTop: 16 }}>撞题比对</label>
            <Dup U={U} />
            <button className="bigbtn" id="go" disabled={!!v && v.needs.length > 0} onClick={create}>{v?.go}</button>
            <p className="hint" id="goSub">{v?.goSub}</p>
          </section>
        </div>

        <aside className="side2">
          <div className="card2">
            <h4>作品预览</h4>
            <div className={v && !v.title ? 'ttl soft' : 'ttl'} id="pvTitle">{v ? (v.title ? `《${v.title}》` : '《AI 帮你取剧名》') : ''}</div>
            <div className="tags" id="pvTags">{U && [U.aud, U.pair, U.genre].map((x, i) => <span key={i} className="tag">{x}</span>)}</div>
            <div className="kv" id="pvKv">
              {U && v && (
                <>
                  <span>卖点</span><span>{U.pitch || '—'}</span>
                  <span>规格</span><span>{`${v.eps} 集・每集 ${v.mins} 分钟・约 ${nfmt(v.per)} 字`}</span>
                  <span>主写</span><span>{U.ai}</span>
                  <span>用语</span><span>{U.lang}</span>
                </>
              )}
            </div>
          </div>
          <div className="card2">
            <h4>进度</h4>
            <ol className="prog" id="prog">
              {v?.prog.map(([l, ok, s], i) => (
                <li key={i} className={ok ? 'ok' : ''}><StepNum n={i + 1} state={ok ? 'done' : ''} /><div>{l}<small>{s}</small></div></li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </>
  )
}

function SuppField({ k, l, ph, big, value, onInput }: { k: string; l: string; ph: string; big?: boolean; value: string; onInput(e: FormEvent<HTMLTextAreaElement>): void }) {
  return (
    <>
      <label className="fl">{l}{big && <>{' '}<span className="req">影响最大</span></>}</label>
      <textarea className="ta" data-f={k} placeholder={ph} defaultValue={value} onInput={onInput} />
    </>
  )
}

/** 撞题比对结果（旧 drawDup）。 */
function Dup({ U }: { U: WzSettings | null }) {
  const d = U?.dup
  if (!d) return <div className="dup" id="dupRes" />
  return (
    <div className={d.hits.length ? 'dup warn' : 'dup'} id="dupRes">
      {d.hits.length
        ? <>有 {d.hits.length} 部相近作品，写的时候会自动避开：<br />{d.hits.map((h, i) => <Fragment key={i}>{i > 0 && <br />}{`《${h.title}》相似度 ${Math.round(h.sim * 100)}%`}</Fragment>)}</>
        : d.n === 0 ? '✓ 没有撞题' : `✓ 已自动比对 ${d.n} 部作品，没有撞题`}
    </div>
  )
}

/** 第 1 步内容（旧 drawS1）：贴剧本、氛围写作的一句话、汇入小说。S 是重画时的设定快照。 */
interface StepOneProps {
  S: WzSettings
  docInfo: string
  novelInfo: string
  onText(k: Field): { onInput(e: FormEvent<HTMLTextAreaElement>): void }
  onFile(k: 'doc' | 'novel'): (e: ChangeEvent<HTMLInputElement>) => void
  onReadDoc(): void
  onStory(): void
}

/** 下载图标改成向上的箭头（旧 ico('dl').replace(...)）。 */
const UPLOAD_ICON = ICONS.dl.replace('M12 4v12m0 0-5-5m5 5 5-5', 'M12 20V8m0 0-5 5m5-5 5 5')

function StepOne({ S, docInfo, novelInfo, onText, onFile, onReadDoc, onStory }: StepOneProps) {
  const file = (k: 'doc' | 'novel') => (
    <label className="btn-o">
      <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: UPLOAD_ICON }} />或汇入文件（txt／md）
      <input type="file" accept=".txt,.md,text/plain,text/markdown" hidden data-file={k} onChange={onFile(k)} />
    </label>
  )
  if (S.mode === 'paste') {
    return (
      <>
        <textarea className="ta" data-f="doc" rows={8} placeholder="把剧本或策划文件贴在这里" defaultValue={S.doc} {...onText('doc')} />
        <div className="row" style={{ marginTop: 10 }}><button className="btn-o" id="readDoc" onClick={onReadDoc}>读取这份文件</button>{file('doc')}</div>
        <p className="hint" id="docInfo">{docInfo}</p>
      </>
    )
  }
  if (S.mode === 'auto') {
    const p = S.pitch.trim()
    return (
      <button className="story" id="story" onClick={onStory}>
        {p
          ? <><b>{'「'}{p}{'」'}</b><span><Icon name="pen" />改一改</span></>
          : <><b className="ph">说一句你的故事，例如：被退婚的假千金，靠读心系统在豪门翻盘</b><span><Icon name="pen" />去写</span></>}
      </button>
    )
  }
  return (
    <>
      <textarea className="ta" data-f="novel" rows={8} placeholder="把小说全文贴在这里（2,000–400,000 字）" defaultValue={S.novel} {...onText('novel')} />
      <div className="row" style={{ marginTop: 10 }}>{file('novel')}<span className="hint" id="novelInfo" style={{ margin: 0 }}>{novelInfo}</span></div>
    </>
  )
}
