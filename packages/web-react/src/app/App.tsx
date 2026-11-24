import { ErrorBoundary } from './ErrorBoundary'
import { Layout } from './Layout'
import { RouteView } from './RouteView'
import { useRoute } from './useRoute'

/** 根组件：页面按 hashchange 次数重新挂载，与旧 route() 每次整页重画一致（页内临时状态不跨路由保留）。 */
export function App() {
  const { route, hash, rev } = useRoute()
  return (
    <Layout route={route} hash={hash} rev={rev}>
      <ErrorBoundary resetKey={rev}>
        <RouteView key={rev} route={route} />
      </ErrorBoundary>
    </Layout>
  )
}
