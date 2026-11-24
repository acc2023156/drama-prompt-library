import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { replaceHash } from '../../lib/nav'
import { get } from '../../lib/storage'
import { lastVibeWork } from './model'

/** 旧 TOOLS.storyboard 的说明与链接（顶栏三个入口里只有分镜还走占位页）。 */
const STORYBOARD = {
  label: '分镜',
  desc: '把剧本拆成分镜表，再组装成每集 4～6 段的视频提示词。',
  links: [
    ['06-video', '视频生成'],
    ['archive/04-storyboard', '分镜（归档）'],
  ],
}

/** 旧 viewTool('storyboard')：有氛围写作作品就替换到最近作品的分镜页，否则显示占位页。 */
export function StoryboardEntry() {
  const [last] = useState(() => lastVibeWork(get('works'), get('lastVibe')))
  useEffect(() => {
    if (last) replaceHash(`#/script/v/${last.id}/board`)
  }, [last])
  if (last) return null
  return (
    <section className="soon">
      <div className="big">
        <Icon name="play" />
      </div>
      <h1>{STORYBOARD.label}</h1>
      <p>
        {STORYBOARD.desc}
        <br />
        天玑的这个功能还在开发中，先用下面的精选提示词。
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        {STORYBOARD.links.map(([f, l]) => (
          <a className="btn-dark" href={`#/f/${f}`} key={f}>
            {l}
          </a>
        ))}
        <a className="btn-white" href="#/assembler">
          <Icon name="wand" />
          6.0 组装器
        </a>
      </div>
    </section>
  )
}
