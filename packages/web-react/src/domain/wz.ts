import { nfmt } from './text'
import type { DupResult, Lib, Rng, Work, WzMode, WzSettings } from './types'

type SuppKey = 'core' | 'diff' | 'hero' | 'rival' | 'world'

export const WZ_DEF: WzSettings = {mode:'paste', doc:'', novel:'', title:'', aud:'女性向', pair:'男女', genre:'都市', pitch:'', hooks:[],
  lang:'简中词库', glyph:'简体', eps:10, epsCustom:'', mins:3, minsCustom:'', wpm:400, sequel:true, ai:'Claude',
  core:'', diff:'', hero:'', rival:'', world:'', adult:false, dup:null};
export const WZ_OPT = {
  aud:['女性向','男性向','男同志向'], pair:['男女','男男（BL）','女女（GL）'],
  genre:['都市','霸总','职场','古装','玄幻','重生穿越','能力系统'],
  hooks:['身分反转','被偏爱','打脸','追妻','先婚后爱','破镜重圆','逆袭'],
  eps:[10,20,30,60,80], mins:[1,2,3,5,8,10],
  ai:[['Claude','Claude（剧情、台词主写）'],['ChatGPT','ChatGPT'],['Grok','Grok'],['Qwen','Qwen 通义千问'],['云端模型','其他云端模型'],['公司模型','公司内部模型']],
};
export const SUPP: [SuppKey, string, string, boolean?][] = [['core','核心设定与规则','请描述核心设定与限制⋯',true],['diff','与参考作品的差异','和相似作品最不一样的地方'],
  ['hero','主角','身分、年龄、弱点'],['rival','对手','动机与手段'],['world','场景与世界观','故事发生在哪里']];
export const MODE: Record<WzMode, { tab: string; step: string; btn: string; sub: string }> = {
  auto: {tab:'氛围写作', step:'你的故事', btn:'资产库生成', sub:'产生影片内的生动角色与故事场景'},
  paste:{tab:'上传剧本', step:'上传剧本', btn:'资产库生成', sub:'产生影片内的生动角色与故事场景'},
  novel:{tab:'汇入小说', step:'汇入小说', btn:'资产库生成', sub:'产生影片内的生动角色与故事场景'},
};
export const langOf = (W: Pick<WzSettings, 'lang'>): string => W.lang==='台湾用语'||W.lang==='繁中词库' ? '繁中词库' : '简中词库';
export const wzEps = (W: Pick<WzSettings, 'eps' | 'epsCustom'>): number => W.eps==='自定义' ? (+W.epsCustom||0) : W.eps;
export const wzMins = (W: Pick<WzSettings, 'mins' | 'minsCustom'>): number => W.mins==='自定义' ? (+W.minsCustom||0) : W.mins;
export function wzScore(W: WzSettings): number {
  return (W.pitch.trim()?2:0)+(W.hooks.length?1:0)+(W.core.trim()?2:0)+(W.diff.trim()?2:0)+(W.rival.trim()?1:0)+(W.hero.trim()?1:0)+(W.world.trim()?1:0);
}
export function wzTitle(W: WzSettings): string {
  if(W.title.trim()) return W.title.trim();
  const src = W.mode==='novel' ? W.novel : W.doc;
  const m = src.match(/《([^》\n]{1,30})》/) || src.match(/(?:剧名|片名|作品名称?)[:：]\s*([^\n]{1,30})/);
  return m ? m[1].trim() : '';
}
export function wzNeeds(W: WzSettings): string[] {
  const n: string[] = [];
  if(W.mode==='paste' && !W.doc.trim()) n.push('贴上你的剧本');
  if(W.mode==='novel' && (W.novel.length<2000||W.novel.length>400000)) n.push('放进小说（2,000–400,000 字）');
  if(W.mode==='auto' && !W.pitch.trim()) n.push('说一句你的故事');
  if(!wzEps(W)||!wzMins(W)) n.push('选好集数和每集时长');
  if(!W.adult) n.push('勾选「所有角色均已年满 18 岁」');
  return n;
}
export function wzSettings(W: WzSettings): { main: string; sup: string } {
  const eps=wzEps(W), mins=wzMins(W), per=mins*W.wpm;
  const s=[`作品名称：${wzTitle(W)||'（未定，请依内容取名）'}`,
    `受众：${W.aud}　配对：${W.pair}　类型：${W.genre}`,
    `一句话卖点：${W.pitch.trim()||'（未填）'}`,
    `核心爽点：${W.hooks.join('、')||'（未选）'}`,
    `台词词库：${langOf(W)}（${langOf(W)==='繁中词库'?'台湾用语':'中国大陆用语'}）；剧本字形：${W.glyph}`,
    `第一季规格：共 ${eps} 集，每集约 ${mins} 分钟、约 ${nfmt(per)} 字（每分钟约 ${W.wpm} 字），合计约 ${nfmt(per*eps)} 字。`];
  if(W.style&&W.style!=='无') s.push(`画面风格：${W.style}`);
  if(W.ratio) s.push(`画面比例：${W.ratio}`);
  if(W.sequel) s.push('预留续季空间：最后一集留下 2–3 条可延续的线，不把伏笔收完。');
  s.push('所有角色均已年满 18 岁。');
  const sup=SUPP.filter(([k])=>W[k].trim()).map(([k,l])=>`${l}：${W[k].trim()}`);
  return {main:s.join('\n'), sup:sup.length?sup.join('\n'):''};
}
export function wzPrompt(W: WzSettings, lib: Lib): string {
  const {main,sup}=wzSettings(W);
  const avoid = W.dup && W.dup.hits.length ? `\n【撞题避开】下列已有作品题材相近，请在人设、核心设定和卖点上明显区隔：\n${W.dup.hits.map((h)=>'- 《'+h.title+'》'+(h.pitch?'：'+h.pitch:'')).join('\n')}` : '';
  const supTxt = sup ? `\n【补充设定】\n${sup}` : '';
  if(W.mode==='paste') return `你是短剧编剧。请依照下面的作品设定和策划文件，写出第 1 集完整剧本。

【作品设定】
${main}${supTxt}${avoid}

【写作要求】
- 字数控制在约 ${nfmt(wzMins(W)*W.wpm)} 字，开头 3 秒内给出钩子，集尾留断章。
- 台词用${langOf(W)==='繁中词库'?'繁中词库（台湾用语）':'简中词库（中国大陆用语）'}，剧本用${W.glyph}字形；动作行和台词照下面的单集格式标示，每句台词标出说话人与情绪。
- 只写第 1 集，不提前揭示后面集数的信息；与策划文件冲突时以策划文件为准。

【单集剧本格式（提示词库 2.5）】
${lib('2.5')}

【策划文件】
${W.doc.trim()}`;
  if(W.mode==='auto') return `你是短剧策划。请依下面的设定，写出一份完整的短剧策划文件。

【作品设定】
${main}${supTxt}${avoid}

【要交付的内容】
1. 作品资料卡：剧名、受众、类型、一句话卖点、核心爽点、对标作品与差异。
2. 故事大纲：800–1,200 字，交代起点、主线冲突、阶段转折与第一季结局。
3. 角色设计：主角、对手与 3–5 名主要配角，各写身分、年龄（均需年满 18 岁）、动机、弱点、说话风格。
4. 分集大纲：第 1–${wzEps(W)} 集，每集 2–4 句，标出该集爽点与集尾钩子。
5. 前 3 集分场大纲：每场写地点、时间、出场人物、事件与情绪落点。

写完后先自查合规红线，命中的地方直接改写。

【参考：灵感到成稿工作流（提示词库 1.1）】
${lib('1.1')}`;
  return `你是短剧改编编剧。请把下面的小说改编成短剧策划文件。

【作品设定】
${main}${supTxt}${avoid}

【改编方式】
1. 先切章，逐章写 2–3 句摘要。
2. 人名、地名、店名照原著，不另取名。
3. 依第一季规格分配集数，每一集标出「对应原著」的章节范围。
4. 交付：作品资料卡、故事大纲、角色设计、分集大纲（第 1–${wzEps(W)} 集）、前 3 集分场大纲。
5. 片名若未定，用原书名或依内容取名。

【长篇压缩规则（提示词库 2.12）】
${lib('2.12')}

【小说全文】
${W.novel.trim()}`;
}

/** 旧 wzDupCheck：撞题比对。读全局的未删除作品列表改成显式参数 liveWorks（旧 liveWorks()）。 */
export function wzDupCheck(W: WzSettings, liveWorks: Work[]): DupResult {
  const works = liveWorks.filter((w) => w.id !== W.id)
  const grams = (s: string | undefined) => {
    s = (s || '').replace(/\s/g, '')
    const g = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2))
    return g
  }
  const me = grams(wzTitle(W) + W.pitch + W.core)
  const hits = works
    .map((w) => {
      const o = grams((w.title || '') + (w.W.pitch || '') + (w.W.core || ''))
      let c = 0
      me.forEach((x) => o.has(x) && c++)
      const sim = me.size && o.size ? c / Math.min(me.size, o.size) : 0
      return { title: w.title || '（未命名）', pitch: w.W.pitch, sim, same: w.W.genre === W.genre }
    })
    .filter((h) => h.sim >= 0.3 || (h.same && h.sim >= 0.15))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5)
  return { n: works.length, hits }
}

/** 旧 wzRollTitle：按一句话卖点掷一个剧名。随机源改成显式参数 rng（默认 Math.random）。 */
export function wzRollTitle(W: { pitch?: string }, prev?: string, rng: Rng = Math.random): string {
  const p=(W.pitch||'').trim();
  const nm=(p.match(/^([一-龥]{2,3}?)(?:变成|穿成|穿越|重生|成了|是|被|靠|在|的)/)||[])[1];
  const KW=['千金','嫡女','庶女','王妃','皇后','女帝','公主','郡主','世子','王爷','将军','少帅','总裁','首富','神医','战神','赘婿','影后','保镖','秘书','娇妻','大佬','师尊','掌门','仙尊'];
  const k=KW.find(x=>p.includes(x));
  const T: string[] = [];
  if(k) T.push(`${k}归来`,`${k}不好惹`,`重生之${k}`,`这个${k}有点狠`,`${k}的逆袭`,`惊鸿${k}`,`${k}今天也在翻盘`,`锦绣${k}`,`我家${k}是大佬`,`${k}她杀疯了`);
  if(nm) T.push(`${nm}传`,`${nm}的逆袭`,`${nm}不好惹`,`${nm}，开挂了`);
  if(k && /古代|穿/.test(p)) T.push(`穿成${k}后`,`${k}穿越记`,`一觉醒来成了${k}`);
  if(/重生/.test(p)) T.push('重生之后，我不忍了','重来一次，全都还回来');
  if(/系统|读心|异能|金手指/.test(p)) T.push('开局就有金手指','我能听见你的心声','系统逼我当大佬');
  if(!T.length) T.push('逆风翻盘','一路开挂','人生重启','命运反转','爽到最后','她杀疯了','惊鸿一瞥','这次换我赢');
  const pool=T.filter(x=>x!==prev);
  return pool[Math.floor(rng()*pool.length)];
}

/** 旧 wzGuess：按一句话卖点猜受众、配对、类型与爽点。 */
export interface WzGuess {
  pair?: string
  aud?: string
  genre: string
  hooks: string[]
}
export function wzGuess(t: string): WzGuess {
  const g = {} as WzGuess, has=(re: RegExp)=>re.test(t);
  if(has(/男男|耽美|BL/i)) g.pair='男男（BL）'; else if(has(/女女|百合|GL/i)) g.pair='女女（GL）';
  if(g.pair==='男男（BL）') g.aud='女性向';
  else if(has(/千金|王妃|皇后|嫡女|女主|她|闺蜜|婆婆|前夫/)) g.aud='女性向';
  else if(has(/战神|兵王|赘婿|神医|他|少年|废柴|老板/)) g.aud='男性向';
  g.genre = has(/重生|穿越|穿成|回到/) ? '重生穿越' : has(/系统|异能|读心|透视/) ? '能力系统' : has(/修仙|仙|魔|妖|玄/) ? '玄幻'
    : has(/古代|王府|宫|皇|将军|侯府|嫡/) ? '古装' : has(/总裁|霸总|豪门|首富/) ? '霸总' : has(/公司|职场|上司|同事/) ? '职场' : '都市';
  const h: string[]=[]; if(has(/千金|身份|身分|假|真/)) h.push('身分反转'); if(has(/逆袭|翻盘|崛起/)) h.push('逆袭'); if(has(/打脸|嘲笑|看不起/)) h.push('打脸');
  if(has(/追妻|火葬场/)) h.push('追妻'); if(has(/先婚|契约|闪婚/)) h.push('先婚后爱'); if(has(/重逢|前任|破镜/)) h.push('破镜重圆'); if(has(/宠|偏爱/)) h.push('被偏爱');
  g.hooks=h; return g;
}

/**
 * 旧 wzSaveWork 的纯逻辑：把设定 W 写成作品并合进作品列表。
 * 与旧实现的差别（调用方负责）：不读写 localStorage——list 为当前全部作品，返回新列表 list 与 item；
 * 旧实现会把 W.id 回写成 item.id，这里不改 W，调用方需自行 W.id = item.id；
 * 时间与随机源改成显式参数 now、rng。
 */
export function wzBuildWork(list: Work[], W: WzSettings, kind: 'simple' | 'vibe' | undefined, now: number, rng: Rng = Math.random): { list: Work[]; item: Work } {
  const title = wzTitle(W) || (W.pitch ? wzRollTitle(W, undefined, rng) : '') || '未命名'
  const next = list.slice()
  const { dup, guessed, ...keep } = W
  const old = next.find((x) => x.id === W.id)
  const item: Work = { ...(old || {}), id: W.id || 'w' + now.toString(36), title, W: { ...keep, id: undefined }, time: now }
  if (kind) item.kind = kind
  const i = next.findIndex((x) => x.id === item.id)
  if (i >= 0) next[i] = item
  else next.unshift(item)
  return { list: next, item }
}

export interface AssetSeedItem {
  fn: string
  label: string
  name: string
  profile: string
}

export interface AssetSeed {
  wid: string
  title: string
  items: AssetSeedItem[]
}

/**
 * 旧 wzSeedAssets 的纯逻辑：作品里的主角、对手、场景带进资产库的种子。
 * 返回 seed（旧实现写入 assetSeed）与 leads（用于提示 “已配好…”）；写存储、toast、跳转由调用方负责。
 */
export function wzSeedAssets(W: WzSettings, item: { id: string; title: string }): { seed: AssetSeed; leads: string[] } {
  const title = item.title
  const core = [W.pitch, W.core].filter((x) => x && x.trim()).join('；')
  const pair = W.pair || '男女'
  const leads =
    pair.startsWith('男男') ? ['男主', '男主 CP'] : pair.startsWith('女女') ? ['女主', '女主 CP'] : W.aud === '女性向' ? ['女主', '男主'] : ['男主', '女主']
  const items = [
    { fn: 'role-board', label: leads[0], name: leads[0], profile: [W.hero.trim(), core].filter(Boolean).join('；') },
    { fn: 'role-board', label: leads[1], name: leads[1], profile: `${leads[0]}的感情线对象。${core}` },
    { fn: 'role-board', label: '对手', name: '对手', profile: W.rival.trim() },
    { fn: 'scene-board', label: '主要场景', name: '主要场景', profile: W.world.trim() || [W.genre, core].filter(Boolean).join('；') },
  ].filter((x) => x.profile || x.label !== '对手')
  return { seed: { wid: item.id, title, items }, leads }
}
