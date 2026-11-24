import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'

/** 相框 [left%, top%, width%, height%, 底色]，同旧 partnerBanner 的 frames。 */
const FRAMES: [number, number, number, number, string][] = [
  [4, 6, 15, 22, '#c9d6e3'],
  [22, 2, 12, 17, '#d8c9bd'],
  [38, 0, 13, 15, '#b9c7d4'],
  [58, 3, 12, 20, '#cfd9cf'],
  [75, 1, 13, 18, '#d9cfd9'],
  [88, 8, 11, 24, '#c4cfdb'],
]

/**
 * 伙伴计划横幅（旧 partnerBanner）。
 * 默认是指向 #/partner 的链接（标准版首页用）；big 是伙伴计划页头图：改成 div，且去掉“了解计划”按钮
 * （旧页面对 partnerBanner() 的结果做字符串替换得到的就是这个结构）。
 */
export function PartnerBanner({ big = false }: { big?: boolean }) {
  const body = (
    <>
      <svg className="pt-strings" viewBox="0 0 100 40" preserveAspectRatio="none">
        <path d="M0 6 Q25 20 50 8 T100 10" />
        <path d="M0 14 Q30 30 60 14 T100 18" />
      </svg>
      {FRAMES.map(([x, y, w, h, c], i) => (
        <i
          key={i}
          className="pt-fr"
          style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, '--c': c, transform: `rotate(${i % 2 ? 3 : -3}deg)` } as CSSProperties}
        />
      ))}
      <span className="pt-logo">
        <svg viewBox="0 0 40 40">
          <defs>
            <linearGradient id="ptlg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffd23f" />
              <stop offset=".45" stopColor="#3fb6ff" />
              <stop offset="1" stopColor="#7a5cff" />
            </linearGradient>
          </defs>
          <path d="M6 6 34 18 21 21 17 34Z" fill="url(#ptlg)" />
          <path d="M21 21 34 18 26 26Z" fill="#1e7fd6" opacity=".7" />
        </svg>
      </span>
      <span className="pt-txt">
        <b>
          天玑
          <br />
          AI短剧伙伴计划
        </b>
        <em>让你的故事被全世界看见</em>
      </span>
    </>
  )
  if (big) {
    return (
      <div className="pt-banner big" aria-label="天玑 AI短剧伙伴计划">
        {body}
      </div>
    )
  }
  return (
    <a className="pt-banner" href="#/partner" aria-label="天玑 AI短剧伙伴计划">
      {body}
      <span className="pt-go">
        了解计划 <Icon name="arrowUp" />
      </span>
    </a>
  )
}
