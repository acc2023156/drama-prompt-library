import { loadDataJson } from '../../plugins/load-data'

let cached: unknown
/** build.py data 的内容（对象），整个测试进程只生成一次。 */
export function loadData(): any {
  return (cached ??= JSON.parse(loadDataJson()))
}
