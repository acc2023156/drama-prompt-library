/**
 * 七星行星排行的数据（旧 viewScriptSimple 内联常量与 hotData / roleData / hotTabs / hotItems，site-template.html 第 2338–2357 行）。
 * 只放纯数据与纯函数；热点实时数据由调用方传入（旧 window._hotLive）。
 */

export type Range = '1h' | '24h' | '7d'
export type Board = 'hot' | 'role'

/** GET /hot 的结构（只列首页用到的字段）。 */
export interface HotFeed {
  at?: string | number
  topics: { t: string; cat?: string; ideas?: string[]; [k: string]: unknown }[]
  works?: { t: string; genre?: string; ideas?: string[]; [k: string]: unknown }[]
}

/** 热点主题行：[名称, 短词, 热度, 声量, 趋势]。 */
export type HotRow = [string, string, number, number, string]
/** 实时热点行：[标题, 灵感（可能缺失）, 热度, 序号]。 */
export type LiveRow = [string, string | undefined, number, number]
/** 角色行：[名称, 频道, 角色序号, 热度, 声量, 趋势, 标签]。 */
export type RoleRow = [string, 'male' | 'female', number, number, number, string, string]
export type StarRow = HotRow | LiveRow | RoleRow

export const HOT_BASE: [string, string, number, number, string][] = [['AI 短剧','短剧',94,31,'+12'],['重生复仇','重生',89,22,'+8'],['真假千金','千金',83,16,'+5'],['先婚后爱','先婚',77,12,'+3'],['末日求生','末日',72,9,'+11'],['悬疑反转','反转',66,6,'+4'],['古装权谋','古装',61,4,'-1']];
// 开阳演员库精选：仅带入公开展示所需的姓名与分类；角色能力仍映射到天玑本地角色原型。
export const ROLE_PICK: [string, 'male' | 'female', number][] = [['小倩','female',0],['苏晚','female',1],['沈知微','female',2],['江眠琴','female',3],['邓依依','female',4],['乔乔','female',5],['乔安','female',6]];
export const STAR_COLORS = ['#8b45ff','#3282ff','#00a88b','#f09a3e','#e44f82','#7183a4','#b76cff'];
/* 热点（实时）：每个细项一组渐层色，最多 7 项 */
export const HOT_PAL: Record<string, [string, string]> = {'热点':['#ff4d6d','#ffb547'],'爆款':['#8b45ff','#ff5fa2'],'生活':['#14b88a','#9be15d'],'社会':['#2f7bff','#5fd4ff'],'娱乐':['#ff5fa2','#c86bff'],'财经':['#f08c00','#ffe066'],'科技':['#00b8d9','#6f5bff']};
// 剧本七星：点星体 → 带一句起手故事进氛围写作，直接出作品卡
export const HOT_PITCH: Record<string, string> = {'AI 短剧':'被 AI 取代工作的普通人，意外发现自己能看见 AI 的漏洞','重生复仇':'她重生回被背叛的前一天，这一次要让所有人付出代价','真假千金':'被换掉人生二十年的真千金回家，假千金抢先一步对她示好','先婚后爱':'为了家族协议闪婚的两个人，约定一年后离婚','末日求生':'末日第一天，她囤满了物资，前男友却敲开了她的门','悬疑反转':'新搬来的邻居每晚准点敲门，说自己才是这里的屋主','古装权谋':'被废的皇后带着一道密旨回宫，要扳倒当朝首辅'};

export const hexMix = (a: string, b: string, t: number): string => '#'+[1,3,5].map(k=>Math.round(parseInt(a.slice(k,k+2),16)*(1-t)+parseInt(b.slice(k,k+2),16)*t).toString(16).padStart(2,'0')).join('');
export const hotPal = (k: string): string[] => { const [a,b]=HOT_PAL[k]||['#7b6cff','#3fd0c9']; return Array.from({length:7},(_,i)=>hexMix(a,b,i/6)); };

/** 实时热点的分类页签：热点、爆款加 topics 里出现的分类，最多 7 个；没有实时数据时为空。 */
export function hotTabs(H: HotFeed | null): string[] {
  if (!H) return []
  return ['热点','爆款',...new Set(H.topics.map(t=>t.cat).filter(Boolean) as string[])].slice(0,7)
}

/** 实时热点某一分类的前 7 项；没有实时数据或该分类为空时返回 null（回落到内置示例）。 */
export function hotItems(H: HotFeed | null, cat: string): LiveRow[] | null {
  if (!H) return null
  // 旧实现直接 H.works.map，后端总会带 works；缺失时这里按空列表处理，避免整页渲染失败
  const list: [string, string | undefined][] = cat==='爆款' ? (H.works||[]).map(w=>[w.t,(w.ideas&&w.ideas[0])||w.genre]) : H.topics.filter(t=>cat==='热点'||t.cat===cat).map(t=>[t.t,(t.ideas&&t.ideas[0])||''])
  return list.length ? list.slice(0,7).map((x,i): LiveRow=>[x[0],x[1],99-i*6,i]) : null
}

/** 内置热点示例：热度随时间范围加减，最低 45。 */
export const hotData = (range: Range | string): HotRow[] => HOT_BASE.map((d,i)=>[d[0],d[1],Math.max(45,d[2]+(range==='1h'?[3,2,-1,2,5,-2,1][i]:range==='7d'?[-5,1,3,4,-2,5,2][i]:0)),d[3],d[4]])

export const roleData = (): RoleRow[] => ROLE_PICK.map(([name,g,i],k)=>[name,g,i,92-k*6,Math.max(5,24-k*3),k<3?`+${8-k*2}`:`+${k-2}`,'开阳精选 · 真人现代'])
