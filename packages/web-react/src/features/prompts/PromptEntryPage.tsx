import { Icon } from '../../components/Icon'
import { CopyButton } from '../../components/CopyButton'
import { Markdown } from '../../components/Markdown'
import { firstCode } from '../../domain/library'
import { SITE } from '../../lib/site'
import { Tags } from './parts'

export interface PromptEntryPageProps {
  id: string
}

/** 提示词详情：旧 viewEntry（site-template.html 第 3553 行）。 */
export function PromptEntryPage({ id }: PromptEntryPageProps) {
  const e = SITE.byId.get(id)
  // 旧 byId 是普通对象：#/e/constructor 取到原型上的函数，渲染时抛 TypeError，页面停在上一页；这里统一显示“找不到”
  if (!e) return <div className="empty">找不到这条提示词</div>
  const sib = SITE.inFolder(e.folder)
  const i = sib.indexOf(e)
  const prev = sib[i - 1]
  const next = sib[i + 1]
  const prompt = firstCode(e.body)
  return (
    <article className="detail">
      <div className="crumb">
        <a href="#/prompts">全部</a>›<a href={'#/f/' + e.folder}>{String(SITE.groupLabel[e.folder] || e.folder)}</a>›<span>{e.id}</span>
      </div>
      <h1>{`${e.id}　${e.title}`}</h1>
      <div className="tags">
        <Tags e={e} full />
      </div>
      <div className="row" style={{ marginBottom: 20 }}>
        {prompt && (
          <CopyButton text={prompt} className="btn-white">
            <Icon name="copy" />
            复制提示词正文
          </CopyButton>
        )}
        {e.id === '6.0' && (
          <a className="btn-dark" href="#/assembler">
            <Icon name="wand" />
            在组装器里调整
          </a>
        )}
        <span className="tag tool" style={{ alignSelf: 'center' }}>
          {e.path}
        </span>
      </div>
      <div className="md" id="md">
        <Markdown md={e.body} />
      </div>
      <div className="pager">
        {prev ? (
          <a href={'#/e/' + prev.id}>
            <small>上一条</small>
            {`${prev.id} ${prev.title}`}
          </a>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        {next ? (
          <a className="r" href={'#/e/' + next.id}>
            <small>下一条</small>
            {`${next.id} ${next.title}`}
          </a>
        ) : (
          <span style={{ flex: 1 }} />
        )}
      </div>
    </article>
  )
}
