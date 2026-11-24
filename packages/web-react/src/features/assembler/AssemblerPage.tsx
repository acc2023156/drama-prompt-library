import { useEffect, useRef, useState } from 'react'
import { BackBar } from '../../components/BackBar'
import { Icon } from '../../components/Icon'
import { DATA } from '../../data'
import { OPT_INFO, assemble } from '../../domain/assembler'
import { copyText } from '../../lib/clipboard'
import { saveText } from '../../lib/download'
import { SITE } from '../../lib/site'
import { get, set } from '../../lib/storage'
import { toast } from '../../lib/toast'
import { type AsmInit, initAssembler, patchGroups } from './model'

export interface AssemblerPageProps {
  /** #/assembler?ep=<wid>.<i> 命中本地作品时为分镜编辑模式 */
  ep?: { wid: string; i: number }
}

/** “复制全部”：同 CopyButton（点击后 1.3 秒显示“已复制”），多带旧页面的 id，CopyButton 不支持传 id。 */
function CopyAll({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      className={done ? 'copy done' : 'copy'}
      id="cpAll"
      onClick={async () => {
        await copyText(text)
        setDone(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setDone(false), 1300)
      }}
    >
      {done ? (
        <>
          <Icon name="check" />
          已复制
        </>
      ) : (
        <>
          <Icon name="copy" />
          复制全部
        </>
      )}
    </button>
  )
}

/** 旧 viewAssembler：6.0 视频专用提示词组装器；带 ?ep= 时是某一集的分镜图编辑。 */
export function AssemblerPage({ ep }: AssemblerPageProps) {
  // 旧页面在渲染那一刻读一次存储，页面存在期间不随存储变化重画
  const [init] = useState(() => initAssembler(DATA.core, ep, { asm: get('asm'), asmW: get('asmW'), works: get('works') }))
  return init ? <AssemblerView init={init} /> : null
}

function AssemblerView({ init }: { init: AsmInit }) {
  const { work, epTxt, head } = init
  const core = DATA.core
  const styles = Object.keys(core.styles)
  const groups = patchGroups(SITE.entries)
  const [st, setSt] = useState(init.st)
  // 旧页面第一次画完之后的任何操作都把返回按钮变成“储存并返回”
  const [dirty, setDirty] = useState(false)
  const text = assemble(core, st, epTxt)

  const keep = () => {
    if (work) set('asmW', { ...(get('asmW') || {}), [work.id]: { style: st.style, custom: st.custom } })
    else set('asm', { style: st.style, custom: st.custom })
  }
  // 普通模式每次更新（含首次）都写 pl.asm；分镜编辑模式只在“储存并返回”时写 pl.asmW
  useEffect(() => {
    if (!work) keep()
  }, [st])

  const change = (patch: Partial<typeof st> | ((s: typeof st) => Partial<typeof st>)) => {
    setSt((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
    setDirty(true)
  }

  return (
    <>
      <BackBar
        href={work ? `#/script/v/${work.id}/board` : undefined}
        dirty={dirty}
        onSave={() => {
          keep()
          toast('已储存')
        }}
      />
      <div className="sec-head" style={{ marginTop: 56 }}>
        <h2>{head.title}</h2>
        <span className="meta">{head.meta}</span>
      </div>
      <div className="asm">
        <div>
          <div className="panel">
            <h4>统一视觉风格（第三部分）</h4>
            <span className="seg" id="sty">
              {styles.map((s) => (
                <button key={s} className={st.style === s ? 'on' : undefined} data-v={s} onClick={() => change({ style: s })}>
                  {s}
                </button>
              ))}
              <button className={st.style === '__custom' ? 'on' : undefined} data-v="__custom" onClick={() => change({ style: '__custom' })}>
                自定义
              </button>
            </span>
            <textarea
              className="style"
              id="customStyle"
              placeholder="粘贴这个项目的画风描述，会替换【三、统一视觉风格】的正文"
              style={{ display: st.style === '__custom' ? 'block' : 'none' }}
              value={st.custom}
              onChange={(e) => change({ custom: e.target.value })}
            />
          </div>
          <div className="panel">
            <h4>可选条款</h4>
            {Object.keys(core.options).map((o) => (
              <div className="toggle" key={o}>
                <div className="t">
                  <b>{o}</b>
                  <span>{OPT_INFO[o] || ''}</span>
                </div>
                <button
                  className={st.opts[o] ? 'sw on' : 'sw'}
                  data-o={o}
                  aria-label={o}
                  onClick={() => change((s) => ({ opts: { ...s.opts, [o]: !s.opts[o] } }))}
                />
              </div>
            ))}
            <div className="warn" id="optWarn" style={{ display: st.opts['成人内容'] ? 'block' : 'none' }}>
              已打开成人内容条款，请确认这是成人线项目。
            </div>
          </div>
          <div className="panel">
            <h4>可补进各部分的条目</h4>
            <div className="plist">
              {groups.map(([s, list]) =>
                list.map((e) => (
                  <a key={`${s}-${e.id}`} href={`#/e/${e.id}`}>
                    <span className="s">【{s}】</span>
                    <span>
                      {e.id} {e.title}
                    </span>
                  </a>
                )),
              )}
            </div>
          </div>
        </div>
        <div>
          <div className="code" style={{ margin: '0' }}>
            <div className="bar">
              <span id="stat">
                {text.length} 字 · 风格：{st.style === '__custom' ? '自定义' : st.style} · 可选条款：
                {Object.keys(st.opts)
                  .filter((k) => st.opts[k])
                  .join('、') || '无'}
              </span>
              <span className="sp" />
              <button className="btn-dark" id="dl" style={{ height: 30 }} onClick={() => saveText(text, '6.0视频专用提示词.txt')}>
                <Icon name="dl" />
                下载 .txt
              </button>
              <CopyAll text={text} />
            </div>
            <pre id="out" style={{ maxHeight: 'calc(100vh - 220px)' }}>
              {text}
            </pre>
          </div>
        </div>
      </div>
    </>
  )
}
