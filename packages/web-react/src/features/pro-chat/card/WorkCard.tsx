import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Icon } from '../../../components/Icon'
import type { WzSettings } from '../../../domain/types'
import { WZ_OPT, wzBuildWork, wzRollTitle } from '../../../domain/wz'
import { authGet } from '../../../lib/auth'
import { get, set } from '../../../lib/storage'
import { toast } from '../../../lib/toast'
import { openLogin } from '../../../lib/ui'
import { closePop, togglePop, usePopOpen } from '../pops'
import { CARD_PILLS, type CardMenu, type CardOption, type CardPill, QIXING, WC_SEEDS, cardMenus, qxSide } from './options'
import { speechCtor, useMic } from '../../../lib/speech'
import { ThinkSlider, thinkLabel } from './ThinkSlider'
import type { WorkCardProps } from './types'

/**
 * 氛围写作作品卡（旧 wcardHtml / bindWcard，site-template.html 第 1792–1869 行）：一句话 → 先猜好的设定 → 一键开写。
 * 设定 W 由外层持有，切换受众时整张卡重画（旧 root.innerHTML=wcardHtml(W) 后重新绑定），这里用 key 重新挂载。
 */
export function WorkCard({ value, onChange, onClose }: WorkCardProps) {
  const [W, setW] = useState<WzSettings>(() => ({ ...value, adult: true, dup: null }))
  const ref = useRef(W)
  const [rev, setRev] = useState(0)

  /** 旧 refresh()：写回 pl.vibeCard（去掉 dup）。 */
  const save = (next: WzSettings) => {
    ref.current = next
    setW(next)
    const { dup: _dup, ...keep } = next
    onChange(keep)
  }
  // 每次绑定（含重画）末尾的 refresh()
  useEffect(() => save(ref.current), [rev])

  return <CardBody key={rev} W={W} cur={ref} save={save} onClose={onClose} onRedraw={() => setRev((n) => n + 1)} />
}

interface BodyProps {
  W: WzSettings
  cur: { current: WzSettings }
  save(next: WzSettings): void
  onClose(): void
  onRedraw(): void
}

/** 输入框按内容长高（jsdom 里 scrollHeight 为 0，结果与旧页面同为 0px）。 */
function grow(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function CardBody({ W, cur, save, onClose, onRedraw }: BodyProps) {
  const root = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLInputElement>(null)
  const pitch = useRef<HTMLTextAreaElement>(null)
  const core = useRef<HTMLTextAreaElement>(null)
  // 只在画卡片时取一次：风格表、七星（按受众）、独家点子是否展开、按钮文字（开写后不重画）、是否有语音
  const [menus] = useState(() => cardMenus(W))
  const [goText] = useState(() => (W.id ? '继续写' : '开写'))
  const [ideaOpen] = useState(() => !!W.core.trim())
  const [speech] = useState(() => !!speechCtor())
  const pitchMic = useMic(), coreMic = useMic()

  useEffect(() => {
    requestAnimationFrame(() => root.current?.querySelectorAll<HTMLTextAreaElement>('textarea.wc-story').forEach(grow))
  }, [])

  const edit = (k: 'title' | 'pitch' | 'core') => (e: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const el = e.currentTarget
    if (el.tagName === 'TEXTAREA') grow(el as HTMLTextAreaElement)
    save({ ...cur.current, [k]: el.value })
  }

  function pick(k: CardPill, o: CardMenu, it: CardOption) {
    const next = { ...cur.current, [k]: o.num ? +it.v : String(it.v) } as WzSettings
    closePop('dd:' + k)
    if (k === 'aud') {
      const Q = QIXING[qxSide(next)]
      if (!Q.role.includes(next.qxRole as string)) next.qxRole = ''
      if (!Q.mode.includes(next.qxMode as string)) next.qxMode = ''
      save(next)
      onRedraw()
      return
    }
    save(next)
  }

  function seed(s: string) {
    const el = core.current!
    const t = el.value.replace(/\s+$/, '')
    el.value = (t ? t + '\n' : '') + s
    grow(el)
    save({ ...cur.current, core: el.value })
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }

  function dice() {
    const el = title.current!
    el.value = wzRollTitle(cur.current, el.value)
    save({ ...cur.current, title: el.value })
  }

  function depth(d: string) {
    const next = { ...cur.current, depth: d }
    const C = get('chat') || {}
    C.depth = d
    set('chat', C)
    save(next)
  }

  function start() {
    if (!authGet()) {
      openLogin()
      toast('输入手机号就能开写')
      return
    }
    const next = { ...cur.current, ai: ((get('chat') || {}).ai as string) || cur.current.ai }
    const { list, item } = wzBuildWork(get('works') || [], next, 'vibe', Date.now())
    set('works', list)
    next.id = item.id
    save(next)
    location.hash = '#/script/v/' + item.id
  }

  const think = (
    <div className="cpop-w think-w wc-think">
      <button className="cbtn cthink" data-think="" onClick={(e) => { e.stopPropagation(); togglePop('card:think') }}>
        <span>{thinkLabel(W.depth)}</span><Icon name="chev" />
      </button>
      <ThinkPop depth={W.depth} onPick={depth} />
    </div>
  )
  const pitchBox = (
    <textarea ref={pitch} className={speech ? 'wc-story has-mic' : 'wc-story'} data-c="pitch" rows={2} placeholder="说一句你的故事" defaultValue={W.pitch} onInput={edit('pitch')} />
  )

  return (
    <div ref={root} className={speech ? 'wcard' : 'wcard has-think'}>
      <button className="wc-x" data-x="" title="回到输入" onClick={onClose}><Icon name="x" /></button>
      <div className="wc-title">
        《<input ref={title} data-c="title" placeholder="AI 帮你取剧名" defaultValue={W.title} onInput={edit('title')} />》
        <button className="wc-dice" data-dice="" title="帮我取一个" onClick={dice}><Icon name="dice" /></button>
      </div>
      {speech ? (
        <div className="mic-w has-think">
          {pitchBox}
          <button type="button" className={pitchMic.on ? 'wc-mic on' : 'wc-mic'} title="用说的" onClick={(e) => { e.preventDefault(); pitchMic.listen(pitch.current) }}><Icon name="mic" /></button>
          {think}
        </div>
      ) : pitchBox}
      <div className="wc-pills">
        {CARD_PILLS.map((k) => <Pill key={k} k={k} o={menus[k]} v={W[k]} onPick={pick} />)}
      </div>
      <div className="chips wc-hooks">
        {WZ_OPT.hooks.map((h) => (
          <span
            key={h}
            className={`ck ${W.hooks.includes(h) ? 'on' : ''}`}
            data-h={h}
            onClick={() => {
              const hooks = cur.current.hooks
              save({ ...cur.current, hooks: hooks.includes(h) ? hooks.filter((x) => x !== h) : [...hooks, h] })
            }}
          >{h}</span>
        ))}
      </div>
      <details className="wc-idea" open={ideaOpen}>
        <summary className="wc-idea-h"><Icon name="sparkle" />你的独家点子，让这部与众不同<Icon name="chev" /></summary>
        <div className="wc-seeds">
          {WC_SEEDS.map((x) => <button key={x} className="wc-seed" data-seed={x} onClick={() => seed(x)}>{x}…</button>)}
        </div>
        <div className="wc-say">
          <textarea ref={core} className="wc-story" data-c="core" rows={2} placeholder="想到什么写什么，没想好也没关系" defaultValue={W.core} onInput={edit('core')} />
          {speech && <button className={coreMic.on ? 'wc-mic on' : 'wc-mic'} data-mic="" title="用说的" onClick={(e) => { e.preventDefault(); coreMic.listen(core.current, '\n') }}><Icon name="mic" /></button>}
        </div>
      </details>
      <button className="bigbtn wc-go" disabled={!W.pitch.trim()} onClick={start}><Icon name="sparkle" />{goText}</button>
      {!speech && think}
    </div>
  )
}

function ThinkPop({ depth, onPick }: { depth: string | undefined; onPick(d: string): void }) {
  const open = usePopOpen('card:think')
  return (
    <div className={open ? 'cpop think-pop open' : 'cpop think-pop'} data-thinkpop="" onClick={(e) => e.stopPropagation()}>
      <ThinkSlider depth={depth} onPick={onPick} />
    </div>
  )
}

/** 一个下拉：按钮显示当前值，弹层列出选项（旧 wcardHtml 的 dd(k)）。 */
function Pill({ k, o, v, onPick }: { k: CardPill; o: CardMenu; v: unknown; onPick(k: CardPill, o: CardMenu, it: CardOption): void }) {
  const open = usePopOpen('dd:' + k)
  const sel = o.items.find((x) => String(x.v) === String(v))
  const lab = o.label ? o.label(v) : sel ? sel.l : v
  return (
    <div className="cpop-w">
      <button className="psel" data-dd={k} onClick={(e) => { e.stopPropagation(); togglePop('dd:' + k) }}>
        {o.lead?.(v)}<span>{String(lab)}</span><Icon name="chev" />
      </button>
      <div className={open ? 'cpop down open' : 'cpop down'} data-menu={k}>
        {o.items.map((x) => (
          <button key={String(x.v)} className={String(x.v) === String(v) ? 'on' : ''} data-v={String(x.v)} onClick={(e) => { e.stopPropagation(); onPick(k, o, x) }}>
            {x.ic}{x.l}
          </button>
        ))}
      </div>
    </div>
  )
}
