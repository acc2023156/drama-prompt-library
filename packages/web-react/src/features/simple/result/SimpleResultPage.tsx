import { NotImplemented } from '../../../components/NotImplemented'

export interface SimpleResultPageProps {
  sid: string
  /** #/script/s/:id?new=1：刚产出 */
  fresh: boolean
}

/** 占位（P3-B 实现）：对应旧 viewScriptResult。 */
export function SimpleResultPage(_props: SimpleResultPageProps) {
  return <NotImplemented title="标准版结果" pkg="P3-B" />
}
