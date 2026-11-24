import { wzMins } from './wz'
import type { Card, GenData, ScenePlanItem, WzSettings } from './types'

/** 逐集写作的提示词与常量（旧页面 M10）。只含提示词构造；请求、重试、流式、驱动循环归写作引擎。 */
export const YQ_PLAN='deepseek-v41-flash-uncensored', YQ_WRITE='sealion-nova-pro';
export const YQ_RULES='【底线】所有角色都是 20 岁以上的成年人，不写学生、校园或未成年暗示；不写血亲、继亲、姻亲之间的感情或亲密；亲密戏必须看得出双方清楚自愿，不写醉酒、昏迷、催眠、下药或威胁下的亲密；任何角色说「不要」「放开」「停」，对方就要停下，不能继续推进；强势、支配类的情节要写成双方都乐意的拉扯，不是强迫；不对应真实人物，不用知名作品的角色名；不碰时事政治。';
export const HEAT: string[]=['点到为止','正常','高尺度'];
export const YQ_HEAT: Record<string, string>={
  '点到为止':'【尺度】亲密戏点到为止：镜头停在接吻、拥抱或关灯处就切走，不写露骨细节。',
  '正常':'【尺度】成人向：亲密戏要写出来，有身体接触、动作推进与情绪变化，用含蓄、有画面感的词，不写性器官细节。',
  '高尺度':'【尺度】成人向高尺度（观众均为已验证的成年人）：每集至少一场亲密戏，完整展开不一笔带过——直接写身体、动作、感官、声音与高潮，用直白的词，节奏由慢到快，亲密段落约占本集一半；主动与回应都要写出来，看得出双方乐在其中。'};
export const heatOf=(W: { heat?: string }): string=>HEAT.includes(W.heat as string)?(W.heat as string):'点到为止';
export const YQ_HOT='gemma4-31b-heretic';
export const DEPTH: string[]=['轻度','中度','重度'];
export const DEPTH_TIME: Record<string, string>={'轻度':'约 3 分钟','中度':'约 5 分钟','重度':'约 12 分钟'};
export const depthOf=(W: { depth?: string }): string=>DEPTH.includes(W.depth as string)?(W.depth as string):'轻度';
export const YQ_SHOOT='【可拍性】动作行只写镜头拍得到的：不写「没看他一眼」「连眼皮都没抬」这类否定式动作，改成正向可见的动作；「接过某物」要写清从谁手里接；角色不能对前面没出现过的名字反问；同一空间不硬拆两场。不写（眼神微冷）（淡淡开口）这类拍不出的神态，改成「具体小动作｜发声方式」，例如（放下茶杯｜压低声音）。行话、术语当句用大白话说出利害。每两到四句对白插一条有分量的动作。';
export const YQ_TRAPS='【常识排雷】不靠违反常识制造爽点：现代题材不写「一句话十分钟冻结所有账户、让公司破产」，改成撤资、触发对赌条款、法院保全裁定这类真实手段；不当众撕毁对自己有利的原件；小角色不能随手使唤高官；古装不写当众贬妻为妾、私拆御赐之物。冲突换成具体的利益得失。';
export function yqCardPrompt(W: WzSettings, n: number): string {
  const x: string[]=[`一句话故事：${(W.pitch||'').trim()}`, `受众：${W.aud}`, `配对：${W.pair}`, `题材：${W.genre}`];
  if(W.qxRole) x.push(`核心角色类型：${W.qxRole}`); if(W.qxMode) x.push(`剧本模式：${W.qxMode}`);
  if((W.hooks||[]).length) x.push(`爽点：${W.hooks.join('、')}`); if((W.core||'').trim()) x.push(`作者的点子：${W.core.trim()}`);
  if((W.title||'').trim()) x.push(`剧名：${W.title.trim()}`);
  return `你是短剧总策划。为一部 ${n} 集、每集约 ${wzMins(W)||1} 分钟的竖屏短剧写「策划卡」，立项时写死，后面每一集都照它写。
${x.join('\n')}

${YQ_RULES}
${YQ_TRAPS}

只输出一个 JSON，不要任何说明：
{"title":"剧名（没给就自己取，8 字内）","logline":"一句话梗概",
"mystery":"贯穿全剧的主线谜底：观众到后段才知道的真相，一两句",
"rules":{"power":"本剧最高的裁决者是谁","stakes":"双方争夺的具体东西是什么、值多少","spaces":"几个大段落分别发生在哪些空间、怎么一步步升级","evidence":"贯穿全剧的 3–4 件关键物证","limit":"主角底牌的限制与代价，中段要发作一次","address":"关系变化怎样体现在称呼的变化上"},
"cast":[{"name":"人名（不要用设定里的形容词当名字）","role":"女主/男主/反派/配角","age":25,"look":"外观锚点：发型、身形、标志服饰、标志动作（给生图用）","want":"欲望","flaw":"弱点","voice":"说话方式＋一句代表台词"}]}
cast 3 到 5 人，每人都要有推动主线的功能。`;
}
export function yqPlanPrompt(W: WzSettings, n: number, card?: Card | null): string {
  const x: string[]=[`一句话故事：${(W.pitch||'').trim()}`, `受众：${W.aud}`, `配对：${W.pair}`, `题材：${W.genre}`];
  if(W.qxRole) x.push(`核心角色类型：${W.qxRole}`); if(W.qxMode) x.push(`剧本模式：${W.qxMode}`);
  if((W.hooks||[]).length) x.push(`爽点：${W.hooks.join('、')}`); if((W.core||'').trim()) x.push(`作者的点子：${W.core.trim()}`);
  if((W.title||'').trim()) x.push(`剧名：${W.title.trim()}`);
  return `你是短剧总编剧。依下面设定，规划一部 ${n} 集的竖屏短剧，每集约 ${wzMins(W)||1} 分钟。\n${x.join('\n')}\n\n${YQ_RULES}\n${YQ_HEAT[heatOf(W)]}${heatOf(W)==='高尺度'?'每集的 event 都要写到亲密情节如何发生。':''}\n
只输出一个 JSON，不要任何说明：
{"title":"剧名（没给就自己取，8 字内）","logline":"一句话梗概","cast":[{"name":"人名（不要用设定里的形容词当名字）","role":"女主/男主/反派/配角","age":25,"bio":"一句话人设"}],"episodes":[{"title":"集名（6 字内）","event":"本集发生什么，两三句","hook":"集尾钩子，一句"}]}
cast 3 到 6 人；episodes 正好 ${n} 个，前后连贯，每集都有冲突与钩子，最后一集收尾。${card?`
已定的策划卡（照它排，剧名、人名、人设不要改；cast 直接沿用这些人）：
${cardText(card)}
主线谜底要分几集逐步逼近，到后段才揭开。`:''}${depthOf(W)!=='轻度'?`
${YQ_TRAPS}`:''}`;
}
export function cardText(c?: Card | null): string { if(!c) return ''; const r=c.rules||{};
  return [`主线谜底：${c.mystery||''}`, `权力上限：${r.power||''}`, `利益：${r.stakes||''}`, `空间升级：${r.spaces||''}`, `关键物证：${r.evidence||''}`, `主角能力的限制与代价：${r.limit||''}`, `称谓变化：${r.address||''}`,
    ...(c.cast||[]).map(p=>`${p.name}（${p.role}，${p.age||''}岁）外观：${p.look||''}；欲望：${p.want||''}；弱点：${p.flaw||''}；说话：${p.voice||''}`)].join('\n'); }
export const YQ_CPM=800;
export const yqFormat=(i: number): string=>`格式（只输出剧本，不要标题和说明）：
${i+1}-1 夜／地点（内）／人物甲、人物乙
△ 拍得出来的动作（一行一个动作或镜头）
△ 字卡（人名，叠印）：名字｜身分（括号里照写「人名，叠印」四个字；只在该角色全剧第一次出场时加）
人物甲（语气）：台词
△ 字卡：次日夜（时间跳转时加）`;
export function yqNewNames(d: GenData, i: number): string[] { const before=d.eps.slice(0,i).join('\n'); return d.cast.filter(c=>!before.includes(c.name)).map(c=>`${c.name}｜${c.role}`); }
export function yqEpPrompt(d: GenData, W: WzSettings, i: number): string {
  const dp=depthOf(W), ep=d.outline[i], chars=Math.round((wzMins(W)||1)*YQ_CPM), prev=(d.eps[i-1]||'').slice(dp==='轻度'?-600:-1200);
  return `你是短剧编剧。写《${d.title}》第 ${i+1} 集（共 ${d.outline.length} 集），约 ${chars} 字。
故事：${d.logline}
人物：${d.cast.map(c=>`${c.name}（${c.role}）${c.bio}`).join('；')}
各集大纲：
${d.outline.map((o,k)=>`第${k+1}集 ${o.title}：${o.event}`).join('\n')}
${prev?`上一集结尾：\n${prev}\n`:''}
本集要写：${ep.event}
集尾钩子：${ep.hook}

${yqFormat(i)}
第一次出场要加人名字卡的人：${yqNewNames(d,i).join('、')||'（无）'}

要求：开头 3 秒有钩子，场次 2 到 4 场，台词口语、短而有力，人名与设定一致，不写旁白说明，不用字幕交代剧情；字数尽量贴近约 ${chars} 字。
${d.card?`策划卡（必须遵守，人物说话方式照它写）：
${cardText(d.card)}
`:''}${dp!=='轻度'?YQ_SHOOT+'\n'+YQ_TRAPS+'\n':''}${YQ_RULES}
${YQ_HEAT[heatOf(W)]}`;
}
export const yqSceneCount=(W: Pick<WzSettings, 'mins' | 'minsCustom'>): number=>Math.max(3,Math.min(15,Math.round((wzMins(W)||1)*1.5)+1));
export function yqScenePrompt(d: GenData, W: WzSettings, i: number, n: number): string {
  return `你是短剧编剧。为《${d.title}》第 ${i+1} 集（共 ${d.outline.length} 集，本集约 ${wzMins(W)} 分钟）排分场大纲，正好 ${n} 场。
故事：${d.logline}
人物：${d.cast.map(c=>`${c.name}（${c.role}）`).join('、')}
${d.card?`策划卡：\n${cardText(d.card)}\n`:''}各集大纲：
${d.outline.map((o,k)=>`第${k+1}集 ${o.title}：${o.event}`).join('\n')}
上一集结尾：${(d.eps[i-1]||'（这是第一集）').slice(-500)}
本集要写：${d.outline[i].event}
集尾钩子：${d.outline[i].hook}

要求：场与场一步步推进，每场有自己的冲突或转折，不重复同一件事；地点 2–5 个、可重复使用；第一场开头 3 秒有钩子，最后一场落在集尾钩子；全集只留一个结尾钩子。
${YQ_RULES}
${YQ_HEAT[heatOf(W)]}
只输出 JSON：{"scenes":[{"time":"日/夜/黄昏/凌晨","place":"地点","io":"内/外","people":["人名"],"card":"需要时间字卡就写（如：次日夜），否则空","beat":"这场发生什么：谁要什么、冲突、转折、结果，两三句"}]}`;
}
export function yqBatchPrompt(d: GenData, W: WzSettings, i: number, plan: ScenePlanItem[], from: number, to: number, prevTail: string): string {
  const dp=depthOf(W), per=Math.round(wzMins(W)*YQ_CPM/plan.length);
  return `你是短剧编剧。写《${d.title}》第 ${i+1} 集的第 ${from+1}–${to} 场（全集共 ${plan.length} 场），每场约 ${per} 字。
故事：${d.logline}
人物：${d.cast.map(c=>`${c.name}（${c.role}）${c.bio}`).join('；')}
本集要写：${d.outline[i].event}
本集分场（只写指定的几场，其他场只当前后文参考）：
${plan.map((x,k)=>`${i+1}-${k+1} ${x.time}／${x.place}（${x.io}）／${(x.people||[]).join('、')}：${x.beat}${x.card?`（字卡：${x.card}）`:''}${k>=from&&k<to?'  ← 这次要写':''}`).join('\n')}
${prevTail?`紧接在这段之后：\n${prevTail}\n`:''}
${yqFormat(i)}
场号从 ${i+1}-${from+1} 开始。第一次出场要加人名字卡的人：${yqNewNames(d,i).join('、')||'（无）'}（同一集前面的场已加过就不要重复）。

要求：照分场写满，每场都要有足够的台词来回与人物反应，不要几句就结束；动作行写镜头拍得到的东西；台词口语、短句、人物说话有辨识度；不写旁白说明。${to===plan.length?'最后一场停在集尾钩子上。':'写到第 '+to+' 场结束就停。'}
${d.card?`策划卡（必须遵守）：\n${cardText(d.card)}\n`:''}${dp!=='轻度'?YQ_SHOOT+'\n'+YQ_TRAPS+'\n':''}${YQ_RULES}
${YQ_HEAT[heatOf(W)]}`;
}
export function yqCheckPrompt(d: GenData, _W: WzSettings, i: number, txt: string): string {
  return `你是短剧审稿。检查下面这一集剧本，只找真正要改的问题，最多 5 条。
检查项：1 一级红线（未成年、乱伦、非自愿：说了不要／停之后还继续、醉酒昏迷催眠下药威胁）；2 和策划卡或前文矛盾（人名、身份、金额、物证、谁知道什么）；3 可拍性（否定式动作、凭空接物、未提先知、同空间硬拆两场、拍不出的神态括号）；4 常识降智桥段；5 本集要写的事没写到。
策划卡：
${cardText(d.card)}
本集要写：${d.outline[i].event}
上一集结尾：${(d.eps[i-1]||'').slice(-400)}

剧本：
${txt}

只输出 JSON：{"issues":[{"where":"场几","problem":"问题","fix":"改法"}]}，没有问题就输出 {"issues":[]}。`;
}
export function yqFixPrompt(_d: GenData, W: WzSettings, _i: number, txt: string, issues: { where?: string; problem?: string; fix?: string }[]): string {
  return `按下面的审稿意见修改这一集剧本，只改有问题的地方，其他一字不动，格式照原样，只输出改好的完整剧本。
审稿意见：
${issues.map((x,k)=>`${k+1}. ${x.where||''}：${x.problem||''} → ${x.fix||''}`).join('\n')}

原剧本：
${txt}

${YQ_RULES}
${YQ_HEAT[heatOf(W)]}`;
}
export const parseJSON=(t: string): any=>{ const a=t.indexOf('{'), b=t.lastIndexOf('}'); return JSON.parse(t.slice(a,b+1)); };
