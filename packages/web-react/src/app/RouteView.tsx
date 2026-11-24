import { AdminPage } from '../features/account/AdminPage'
import { HotwordsPage } from '../features/account/HotwordsPage'
import { TrashPage } from '../features/account/TrashPage'
import { AssemblerPage } from '../features/assembler/AssemblerPage'
import { StoryboardEntry } from '../features/assembler/StoryboardEntry'
import { AssetEditorPage } from '../features/assets/AssetEditorPage'
import { AssetTrashPage } from '../features/assets/AssetTrashPage'
import { AssetsHomePage } from '../features/assets/AssetsHomePage'
import { MembershipPage } from '../features/membership/MembershipPage'
import { PartnerPage } from '../features/partner/PartnerPage'
import { ScriptHomePage } from '../features/pro-chat/ScriptHomePage'
import { ChangelogPage } from '../features/prompts/ChangelogPage'
import { PromptEntryPage } from '../features/prompts/PromptEntryPage'
import { PromptListPage } from '../features/prompts/PromptListPage'
import { ScriptFormPage } from '../features/script-form/ScriptFormPage'
import { SimpleHomePage } from '../features/simple/home/SimpleHomePage'
import { SimpleResultPage } from '../features/simple/result/SimpleResultPage'
import { WorkPage } from '../features/work/WorkPage'
import { isPro } from '../lib/storage'
import type { Route } from './routes'

/** 路由 → 页面：分派顺序同旧 route()（site-template.html 第 3682 行）。 */
export function RouteView({ route: r }: { route: Route }) {
  if (r.view === 'start') return <SimpleHomePage />
  if (r.view === 'membership') return <MembershipPage />
  if (r.view === 'admin') return <AdminPage />
  if (r.view === 'hotwords') return <HotwordsPage />
  if (r.view === 'trash') return <TrashPage />
  if (r.view === 'entry') return <PromptEntryPage id={r.id!} />
  if (r.view === 'assembler') return <AssemblerPage ep={r.ep} />
  if (r.view === 'tool' && r.tool === 'assets') return r.trash ? <AssetTrashPage /> : r.fn ? <AssetEditorPage fn={r.fn} idx={r.idx ?? null} /> : <AssetsHomePage />
  if (r.view === 'tool' && r.tool === 'script') {
    if (r.sub === 'result') return <SimpleResultPage sid={r.sid!} fresh={!!r.fresh} />
    if (r.sub === 'vibe') return <WorkPage wid={r.wid!} vtab={r.vtab} />
    if (!isPro()) return <SimpleHomePage />
    return r.sub ? <ScriptFormPage wid={r.wid} /> : <ScriptHomePage />
  }
  // 旧 viewTool(k)：TOOLS 只有 storyboard 会走到这里；TOOLS 原型链上的键（如 #/constructor）旧页面渲染时抛异常、保留上一页，这里不渲染
  if (r.view === 'tool') return r.tool === 'storyboard' ? <StoryboardEntry /> : null
  if (r.view === 'partner') return <PartnerPage />
  if (r.view === 'changelog') return <ChangelogPage />
  return <PromptListPage folder={r.folder} home={r.view === 'home'} />
}
