import type { ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { listingClean, listingPrompt, listingText, lstDay } from '../../../domain/listing'
import type { Listing, Work } from '../../../domain/types'
import { WZ_DEF } from '../../../domain/wz'
import { heatOf, parseJSON, YQ_HOT, YQ_WRITE } from '../../../domain/yq'
import { authGet } from '../../../lib/auth'
import { saveBlob } from '../../../lib/download'
import { get, set } from '../../../lib/storage'
import { toast } from '../../../lib/toast'
import { openLogin } from '../../../lib/ui'
import { listingSources, yqChat } from '../../writing'
import { CopyBtn } from '../CopyBtn'
import { isListingBusy, setListingBusy } from '../listing-busy'
import { safeName } from '../model'

const Chip = ({ t, cls }: { t: string; cls?: string }) => <span className={`ui-tag ${cls || ''}`}>{t}</span>

function Row({ k, cp, children }: { k: ReactNode; cp: string | null; children: ReactNode }) {
  return (
    <div className="lst-r">
      <b>{k}</b>
      <div>{children}</div>
      {cp != null && (
        <CopyBtn className="ui-btn secondary" data-lcp={cp} text={cp}>
          <Icon name="copy" />
          复制
        </CopyBtn>
      )}
    </div>
  )
}

/**
 * 上架资料：拉热词热点（listingSources）→ 写作模型生成（yqChat，2500 tokens）→ listingClean 过滤红线词 → 写回作品的 listing。
 * 未登录点生成只打开登录面板；生成中按钮禁用，结果写回后 onSaved 通知页面更新作品。
 */
export function ListingTab({ w, onSaved }: { w: Work; onSaved: (L: Listing) => void }) {
  const d = w.gen && w.gen.data, L = w.listing, busy = isListingBusy(w.id)
  if (!d || !d.outline || !d.outline.length) return <div className="empty">大纲写好后才能生成上架资料。</div>
  const go = async () => {
    if (!authGet()) {
      openLogin()
      return
    }
    setListingBusy(w.id, true)
    try {
      const W2 = Object.assign({}, WZ_DEF, w.W), src = await listingSources(heatOf(W2))
      const raw = await yqChat(heatOf(W2) === '高尺度' ? YQ_HOT : YQ_WRITE, listingPrompt(w, d, src), 2500)
      const data = listingClean(parseJSON(raw))
      if (!data.titles.length || !data.intro) throw new Error('上架资料没生成完整')
      const list = get('works') || [], me = list.find((x) => x.id === w.id), listing: Listing = { at: Date.now(), wordsAt: src.at, data }
      onSaved(listing)
      if (me) {
        me.listing = listing
        set('works', list)
      }
      toast('上架资料已生成')
    } catch (e) {
      const m = (e as Error).message
      toast(/登录|积分/.test(m) ? m : '没生成成功，再试一次')
    }
    setListingBusy(w.id, false)
  }
  const goBtn = (cls: string, idle: ReactNode) => (
    <button className={cls} id="lstGo" disabled={busy} onClick={go}>
      {busy ? (
        <>
          <span className="gw-spin" />
          正在生成…
        </>
      ) : (
        idle
      )}
    </button>
  )
  if (!L)
    return (
      <div className="empty">
        {goBtn('ui-btn primary', <><Icon name="sparkle" />生成上架资料</>)}
      </div>
    )
  const x = L.data
  return (
    <div className="lst">
      <Row k="片名候选" cp={x.titles.map((t) => t.t).join('\n')}>
        {x.titles.map((t, i) => (
          <p key={i}>
            {t.t}
            {t.kw ? <> <Chip t={t.kw} cls="mode" /></> : null}
          </p>
        ))}
      </Row>
      <Row k="一句话简介" cp={x.oneLine}>
        <p>{x.oneLine}</p>
      </Row>
      <Row k="介绍" cp={x.intro}>
        <p>{x.intro}</p>
      </Row>
      <Row k="常青标签" cp={x.tags.evergreen.join(' ')}>
        {x.tags.evergreen.map((t, i) => <Chip key={i} t={t} cls="mode" />)}
      </Row>
      <Row k={<>时效标签<small>{lstDay(L)} 热词 · 上架前换新</small></>} cp={x.tags.timely.join(' ')}>
        {x.tags.timely.length ? x.tags.timely.map((t, i) => <Chip key={i} t={t} cls="hot" />) : <p className="mute">—</p>}
      </Row>
      <Row k="短尾词" cp={null}>
        {x.keywords.short.map((t, i) => <Chip key={i} t={t} />)}
      </Row>
      <Row k="长尾词" cp={null}>
        {x.keywords.long.map((t, i) => <Chip key={i} t={t} />)}
      </Row>
      <div className="lst-act">
        {goBtn('ui-btn ghost', <><Icon name="dice" />重新生成</>)}
        <button className="ui-btn secondary" id="lstDl" onClick={() => saveBlob(new Blob(['﻿' + listingText(w)], { type: 'text/plain;charset=utf-8' }), `${safeName(w.title, '作品')}-上架资料.txt`)}>
          <Icon name="dl" />
          下载 .txt
        </button>
        <CopyBtn className="ui-btn primary" id="lstCp" text={() => listingText(w)}>
          <Icon name="copy" />
          复制全部
        </CopyBtn>
      </div>
    </div>
  )
}
