import { NotImplemented } from '../../components/NotImplemented'

export interface AssemblerPageProps {
  /** #/assembler?ep=<wid>.<i> 命中本地作品时为分镜编辑模式 */
  ep?: { wid: string; i: number }
}

/** 占位（P2-B 实现）：对应旧 viewAssembler。 */
export function AssemblerPage(_props: AssemblerPageProps) {
  return <NotImplemented title="6.0 组装器" pkg="P2-B" />
}
