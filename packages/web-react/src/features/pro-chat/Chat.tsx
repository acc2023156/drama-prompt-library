import { type ChangeEvent, type DragEvent, type FormEvent, type ReactNode, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from '../../components/Icon'
import type { WzSettings } from '../../domain/types'
import { WZ_DEF, wzGuess } from '../../domain/wz'
import { depthOf } from '../../domain/yq'
import { nfmt } from '../../domain/text'
import { get, set } from '../../lib/storage'
import { toast } from '../../lib/toast'
import { RbIcon } from './card/options'
import { speechCtor, useMic } from '../../lib/speech'
import { ThinkSlider, thinkLabel } from './card/ThinkSlider'
import { WorkCard } from './card/WorkCard'
import { CONN, CTABS, type ChatState, RATIOS, chatState, styles } from './chat-data'
import { closePops, togglePop, usePopOpen } from './pops'
import { readAnyFile } from './read-file'

/**
 * PRO 对话框（旧 chatHtml / bindChat，site-template.html 第 1586–1733 行）：氛围写作、上传剧本、汇入小说三个页签，
 * 底栏风格、比例、思考强度与语音；氛围写作发送后输入区换成作品卡。
 * 旧页面只在 drawBody 时重画输入区（输入时只改计数与发送按钮），这里用 body 快照与 key 保持同样的重画时机。
 */

/** 输入区重画时取的快照（旧 drawBody 当时的判断）。 */
interface Body {
  rev: number
  /** paste 页签：已有正文（决定显示输入框与“清空”还是拖放区）。 */
  hasDoc: boolean
  /** auto 页签且 pl.vibeCard 有值：显示作品卡。 */
  card: WzSettings | null
}

export function Chat() {
  const C = useRef<ChatState>(null as unknown as ChatState)
  C.current ??= chatState()
  const [, render] = useState(0)
  const draw = () => render((n) => n + 1)
  const save = () => set('chat', C.current)
  const ok = () => {
    const c = C.current
    return c.tab === 'paste' ? c.doc.trim().length > 0 : c.tab === 'auto' ? c.pitch.trim().length > 0 : c.novel.trim().length >= 2000
  }

  const snap = (rev: number): Body => {
    const V = C.current.tab === 'auto' && get('vibeCard')
    return { rev, hasDoc: !!C.current.doc, card: V ? (Object.assign({}, WZ_DEF, V) as WzSettings) : null }
  }
  const [body, setBody] = useState<Body>(() => snap(0))
  const rev = useRef(0)
  // 发送按钮的 disabled 只在画输入区（非作品卡）与输入时更新，作品卡期间保持原值
  const [sendOff, setSendOff] = useState(() => !body.card && !ok())
  const [waking, setWaking] = useState(false)
  const speech = useState(() => !!speechCtor())[0]
  const mic = useMic()
  const cbody = useRef<HTMLDivElement>(null)

  /** 旧 drawBody()：重画页签与输入区，并停止正在进行的语音输入。 */
  function drawBody() {
    const b = snap(++rev.current)
    setBody(b)
    if (!b.card) {
      setSendOff(!ok())
      mic.stop()
    }
    draw()
  }

  function onText(k: 'doc' | 'pitch' | 'novel') {
    return (e: FormEvent<HTMLTextAreaElement>) => {
      C.current[k] = e.currentTarget.value
      save()
      setSendOff(!ok())
      draw()
    }
  }

  async function load(f: File | undefined) {
    if (!f) return
    toast('正在读取 ' + f.name)
    try {
      const t = (await readAnyFile(f)).trim()
      if (!t) throw new Error('没有读到文字')
      const c = C.current
      if (c.tab === 'novel') c.novel = t
      else {
        c.tab = 'paste'
        c.doc = t
        c.editing = true
      }
      save()
      flushSync(drawBody)
      toast(`已读取 ${nfmt(t.length)} 字`)
    } catch (err) {
      toast('读取失败：' + (err as Error).message)
    }
  }
  const onFile = (e: ChangeEvent<HTMLInputElement>) => load(e.target.files![0])

  function onMic() {
    let ta = cbody.current!.querySelector('textarea')
    if (!ta && C.current.tab === 'paste') {
      C.current.editing = true
      flushSync(drawBody)
      ta = document.getElementById('cDoc') as HTMLTextAreaElement | null
    }
    if (ta) {
      mic.listen(ta)
      ta.focus()
    }
  }

  function onSend() {
    if (!ok()) return
    const c = C.current
    if (c.tab === 'auto') {
      const pitch = c.pitch.trim(), g = wzGuess(pitch)
      set('vibeCard', Object.assign({}, WZ_DEF, { mode: 'auto', pitch, ai: c.ai, style: c.style, ratio: c.ratio, mins: 1, depth: depthOf(c) }, g, { hooks: g.hooks }) as never)
      flushSync(drawBody)
      document.getElementById('chat')!.querySelector('.cbox')!.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const d: Record<string, unknown> = Object.assign({}, get('scriptDraft') || {}, { mode: c.tab, ai: c.ai, style: c.style, ratio: c.ratio })
    if (c.tab === 'paste') d.doc = c.doc
    else d.novel = c.novel
    set('scriptDraft', d)
    toast('已带入新增作品')
    location.hash = '#/script/new'
  }

  const c = C.current
  const pick = (k: 'style' | 'ratio', v: string) => {
    c[k] = v
    save()
    closePops()
    draw()
  }
  const onDepth = (d: string) => {
    c.depth = d
    save()
    const vc = get('vibeCard')
    if (vc) {
      vc.depth = d
      set('vibeCard', vc)
    }
    draw()
  }

  return (
    <section className="chat" id="chat">
      <div className="cstat" id="cstat">
        <div className="cs-row">
          <a className="cs-btn" href="jubenconnector://start" id="cWake" onClick={() => { setWaking(true); setTimeout(() => setWaking(false), 10000) }}>{waking ? '启动中⋯' : '启动连接器'}</a>
        </div>
      </div>
      <div className="conn" id="conn">
        {CONN.map((x) => (
          <button key={x.v} className={`cn ${c.ai === x.v ? 'on' : ''}`} data-v={x.v} onClick={() => { c.ai = x.v; save(); draw() }}>{x.svg}{x.l}</button>
        ))}
      </div>
      <div className={body.card ? 'cbox vibe' : 'cbox'}>
        <div className="ctabs" id="ctabs">
          {CTABS.map((t) => (
            <button key={t.m} className={c.tab === t.m ? 'on' : ''} data-m={t.m} onClick={() => { c.tab = t.m; save(); drawBody() }}><Icon name={t.icon} />{t.l}</button>
          ))}
        </div>
        <div className="cbody" id="cbody" ref={cbody}>
          {body.card ? (
            <WorkCard key={body.rev} value={body.card} onChange={(keep) => set('vibeCard', keep as never)} onClose={() => { set('vibeCard', null); drawBody() }} />
          ) : (
            <ChatInput
              key={body.rev}
              c={c}
              hasDoc={body.hasDoc}
              onText={onText}
              onFile={onFile}
              onDrop={load}
              onPaste={() => {
                c.editing = true
                flushSync(drawBody)
                document.getElementById('cDoc')!.focus()
              }}
              onClear={() => {
                c.doc = ''
                c.editing = false
                save()
                drawBody()
              }}
            />
          )}
        </div>
        <div className="cfoot" style={body.card ? { display: 'none' } : undefined}>
          <Pop id="cStyle" btn={<><Icon name="palette" /><span>{c.style && c.style !== '无' ? c.style : '风格'}</span></>}>
            {styles().map((x) => (
              <button key={x.n} className={c.style === x.n ? 'on' : ''} data-v={x.n} onClick={() => pick('style', x.n)}><i style={{ background: x.g }} />{x.n}</button>
            ))}
          </Pop>
          <Pop id="cRatio" btn={<><RbIcon r={c.ratio} /><span>{c.ratio || '比例'}</span></>}>
            {RATIOS.map((r) => {
              const [a, b] = r.split(':').map(Number)
              return <button key={r} className={c.ratio === r ? 'on' : ''} data-v={r} onClick={() => pick('ratio', r)}><i className="rb" style={{ aspectRatio: `${a}/${b}` }} />{r}</button>
            })}
          </Pop>
          <Pop id="cThink" wrap="cpop-w think-w" cls="cbtn cthink" pop="cpop think-pop" stop btn={<><span>{thinkLabel(c.depth)}</span><Icon name="chev" /></>}>
            <ThinkSlider depth={c.depth} id="cThinkR" onPick={onDepth} />
          </Pop>
          {speech && <button className={mic.on ? 'cmic on' : 'cmic'} id="cMic" title="用说的" onClick={onMic}><Icon name="mic" /></button>}
          <button className="csend" id="cSend" disabled={sendOff} onClick={onSend}><Icon name="arrowUp" /></button>
        </div>
      </div>
    </section>
  )
}

/** 底栏的一个弹层按钮（旧 cStyle / cRatio / cThink 与对应的 *Pop）。stop：点弹层内部不关闭（思考强度滑杆）。 */
function Pop({ id, btn, children, wrap = 'cpop-w', cls = 'cbtn', pop = 'cpop', stop }: { id: string; btn: ReactNode; children: ReactNode; wrap?: string; cls?: string; pop?: string; stop?: boolean }) {
  const open = usePopOpen(id)
  return (
    <div className={wrap}>
      <button className={cls} id={id} onClick={(e) => { e.stopPropagation(); togglePop(id) }}>{btn}</button>
      <div className={open ? pop + ' open' : pop} id={id + 'Pop'} onClick={stop ? (e) => e.stopPropagation() : undefined}>{children}</div>
    </div>
  )
}

const fileBtn = (id: string, label: string, onFile: (e: ChangeEvent<HTMLInputElement>) => void) => (
  <label className="cpill"><Icon name="upload" />{label}<input type="file" id={id} hidden accept=".docx,.pdf,.txt,.md" onChange={onFile} /></label>
)

interface InputProps {
  c: ChatState
  hasDoc: boolean
  onText(k: 'doc' | 'pitch' | 'novel'): (e: FormEvent<HTMLTextAreaElement>) => void
  onFile(e: ChangeEvent<HTMLInputElement>): void
  onDrop(f: File | undefined): void
  onPaste(): void
  onClear(): void
}

/** 字数：剧本算原文长度，小说算去掉首尾空白后的长度并提示范围。 */
function cntText(c: ChatState, k: 'doc' | 'novel'): string {
  const n = k === 'doc' ? c.doc.length : c.novel.trim().length
  return nfmt(n) + ' 字' + (k === 'novel' && n && n < 2000 ? ' · 至少 2,000 字' : k === 'novel' && n > 400000 ? ' · 超过 400,000 字' : '')
}

/** 输入区（非作品卡）。每次 drawBody 用新的 key 重新挂载，与旧页面重写 innerHTML 一样换新元素。 */
function ChatInput({ c, hasDoc, onText, onFile, onDrop, onPaste, onClear }: InputProps) {
  const [over, setOver] = useState(false)
  if (c.tab === 'paste') {
    if (c.editing || hasDoc) {
      return (
        <>
          <textarea className="cta" id="cDoc" placeholder="把完整策划文件（作品资料卡、故事大纲、角色设计、分集大纲、分场大纲）贴在这里" defaultValue={c.doc} onInput={onText('doc')} />
          <div className="crow">
            {fileBtn('cFile', '或汇入文件（Word／PDF／txt／md）', onFile)}
            <span className="cnt">{cntText(c, 'doc')}</span>
            {hasDoc && <button className="cpill" id="cClr" onClick={onClear}>清空</button>}
          </div>
        </>
      )
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setOver(false)
      onDrop(e.dataTransfer.files[0])
    }
    return (
      <div className={over ? 'cdrop over' : 'cdrop'} id="cDrop" onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={drop}>
        <span className="cards3"><i /><i><b>剧本</b></i><em>+</em></span>
        <span className="crow" style={{ justifyContent: 'center' }}>{fileBtn('cFile', '上传剧本', onFile)}<button className="cpill" id="cPaste" onClick={onPaste}>粘贴文本</button></span>
        <span className="note">请确认剧本拥有合法版权，格式要求<span className="tip" title="Word（.docx）、PDF、.txt、.md；txt 用 UTF-8、GB18030、Big5 都读得了。也可以直接把文件拖进来。"><Icon name="info" /></span></span>
      </div>
    )
  }
  if (c.tab === 'auto') {
    return <textarea className="cta" id="cPitch" style={{ minHeight: 96 }} placeholder="一句话说说你的故事，如：被退婚的假千金，靠读心系统在豪门翻盘" defaultValue={c.pitch} onInput={onText('pitch')} />
  }
  const n = c.novel.trim().length
  return (
    <>
      <textarea className="cta" id="cNovel" placeholder="把小说全文贴在这里（2,000–400,000 字）" defaultValue={c.novel} onInput={onText('novel')} />
      <div className="crow">
        {fileBtn('cFile', '或选文件（Word／PDF／txt／md）', onFile)}
        <span className={n && (n < 2000 || n > 400000) ? 'cnt bad' : 'cnt'}>{cntText(c, 'novel')}</span>
      </div>
    </>
  )
}

