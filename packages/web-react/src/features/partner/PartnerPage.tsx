import { type MouseEvent, type ReactNode, useRef } from 'react'
import { BackBar } from '../../components/BackBar'
import { Icon } from '../../components/Icon'
import { StepNum } from '../../components/StepNum'
import { PartnerBanner } from './PartnerBanner'

/** 评审维度 [名称, 说明]。 */
const CRITERIA: [string, string][] = [
  ['时长标准', '开放赛道需是 20 分钟以上、内容完整的连续故事；IP 赛道需 60 分钟以上。'],
  ['故事与剧作', '主题明确、结构完整、冲突合理、节奏顺畅。要“剧作成立”，不是画面展示或设定堆砌。'],
  ['完整度与连载潜力', '世界观、人物关系、主线相对完整，有剧集意识，能持续看下去，也留得出后续空间。'],
  ['角色与情绪', '主要角色辨识度高、行为有逻辑，人物关系能推动剧情，让观众记得住、有情感连接。'],
  ['视听表达', '画风、镜头、色彩、光影、配乐、音效风格统一，并服务于故事和情绪。'],
  ['AI 技术成熟度', '人物与场景一致、动作与口型自然、画面稳定。技术为内容服务，不为炫技。'],
  ['观众喜爱与传播', '兼顾观看体验与传播潜力，参考观看时长、观看人数、追剧深度等数据。'],
]

/** 伙伴激励 [奖项, 部数, 万元]。 */
const PRIZES: [string, string, string][] = [
  ['一等奖', '1 部', '10'],
  ['二等奖', '10 部', '5'],
  ['三等奖', '20 部', '1'],
]

/** 报名流程 [步骤, 说明]。 */
const FLOW: [string, string][] = [
  ['用天玑创作', '剧本 → 资产库 → 分镜'],
  ['完成成片', '开放赛道 ≥ 20 分钟，IP 赛道 ≥ 60 分钟'],
  ['发布上线', '在合作播出平台上架，并带上计划话题'],
  ['填写报名表', '报名表开放后在此提供'],
]

const Ul = ({ items }: { items: ReactNode[] }) => (
  <ul className="pt-ul">
    {items.map((x, i) => (
      <li key={i}>{x}</li>
    ))}
  </ul>
)

const CreateButton = () => (
  <a className="magic" href="#/" style={{ textDecoration: 'none' }}>
    <Icon name="sparkle" />
    现在开始创作
  </a>
)

/** 天玑 AI短剧伙伴计划说明页（静态，对应旧 viewPartner）。 */
export function PartnerPage() {
  const joinRef = useRef<HTMLElement>(null)
  const onJoin = (e: MouseEvent) => {
    e.preventDefault()
    joinRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  return (
    <article className="pt">
      <BackBar />
      <section className="pt-hero">
        <PartnerBanner big />
        <div className="pt-cta">
          <CreateButton />
          <a className="btn-o" href="#pt-join" id="ptJoin" style={{ textDecoration: 'none' }} onClick={onJoin}>
            报名与评审
          </a>
        </div>
        <p className="pt-note">本页为天玑计划说明，报名表以正式公告为准。</p>
      </section>

      <section className="pt-sec">
        <h2>
          <StepNum n={1} state="on" />
          谁可以参加
        </h2>
        <Ul
          items={[
            <>
              以<b>个人身份</b>参加的原创创作者（机构不可用个人名义报名）。
            </>,
            <>
              作品需为<b>原创 AI 短剧</b>，不接受同人、衍生二创。
            </>,
            '用天玑完成剧本、资产、分镜，或只用其中一部分，都可以参加。',
          ]}
        />
      </section>

      <section className="pt-sec">
        <h2>
          <StepNum n={2} state="on" />
          两个赛道
        </h2>
        <div className="pt-cards">
          <div className="pt-card">
            <h3>开放赛道</h3>
            <Ul
              items={[
                '不限主题，自由原创。',
                '总时长 ≥ 20 分钟，单集 > 30 秒。',
                '续季作品（第一季在计划开始前已上线）可参加，综合得分 × 0.6。',
                '曾在其他平台播出、未在天玑投稿过的作品可参加，综合得分 × 0.8。',
              ]}
            />
          </div>
          <div className="pt-card">
            <h3>IP 赛道</h3>
            <Ul
              items={[
                '由计划提供 IP，选一个改编成 AI 短剧。',
                '总时长 ≥ 60 分钟，单集 > 30 秒。',
                <>
                  <b>潜力 IP</b>：所有创作者可选。
                </>,
                <>
                  <b>精品 IP</b>：开放给有爆款经验的创作者申请（AI 短剧上过热播榜，或 AI 短视频有百万级播放），评估通过后通知授权，每人最多 1 个。
                </>,
              ]}
            />
          </div>
        </div>
      </section>

      <section className="pt-sec">
        <h2>
          <StepNum n={3} state="on" />
          作品要求
        </h2>
        <div className="pt-cards three">
          <div className="pt-card">
            <h3>安全合规</h3>
            <p>内容符合法律法规与主管部门要求，不打色情擦边、不做标题党或封面党。</p>
          </div>
          <div className="pt-card">
            <h3>质量达标</h3>
            <p>主线明确、角色突出、剧情完整连贯、画质清晰，没有注水内容。</p>
          </div>
          <div className="pt-card">
            <h3>不含广告</h3>
            <p>剧中不得插入或植入任何广告、推广信息。</p>
          </div>
        </div>
        <p className="pt-mute">刷量、恶意投稿、夸大收益诱导模仿等行为，一经发现将取消资格并追回奖励。</p>
      </section>

      <section className="pt-sec">
        <h2>
          <StepNum n={4} state="on" />
          伙伴激励
        </h2>
        <div className="pt-prize">
          {PRIZES.map(([a, b, m], i) => (
            <div className={i ? 'pz' : 'pz top'} key={a}>
              <small>{`${a} · ${b}`}</small>
              <b>{`${m} 万`}</b>
              <span>
                {`保底收益 ${m} 万元`}
                <br />
                <em>{`+ ${m} 万天玑创作额度`}</em>
              </span>
            </div>
          ))}
        </div>
        <p className="pt-mute">
          终选从入围的 100 部作品中评出。保底收益以补差额方式发放：作品在计划期间的分成收入不足保底金额时补足，已超过则按实际分成。
        </p>
        <div className="pt-cards three">
          <div className="pt-card">
            <h3>双周榜 TOP10</h3>
            <p>每两周按内容质量与数据表现选出 10 部，额外赠送天玑创作额度；同一部作品最多入选 1 次。</p>
          </div>
          <div className="pt-card">
            <h3>流量扶持</h3>
            <p>符合条件的作品有机会获得合作平台的推广流量。</p>
          </div>
          <div className="pt-card">
            <h3>升级机会</h3>
            <p>优秀作品可升级为 IP、与专业团队共创，获得大规模宣发曝光，以及品牌商单撮合。</p>
          </div>
        </div>
      </section>

      <section className="pt-sec" id="pt-join" ref={joinRef}>
        <h2>
          <StepNum n={5} state="on" />
          报名与评审
        </h2>
        <div className="pt-flow">
          {FLOW.map(([a, b], i) => (
            <div className="st" key={a}>
              <StepNum n={i + 1} />
              <div>
                <b>{a}</b>
                <small>{b}</small>
              </div>
            </div>
          ))}
        </div>
        <p className="pt-quote">评审原则：故事优先，技术为叙事服务，完整胜过炫技。</p>
        <div className="pt-table">
          {CRITERIA.map(([a, b]) => (
            <div className="r" key={a}>
              <b>{a}</b>
              <span>{b}</span>
            </div>
          ))}
        </div>
        <p className="pt-mute">双周榜综合内容质量与播放数据，按前两周数据计算，每两周更新一次。</p>
      </section>

      <section className="pt-sec">
        <h2>
          <StepNum n={6} state="on" />
          权益与规则
        </h2>
        <Ul
          items={[
            <>
              <b>知识产权</b>：剧本、人设、画面、声音、音乐、字体、肖像等素材须为本人所有或已取得合法授权；如有侵权纠纷，由创作者自行承担。
            </>,
            <>
              <b>宣传授权</b>：参加即同意计划在活动专题中展示、推荐你的作品与昵称、头像。
            </>,
            <>
              <b>个人信息</b>：报名时填写的资料只用于本计划；可随时联系我们查询、修改或删除。未满 18 岁须在监护人同意下提交。
            </>,
            <>
              <b>公平规则</b>：同一身份的多个账号、手机号或设备视为同一位创作者；非现金激励不可转让；奖励依法代扣个人所得税。
            </>,
            <>
              <b>规则调整</b>：遇不可抗力等情况，计划可在法律允许范围内调整规则，并在本页更新。
            </>,
          ]}
        />
      </section>

      <section className="pt-end">
        <h2>让你的故事被全世界看见</h2>
        <CreateButton />
      </section>
    </article>
  )
}
