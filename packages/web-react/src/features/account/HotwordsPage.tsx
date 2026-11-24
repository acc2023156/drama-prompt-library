import { type CSSProperties, useEffect, useState } from 'react'
import { BackBar } from '../../components/BackBar'
import { getPublic } from '../../lib/api'
import { get, set } from '../../lib/storage'
import { toast } from '../../lib/toast'

interface HotWord {
  word: string
  cat?: string
  heat?: number
  trend?: string
}
interface WordsReply {
  words?: HotWord[]
  at?: string
}

/** 旧 chatState（1585）：默认值在前、存储值覆盖，键顺序决定写回 pl.chat 的 JSON 文本，不能换写法。 */
function chatState(): Record<string, unknown> {
  return Object.assign({ tab: 'auto', doc: '', pitch: '', novel: '', editing: false, style: '无', ratio: '9:16', ai: 'Claude' }, get('chat') || {})
}

const CAT_STYLE = { '--a': '#ff4d6d', '--b': '#ffb547' } as CSSProperties

/** 热词（旧 viewHotwords，3368）：词根、分类、热度、走势；点一个词就带进氛围写作。 */
export function HotwordsPage() {
  // undefined = 读取中；null = 读取失败
  const [reply, setReply] = useState<WordsReply | null | undefined>(undefined)
  const [cat, setCat] = useState('全部')

  useEffect(() => {
    let alive = true
    getPublic<WordsReply>('/words').then((j) => {
      if (alive) setReply(j)
    })
    return () => {
      alive = false
    }
  }, [])

  const W = reply?.words || []
  const top = Math.max(1, ...W.map((w) => w.heat || 0))
  const cats = ['全部', ...new Set(W.map((w) => w.cat).filter(Boolean) as string[])]
  const list = cat === '全部' ? W : W.filter((w) => w.cat === cat)

  // 点词条：把一句起手话写进 PRO 对话框草稿，清掉作品卡，打开 PRO，回到剧本首页。
  // 起手话两侧是旧页面写的直角引号（U+300C、U+300D），写进 pl.chat 的文本必须与旧页面一致，所以用转义。
  const pick = (word: string) => {
    set('chat', { ...chatState(), tab: 'auto', pitch: `以\u300c${word}\u300d为题材，` })
    set('vibeCard', null)
    set('pro', true)
    location.hash = '#/script'
    toast('补完这句故事就能开写')
  }

  return (
    <>
      <BackBar href="#/" />
      <div className="sec-head" style={{ marginTop: 56 }}>
        <h2>热词</h2>
        <span className="meta" id="hwMeta">
          {reply === undefined ? '读取中…' : reply === null ? '暂时读不到，稍后再试' : `${W.length} 个 · ${reply.at || ''} 更新`}
        </span>
      </div>
      <div className="hw" id="hwBody">
        {reply ? (
          <>
            {cats.length > 2 && (
              <div className="hseg hw-cats">
                {cats.map((k) => (
                  <button key={k} data-c={k} className={k === cat ? 'on' : ''} style={CAT_STYLE} onClick={() => setCat(k)}>
                    {k}
                  </button>
                ))}
              </div>
            )}
            <div className="hw-list">
              {list.map((w, i) => (
                <button key={i} className="hw-row" data-w={w.word} onClick={() => pick(w.word)}>
                  <i>{String(i + 1).padStart(2, '0')}</i>
                  <b>{w.word}</b>
                  {w.trend ? <em className="hw-t">{w.trend}</em> : null}
                  <span className="hw-bar">
                    <s style={{ width: `${Math.round(((w.heat || 0) / top) * 100)}%` }} />
                  </span>
                  <strong>{w.heat || 0}</strong>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}
