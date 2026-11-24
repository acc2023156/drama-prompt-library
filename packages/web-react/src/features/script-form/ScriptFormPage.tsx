import { NotImplemented } from '../../components/NotImplemented'

export interface ScriptFormPageProps {
  /** #/script/w/:wid 编辑已有作品；不传为新增 */
  wid?: string
}

/** 占位（P4-C 实现）：对应旧 viewScriptNew。 */
export function ScriptFormPage(_props: ScriptFormPageProps) {
  return <NotImplemented title="新增作品" pkg="P4-C" />
}
