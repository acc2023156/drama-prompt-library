import { NotImplemented } from '../../components/NotImplemented'

export interface AssetEditorPageProps {
  fn: string
  /** #/assets/:fn?i=<n>：编辑“我的资产”第 n 个；null 为新建 */
  idx: number | null
}

/** 占位（P4-D 实现）：对应旧 viewAssetEditor。 */
export function AssetEditorPage(_props: AssetEditorPageProps) {
  return <NotImplemented title="资产编辑" pkg="P4-D" />
}
