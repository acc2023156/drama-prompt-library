import { Markdown } from '../../components/Markdown'
import { DATA } from '../../data'

/** 更新记录：旧 viewDoc('更新记录', DATA.changelog)，去掉第一行 “# 标题”。 */
export function ChangelogPage() {
  return (
    <article className="detail">
      <div className="crumb">
        <a href="#/prompts">全部</a>›<span>更新记录</span>
      </div>
      <h1>更新记录</h1>
      <div className="md" id="md">
        <Markdown md={DATA.changelog.replace(/^# .*\n/, '')} />
      </div>
    </article>
  )
}
