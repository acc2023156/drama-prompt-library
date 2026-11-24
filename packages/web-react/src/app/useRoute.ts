import { useMemo } from 'react'
import { useHashState } from '../lib/nav'
import { SITE } from '../lib/site'
import { get } from '../lib/storage'
import { type Route, type RouteDeps, parseRoute } from './routes'

/** 页面依赖：提示词目录来自内嵌数据，作品来自 pl.works（同旧 parse 读取时机：每次 hashchange）。 */
export const siteRouteDeps: RouteDeps = {
  entryFolder: (id) => SITE.byId.get(id)?.folder,
  findWork: (id) => (get('works') || []).find((x) => x.id === id),
}

export function useRoute(): { route: Route; hash: string; rev: number } {
  const { hash, rev } = useHashState()
  const route = useMemo(() => parseRoute(hash, siteRouteDeps), [hash, rev])
  return { route, hash, rev }
}
