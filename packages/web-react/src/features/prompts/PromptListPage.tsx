import { NotImplemented } from '../../components/NotImplemented'

export interface PromptListPageProps {
  /** 首页模式（#/prompts，旧 view:'home'）或某目录（#/f/:folder） */
  folder?: string
  home: boolean
}

/** 占位（P2-A 实现）：对应旧 viewList。 */
export function PromptListPage(_props: PromptListPageProps) {
  return <NotImplemented title="提示词" pkg="P2-A" />
}
