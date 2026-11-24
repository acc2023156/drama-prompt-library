import { useState } from 'react'
import { toast } from '../../lib/toast'
import { BILLING_LINKS, BILLING_TABS, COMPARE_COLS, COMPARE_SECTIONS, DEFAULT_BILLING_TAB, PLANS, flashDays, monthlyPrice } from './plans'

/** 点击“购买 / 选择方案”只弹提示，没有支付接口。 */
const onPlan = (name: string) => toast(name === 'Free' ? '当前为免费计划' : `已选择${name}，支付功能暂未开放`)

/** 关闭会员页：有历史就后退，否则回首页（同旧页面）。 */
const closePage = () => {
  if (history.length > 1) history.back()
  else location.hash = '#/'
}

/** 会员价格页（全屏覆盖层，静态展示，对应旧 viewMembership）。 */
export function MembershipPage() {
  const [tab, setTab] = useState(DEFAULT_BILLING_TAB)
  return (
    <section className="membership-page">
      <button className="membership-close" id="membershipClose" aria-label="关闭" onClick={closePage}>
        ×
      </button>
      <div className="membership-inner">
        <h1 className="membership-title">订阅天玑会员，畅享专业 AI 创作能力</h1>
        <div className="billing-row">
          <div className="billing-tabs" id="billingTabs">
            {BILLING_TABS.map((t, i) => (
              <button
                key={t.label}
                className={[i === tab ? 'on' : '', t.hot ? 'hot' : ''].filter(Boolean).join(' ') || undefined}
                onClick={() => {
                  setTab(i)
                  toast('已切换计费周期')
                }}
              >
                {t.label}
                {t.hint && (
                  <>
                    {' '}
                    <small>{t.hint}</small>
                  </>
                )}
              </button>
            ))}
          </div>
          <div className="billing-links">
            {BILLING_LINKS.map((l, i) => (
              <button key={l} className={i ? undefined : 'on'}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="plans">
          {PLANS.map((p) => (
            <article className={p.cls ? `plan ${p.cls}` : 'plan'} key={p.name}>
              {p.ribbon && <div className="plan-ribbon">{p.ribbon}</div>}
              <div className="plan-body">
                <h2>{p.name}</h2>
                <div className="plan-price">
                  <span>¥</span>
                  <b>{p.price}</b>
                  <span>每季</span>
                  <s>{`¥${p.old}`}</s>
                </div>
                <div className="plan-note">
                  {`折算 ¥${monthlyPrice(p.price)}/月`}
                  <br />
                  {p.note}
                </div>
                <div className="plan-points">
                  <b>{`✦ ${p.points} 积分每月`}</b>
                  <span>{p.rate}</span>
                </div>
                <button className="buy-plan" data-plan={p.name} onClick={() => onPlan(p.name)}>
                  {`¥${p.price} 首季优惠`}
                </button>
                <div className="plan-benefits">
                  {p.benefits.map((x) => (
                    <span key={x}>{x}</span>
                  ))}
                </div>
                <div className="plan-extra">
                  <b>无限生成权益 ⓘ</b>
                  <p>Seedream 5.5{'\u3000'}2K{'\u3000'}30 天无限</p>
                  <p>{`Seedream 5.0 Flash\u30002K\u3000${flashDays(p)} 天无限`}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="compare">
          <h2>哪个计划更适合你</h2>
          <div className="compare-scroll">
            <div className="compare-grid">
              <div className="compare-head">
                <span></span>
                {COMPARE_COLS.map((c, i) => (
                  <div className="compare-plan" key={c}>
                    <b>{c}</b>
                    <strong>
                      {`¥${i ? PLANS[i - 1].price : '0'} `}
                      <small>{i ? '每季' : '每月'}</small>
                    </strong>
                    <button data-plan={c} onClick={() => onPlan(c)}>
                      {i ? '选择方案' : '当前计划'}
                    </button>
                  </div>
                ))}
              </div>
              {COMPARE_SECTIONS.map((s) => (
                <Section key={s.title} title={s.title} rows={s.rows} />
              ))}
            </div>
          </div>
        </div>
        <p className="membership-foot">订阅积分每 31 天进行重置</p>
      </div>
    </section>
  )
}

function Section({ title, rows }: { title: string; rows: [string, string[]][] }) {
  return (
    <>
      <div className="compare-section">{title}</div>
      {rows.map(([label, vals]) => (
        <div className="compare-row" key={label}>
          <span>{label}</span>
          {vals.map((v, i) => (
            <span className={v === '✓' ? 'yes' : ''} key={i}>
              {v}
            </span>
          ))}
        </div>
      ))}
    </>
  )
}
