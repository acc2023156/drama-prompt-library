import { NotImplemented } from '../../components/NotImplemented'

export interface WorkPageProps {
  wid: string
  /** outline / script / assets / board / listing；地址里没有时为 undefined */
  vtab?: string
}

/** 占位（P5-B 实现）：对应旧 viewVibeScript。 */
export function WorkPage(_props: WorkPageProps) {
  return <NotImplemented title="作品" pkg="P5-B" />
}
