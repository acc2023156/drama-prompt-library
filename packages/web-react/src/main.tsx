import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { API_BASE, DATA } from './data'

function BuildInfo() {
  return (
    <pre>
      {`天玑 React 重构（P0 占位）
entries: ${DATA.entries.length}
groups: ${DATA.groups.length}
api: ${API_BASE || '(同源)'}`}
    </pre>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BuildInfo />
  </StrictMode>,
)
