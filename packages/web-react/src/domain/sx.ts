import { esc } from './text'
import { WZ_DEF } from './wz'
import type { Gender, Lib, Rng, SxState, SxTemplate, Work, WzSettings } from './types'

export const SX = {eps:10, mins:1, wpm:400};
export const SX_NAMES: Record<Gender, string[]> = {male:['陆沉','林骁','顾承','秦野','沈渊','江屿','周砚'], female:['苏晚','林知夏','顾念','温言','沈清禾','许微','姜宁']};
export const SX_TITLES: Record<Gender, string[]> = {male:['{n}，开局逆袭','{n}的隐藏身份','我，{n}，不装了','{n}归来','这一次，{n}说了算'],
                   female:['{n}不回头','{n}的第二人生','这次换{n}来选','{n}，清醒上位','{n}的高光时刻']};
export const SX_COLORS: string[] = ['#4a5d78','#6b5a4a','#55705f','#6a4e6e','#7a5a3a','#3e6470','#6b4a52','#4f5f8a','#5f6b3e','#6e5e86'];
/** 旧 pick：随机取一个。随机源改成显式参数 rng（默认 Math.random）。 */
export const pick = <T>(a: T[], rng: Rng = Math.random): T => a[Math.floor(rng()*a.length)];
export const oppOf = (rel?: string): string => { const r=(rel||'').split(/[；;]/)[0]; return r.includes('-') ? r.split('-').slice(1).join('、') : '对手'; };
export function sxOutline(t: SxTemplate, n: string, g: Gender): [string, string][] {
  const P = g==='male'?'他':'她', gold=t.gold.split(/[，,+（(]/)[0].trim(), genres=t.genres.split('、').slice(0,3).join('、');
  return [
    ['开局即高潮', t.hook.replace(/^他|^她/, n)],
    ['被看轻', `${n}以「${t.surface}」的身份被众人看轻，${oppOf(t.rel)}步步紧逼，${P}先忍下这一口气。`],
    ['金手指兑现', `「${gold}」第一次兑现，${n}小范围打脸，围观的人开始改口。`],
    ['对手反扑', `${oppOf(t.rel)}不甘心，抛出更大的筹码设局，${n}一时陷入被动。`],
    ['第一次翻盘', `${n}借「${gold}」翻盘，赢下一个看得见、数得出的回合。`],
    ['真相一角', `${P}心里那份「${t.hidden}」被逼出一角，身边人的态度开始转变。`],
    ['幕后现身', `真正的幕后对手现身，旧账浮出水面，局面全面升级。`],
    ['跌入低谷', `${n}失去倚仗、被逼到绝境，必须做出选择。`],
    ['全面反击', `${n}全面反击，${genres}的爽点集中兑现。`],
    ['大结局', `身份与真相公开，对手付出代价；${n}站上新的位置，故事完整收尾。`],
  ];
}
export function sxPrompt(s: SxState, lib: Lib): string {
  const t=s.role, ch=s.g==='male'?'男频':'女频';
  return `你是短剧编剧。请依下面的主角设定和分集大纲，写出 10 集完整短剧剧本。

【固定规格】共 ${SX.eps} 集，每集约 ${SX.mins} 分钟、约 ${SX.mins*SX.wpm} 字；简体中文、中国大陆用语；第 10 集完整收尾，不预留续季。

【剧名】《${s.title}》

【主角】${s.name}（${ch}）
- 角色原型：${t.type}
- 表面人设：${t.surface}
- 隐藏欲望 / 实力：${t.hidden}
- 金手指 / 核心设定：${t.gold}
- 开场钩子：${t.hook.replace(/^他|^她/, s.name)}
- 关系：${t.rel}
- 可组合流派：${t.genres}
- 创作要点：${t.note}
${s.idea?`- 我想加的点子：${s.idea}\n`:''}
【分集大纲】
${s.outline.map(([h,b],i)=>`第 ${i+1} 集｜${h}：${b}`).join('\n')}

【写作要求】
- 每集开头 3 秒内给出钩子，第 1–9 集集尾留悬念，第 10 集收尾。
- 每集约 ${SX.mins*SX.wpm} 字，场次少、台词短而有力，动作要拍得出来。
- 动作行和台词照下面的单集格式标示，每句台词标出说话人与情绪。

【单集剧本格式（提示词库 2.5）】
${lib('2.5')}`;
}
/**
 * 旧 sxSaveWork 的纯逻辑：把标准版结果 s 合进作品列表。
 * 不读写 localStorage：list 为当前全部作品，返回新列表；时间改成显式参数 now。
 */
export function sxBuildWork(list: Work[], s: SxState, now: number): { list: Work[]; item: Work } {
  const next = list.slice()
  const t = s.role,
    W: WzSettings = { ...WZ_DEF, mode: 'auto', title: s.title, aud: s.g === 'male' ? '男性向' : '女性向', pitch: t.hook.replace(/^他|^她/, s.name),
      eps: SX.eps, mins: SX.mins, sequel: false, hero: `${s.name}：${t.surface}；${t.hidden}`, core: t.gold, rival: oppOf(t.rel), diff: s.idea || '', adult: true }
  const item: Work = { id: s.id, kind: 'simple', title: s.title, sx: s, W, time: now }
  const i = next.findIndex((x) => x.id === s.id)
  if (i >= 0) next[i] = item
  else next.unshift(item)
  return { list: next, item }
}

export const SX_OPP: Record<Gender, string[]> = {male:['赵坤','钱一鸣','孙浩','周曼丽','韩少'], female:['林薇薇','顾晟','许曼','沈太太','白若雪']};
export const SX_ALLY: Record<Gender, string[]> = {male:['小陈','老周','阿凯'], female:['小雨','阿宁','周姐']};
export const SX_LOC: Record<Gender, string[]> = {male:['宴会厅','公司会议室','老宅客厅','医院走廊','写字楼大堂','街边大排档','停车场'],
                female:['订婚宴现场','豪门客厅','公司会议室','雨夜街头','医院走廊','发布会后台','咖啡馆']};
export function sxRng(seed: number): Rng { let a=seed>>>0||1; return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}; }
/** 旧 sxScript：本地按大纲生成 10 集台词初稿（种子 s.seed 固定则结果固定，不含 Math.random）。 */
export function sxScript(s: Pick<SxState, 'seed' | 'role' | 'g' | 'name' | 'outline'>): string[] {
  const R=sxRng(s.seed||1), P2=<T>(a: T[]): T=>a[Math.floor(R()*a.length)];
  const t=s.role, g=s.g, n=s.name, P=g==='male'?'他':'她';
  const O=oppOf(t.rel), o=P2(SX_OPP[g]), a=P2(SX_ALLY[g]);
  const gold=t.gold.split(/[，,+（(]/)[0].trim(), surf=t.surface.split(/[，,；;。]/)[0].replace(/\/[^/]*$/,'');
  const hook=t.hook.replace(/^他|^她/, n);
  const crowd=['围观宾客','路人甲','众人'];
  const music: Record<'calm' | 'up' | 'sus', string[]>={calm:['低沉弦乐，压抑','钢琴单音，留白'],up:['鼓点渐强','节奏骤起，爽感拉满'],sus:['悬疑音效，戛然而止','心跳声放大']};
  const D=(who: string, emo: string, line: string)=>`${who}（${emo}）：“${line}”`, A=(x: string)=>`△ ${x}`, M=(k: 'calm' | 'up' | 'sus')=>`音乐提示：${P2(music[k])}`;
  const sc=(no: number,loc: string,dn: string,people: string[],lines: string[])=>[`## 场次${'一二三'[no]}`,`场景：${/街|停车场|大排档/.test(loc)?'外景':'内景'} · ${loc} · ${dn}`,`出场人物：${people.join('、')}`,'',...lines,''].join('\n');
  const L=()=>P2(SX_LOC[g]), DN=()=>P2(['日','夜']);
  const B=[
    {sh:'开局打脸',k:['开局','轻视','反转'],s:[
      [[n,o,crowd[0]],[A(P2([`（全景）人声嘈杂，所有目光都落在${n}身上。`,`（全景）灯光刺眼，人群让出一条路，中间站着${n}。`])),A(`（中景）${o}把东西重重摔在${n}面前，居高临下。`),
        D(o,'轻蔑',P2([`就凭你？一个${surf}，也配站在这儿？`,`${n}，你今天来，就是给大家添笑话的吧？`])),
        D(crowd[0],'窃笑',P2(['啧，真不知道自己几斤几两。','这种人怎么混进来的？'])),D(n,'平静',P2(['说完了？','你确定要这么做？'])),M('calm')]],
      [[n,o],[A(`（特写）${hook}`),D(o,'愣住','你……你说什么？'),D(n,'淡淡',P2(['我说，今天这事，到此为止。','记住你现在的表情。'])),M('up')]],
      [[n,a],[A(`（近景）${a}匆匆赶来，压低声音。`),D(a,'急切',`${n}，${P2(['外面来的人，点名要见你。','出事了，对方动真格的了。'])}`),D(n,'冷静','让他们等着。'),A('（特写）门外传来急促的脚步声。')]],
    ],hk:`门外的来人，竟然是冲着${n}来的。`},
    {sh:'忍辱蓄力',k:['被看轻','隐忍','伏笔'],s:[
      [[n,o,crowd[2]],[A(`（全景）${o}当众宣布结果，众人哄笑。`),D(o,'得意',P2([`${O}说了，你这种人，就该认清自己的位置。`,'从今天起，这里没有你的位置。'])),D(n,'沉默','……'),A(`（特写）${n}攥紧的手慢慢松开。`),M('calm')]],
      [[n,a],[D(a,'不甘','你就这么忍了？'),D(n,'低声',P2([`忍？我只是在等。`,'让他们先笑，笑得越大声越好。'])),A(`（近景）${n}看向窗外，眼神一点点变冷。`)]],
      [[n],[A(`（特写）${P}心里清楚：${t.hidden}。`),D(n,'自语','快了。'),M('sus')]],
    ],hk:`${o}以为${n}认输了，其实一切才刚开始。`},
    {sh:'金手指兑现',k:[gold,'小打脸','改口'],s:[
      [[n,o],[A(`（中景）${o}再次设难，把难题甩到${n}面前。`),D(o,'挑衅','有本事你来？'),D(n,'从容','好。'),M('up')]],
      [[n,o,crowd[0]],[A(`（特写）「${gold}」生效，局面在几秒内被扭转。`),D(crowd[0],'震惊',P2(['这……怎么可能？','他刚才是怎么做到的？'])),D(o,'脸色难看','巧合而已！'),D(n,'淡笑',P2(['那就再巧一次给你看。','巧合？你可以继续这么想。']))]],
      [[n,a],[D(a,'兴奋',`${n}，他们都在改口了！`),D(n,'平静','这才哪到哪。'),A(`（特写）${o}躲在角落，拨出一通电话。`),M('sus')]],
    ],hk:`${o}拨出的那通电话，打给了一个更难对付的人。`},
    {sh:'对手反扑',k:['设局','被动','危机'],s:[
      [[o],[A(`（近景）${o}对着电话压低声音。`),D(o,'阴狠',P2([`这次，我要他再也翻不了身。`,`东西准备好了，就等${P}往里跳。`])),M('sus')]],
      [[n,o,crowd[2]],[A(`（全景）众人围拢，${o}拿出“证据”。`),D(o,'义正辞严',`大家看清楚，${n}到底是什么人！`),D(crowd[2],'哗然','原来是这样……'),D(n,'皱眉','这是栽赃。'),M('calm')]],
      [[n,a],[D(a,'慌乱','现在所有人都不信你了，怎么办？'),D(n,'沉思',P2(['他们做得越多，破绽越多。','给我一点时间。'])),A(`（特写）${n}的目光落在一个不起眼的细节上。`)]],
    ],hk:`${n}发现了那个能翻盘的破绽。`},
    {sh:'当众翻盘',k:['翻盘','打脸','证据'],s:[
      [[n,o,crowd[0]],[A(`（全景）${n}走上前，全场安静。`),D(n,'冷静','你说完了，该我了。'),A(`（特写）${n}亮出关键证据，与「${gold}」完全吻合。`),M('up')]],
      [[o,crowd[0]],[D(crowd[0],'倒吸一口气','原来是他在搞鬼！'),D(o,'慌张',P2(['不……不是这样的！','你、你哪来的这个？'])),A(`（中景）${o}后退一步，撞翻了桌上的杯子。`)]],
      [[n,o],[D(n,'俯视',P2(['刚才你说的话，现在收回还来得及吗？','这一局，你输了。'])),D(o,'咬牙','你等着！'),M('sus')]],
    ],hk:`${o}临走前那句“你等着”，背后另有其人。`},
    {sh:'真相一角',k:['身世','秘密','转变'],s:[
      [[n,a],[A(`（近景）深夜，${n}独自翻看一样旧物。`),D(a,'小心','这是……你一直没说的事？'),D(n,'低声',`${t.hidden}。`),M('calm')]],
      [[n,crowd[2]],[A('（全景）消息不胫而走，众人开始重新打量。'),D(crowd[2],'议论',P2([`原来${P}一直在藏？`,`之前看走眼了……`])),A(`（特写）有人悄悄换了座位，坐到${n}这一边。`)]],
      [[n],[D(n,'坚定','藏够了，接下来，换我出牌。'),M('up')]],
    ],hk:'一封匿名消息送到：真正的对手，要现身了。'},
    {sh:'幕后现身',k:['幕后','旧账','升级'],s:[
      [[n,o],[A(`（全景）${L()}，一扇门缓缓打开。`),A(`（中景）${o}站在一旁，对来人毕恭毕敬。`),D(o,'谄媚','就是他，处处跟我们作对。'),M('sus')]],
      [[n],[A(`（特写）来人摘下墨镜，${n}瞳孔一缩。`),D(n,'冷笑',P2(['果然是你。','这么多年，你终于肯露面了。'])),A('（近景）旧账一笔笔翻出，局面全面升级。')]],
      [[n,a],[D(a,'担心','对手太强了，我们赢不了的。'),D(n,'平静','赢不了？那是他们没见过我认真。')]],
    ],hk:`幕后对手开出条件：${n}必须二选一。`},
    {sh:'跌入低谷',k:['绝境','失去','选择'],s:[
      [[n,a],[A(`（全景）大雨，${n}站在${L()}门口，被拒之门外。`),D(a,'哽咽','他们把我们所有的路都堵死了。'),M('calm')]],
      [[n,o],[D(o,'得意',P2(['跪下求我，或许还能给你留条活路。','现在后悔，晚了。'])),D(n,'抬眼','你笑得太早了。'),A(`（特写）${n}握紧拳头，雨水顺着下巴滴落。`)]],
      [[n],[A(`（近景）${n}做出决定，转身走进夜色。`),D(n,'自语','最后一张牌，该翻了。'),M('sus')]],
    ],hk:`${n}翻开的最后一张牌，所有人都没想到。`},
    {sh:'全面反击',k:['反击',t.genres.split('、')[0],'爽点'],s:[
      [[n,o,crowd[0]],[A(`（全景）${L()}，各方人马到齐。`),A(`（中景）${n}从容入场，身后跟着${a}和一众帮手。`),D(crowd[0],'惊呼','这阵仗……'),M('up')]],
      [[n,o],[D(n,'一字一句',P2([`你欠我的，今天连本带利还清。`,`之前每一笔账，我都记着。`])),A(`（特写）「${gold}」全面发动，对方布下的局一个个被拆穿。`),D(o,'崩溃','不可能！这不可能！')]],
      [[n,a],[D(a,'激动','赢了！我们真的赢了！'),D(n,'淡然','还差最后一步。'),M('sus')]],
    ],hk:'最后一步：把所有真相，摆到所有人面前。'},
    {sh:'大结局',k:['真相','清算','新生'],s:[
      [[n,o,crowd[2]],[A('（全景）真相公开，全场哗然。'),D(n,'平静',`今天，我只想让大家知道——我是${n}。`),D(o,'颓然','我……认输。'),M('up')]],
      [[o],[A(`（中景）${o}被带走，回头看了${n}一眼，满是悔意。`),D(crowd[2],'改口',P2([`以后还请${P}多多关照！`,'我们早就看出来了！']))]],
      [[n,a],[A(`（全景）阳光洒进来，${n}站在新的位置上。`),D(a,'笑','接下来做什么？'),D(n,'微笑',P2(['做我自己。','走我自己的路。'])),M('calm')]],
    ],hk:'故事完整收尾。'},
  ];
  return s.outline.map(([h],i)=>{
    const e=B[i], prev=i?B[i-1].hk:'';
    const head=[`# 第${i+1}集：${h}`,`> 本集关键词：${e.k.join('、')}`,`> 本集爽点：${e.sh}`];
    if(prev) head.push(`> 前情提要：${prev}`);
    const loc=L(), dn=DN();
    const body=e.s.map(([ppl,lines],k)=>sc(k,k===1?L():loc,dn,ppl,lines)).join('\n');
    const tail=[`> 本集钩子：${e.hk}`]; if(i<9) tail.push(`> 下集预告：${s.outline[i+1][0]}。`);
    return head.join('\n')+'\n\n'+body+'\n'+tail.join('\n');
  });
}
export const sxScriptText = (s: SxState): string => `《${s.title}》10 集完整台词\n主角：${s.name}（${s.role.type}）\n\n`+sxScript(s).join('\n\n---\n\n');
export function sxHL(txt: string): string { return esc(txt).split('\n').map(l=>/^\d+-\d+\s/.test(l)?`<b class="d">${l}</b>`:/^△|^\[画面\]|^【/.test(l)?`<span class="a">${l}</span>`:/^音乐提示|^&gt;/.test(l)?`<span class="m">${l}</span>`:/^#/.test(l)?`<b class="d">${l.replace(/^#+\s*/,'')}</b>`:/：“|：「/.test(l)||/^[一-龥A-Za-z]{1,8}(（[^）]*）)?：/.test(l)?`<span class="d">${l}</span>`:l).join('\n'); }
