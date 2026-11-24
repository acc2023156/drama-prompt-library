import { WZ_DEF, wzMins } from './wz'
import { heatOf, YQ_RULES } from './yq'
import type { GenData, Listing, ListingData, Work, WzSettings } from './types'

/** 上架资料：给生产单位上架短剧平台用。常青词放标题与固定标签；时效词标抓取日期，上架前换新。拉取热词热点的请求（listingSources）归写作引擎。 */
export const KW_STOP=new Set('一位 一个 不会 几乎 这种 那种 多次 支持 感谢 项目 真实 日常 大人 主动 宣传 粉丝 耐心 爱心 温柔 社区 我们 他们 什么 没有 这样 怎么 第一次 捐助 市值 加密 日本 大哥'.split(' '));
// 红线与站名：未成年、亲属关系、非自愿、别家平台与品牌，一律不进上架资料
export const KW_BLOCK=/jav|avhub|七猫|番茄|红果|抖音|快手|女优|\bav\b|学生|校园|少女|萝莉|未成年|初中|高中|幼|童|孩子|儿子|女儿|妈妈|母亲|母女|母子|义母|义父|继母|继父|养母|养父|父女|父子|兄妹|姐弟|表哥|表姐|表妹|堂哥|堂妹|岳母|公公|儿媳|乱伦|迷奸|下药|催眠|强奸|强暴|偷拍|自闭症|精神病/i;
export const KW_RAW=/内射|精液|射精|阴|乳头|性器/;
/** 与旧实现一致：t 为空值时原样返回该空值（不是 false），否则返回是否不含红线词；只用于 filter 的真假判断。 */
export const kwOk=<T>(t: T): T | boolean=>t&&!KW_BLOCK.test(t as string);

/** 热词热点来源：listingPrompt 的输入（旧 listingSources 的返回值）。 */
export interface ListingSrc { words: string[]; topics: string[]; at: string }

export function listingPrompt(w: Pick<Work, 'W' | 'title'>, d: GenData, src: ListingSrc): string {
  const W: WzSettings=Object.assign({},WZ_DEF,w.W), heat=heatOf(W);
  return `你是短剧平台的上架运营，熟悉平台站内搜索与推荐。为下面这部短剧写上架资料，交给生产单位，片子拍完上架时直接用。
片名：《${d.title||w.title}》
一句话故事：${d.logline||W.pitch||''}
受众：${W.aud}｜关系：${W.pair}｜题材：${W.genre||''}｜${d.outline.length} 集，每集约 ${wzMins(W)} 分钟｜尺度：${heat}
人物：${(d.cast||[]).map(c=>`${c.name}（${c.role}）`).join('、')}
分集：
${d.outline.map((o,i)=>`第${i+1}集 ${o.title}：${o.event||''}${o.hook?'｜钩子：'+o.hook:''}`).join('\n')}

近期热词（${src.at||'今日'}抓取，只挑跟这部剧真的相关的，不相关就一个都不用）：
${src.words.join('、')||'（无）'}
近期热点事件（可借来组长尾词的情境，不相关就不用）：
${src.topics.join('\n')||'（无）'}

要求：
- 短尾词：2–4 字的题材、人设、关系核心词，平台上大量人会搜的（例：已婚、禁忌、反差、女上司、大叔、契约、复仇）。放片名与常青标签。
- 长尾词：3–4 个词组成的具体情境，8–16 字，例如「已婚女上司 出差同房」，用来抓精准观众。放一句话简介的前 20 字。
- 片名候选 3 个：每个含 1 个短尾词，10 字以内，有反差或悬念。
- 一句话简介：30 字以内，开头就是长尾情境。
- 介绍：120–160 字，第一句就是钩子，自然带进 2–4 个关键词，不堆砌、不剧透结局。
- 标签 8 个：5 个常青（题材、人设，长期有效）＋ 3 个时效（取自上面的热词或热点，没有相关的就少给）。
- ${heat==='高尺度'?'尺度可以直接，用成人观众熟悉的说法（人妻、偷情、禁忌、出轨这类），但片名与标签不写性器官、体液等字眼。':heat==='正常'?'成人向但含蓄，用暧昧、心动、禁忌这类词，不写露骨字眼。':'走情感向，不写露骨字眼。'}
- 不写别家平台或品牌名、真实人名、时事政治。
${YQ_RULES}
只输出 JSON：{"titles":[{"t":"片名","kw":"用到的短尾词"}],"oneLine":"一句话简介","intro":"介绍","tags":{"evergreen":["常青标签"],"timely":["时效标签"]},"keywords":{"short":["短尾词"],"long":["长尾词"]}}`;
}
export function listingClean(x: any): ListingData {
  const arr=(a: unknown): string[]=>(Array.isArray(a)?a:[]).map(v=>String(v||'').trim()).filter(kwOk);
  return { titles:(x.titles||[]).map((t: any)=>typeof t==='string'?{t}:t).filter((t: any)=>t&&kwOk(t.t)).slice(0,3),
    oneLine:String(x.oneLine||'').trim(), intro:String(x.intro||'').trim(),
    tags:{evergreen:arr(x.tags&&x.tags.evergreen).slice(0,6), timely:arr(x.tags&&x.tags.timely).slice(0,4)},
    keywords:{short:arr(x.keywords&&x.keywords.short).slice(0,10), long:arr(x.keywords&&x.keywords.long).slice(0,10)} };
}
export const lstDay=(L: Pick<Listing, 'wordsAt' | 'at'>): string=>(L.wordsAt||new Date(L.at as number).toISOString()).slice(5,10);
export function listingText(w: Pick<Work, 'title' | 'listing'>): string {
  const L=w.listing; if(!L) return ''; const x=L.data;
  return `【上架资料】《${w.title}》
片名候选：
${x.titles.map((t,i)=>`${i+1}. ${t.t}`).join('\n')}

一句话简介：${x.oneLine}

介绍：
${x.intro}

常青标签：${x.tags.evergreen.join(' / ')}
时效标签（${lstDay(L)} 热词，上架前换新）：${x.tags.timely.join(' / ')||'—'}

短尾词：${x.keywords.short.join('、')}
长尾词：${x.keywords.long.join('、')}
`;
}
