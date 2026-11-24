import { pick, SX_NAMES, sxOutline, sxScript } from './sx'
import { WZ_DEF } from './wz'
import type { CastMember, Gender, Rng, SxTemplate, Work, WzSettings } from './types'

export type VibeWork = Pick<Work, 'id' | 'title' | 'W'> & Partial<Pick<Work, 'vname' | 'vname2' | 'seed' | 'gen'>>

/** 氛围写作作品对应的本地草稿状态（旧 vibeSx 返回值，vibeData 会补 cast、real、written）。 */
export interface VibeSx {
  id: string
  title: string
  name: string
  name2: string
  g: Gender
  role: SxTemplate
  seed: number
  outline: [string, string][]
  idea: string
  leads: string[]
  W: WzSettings
  cast?: CastMember[]
  real?: boolean
  written?: boolean[]
}

export const vibeLeads = (W: Pick<WzSettings, 'pair' | 'aud'>): string[] => { const p=W.pair||'男女';
  return p.startsWith('男男') ? ['男主','男主 CP'] : p.startsWith('女女') ? ['女主','女主 CP'] : W.aud==='女性向' ? ['女主','男主'] : ['男主','女主']; };
/** 旧 vibeSx：作品设定转本地草稿状态。主角名未定时随机取，随机源改成显式参数 rng（默认 Math.random）。 */
export function vibeSx(w: VibeWork, rng: Rng = Math.random): VibeSx {
  const W: WzSettings=Object.assign({}, WZ_DEF, w.W), leads=vibeLeads(W), g=leads[0].startsWith('女')?'female':'male';
  const pitch=(W.pitch||'').trim();
  const m=pitch.match(/^([一-龥]{2,3}?)(?:变成|穿成|穿越|重生|成了|是|被|靠|在|的)/);
  const name = w.vname || (m && m[1]) || pick(SX_NAMES[g], rng);
  const t: SxTemplate={type:`${W.genre} · ${leads[0]}`, surface:pitch.split(/[，,。]/)[0]||W.genre, hidden:(W.core||'').trim().split('\n')[0]||'一张没人知道的底牌',
    gold:W.qxMode||W.hooks[0]||'身分反转', hook:pitch, rel:`${name}-${(W.rival||'').trim()||'对手'}`, genres:[W.genre,...W.hooks].join('、'), note:(W.core||'').trim()};
  const g2 = leads[1].startsWith('女')?'female':'male', pool=SX_NAMES[g2].filter(x=>x!==name);
  const name2 = w.vname2 || pool[(w.seed||1)%pool.length];
  return {id:w.id, title:w.title, name, name2, g, role:t, seed:w.seed||1, outline:sxOutline(t,name,g), idea:(W.core||'').trim(), leads, W};
}

/** 旧 epMat：从一集剧本文本里提取出场人物与场景。 */
export function epMat(t: string): { people: string[]; locs: string[] } {
  const people=new Set<string>(), locs=new Set<string>();
  for(const m of t.matchAll(/^出场人物：(.+)$/gm)) m[1].split(/[、，,]/).map(x=>x.trim()).filter(Boolean).forEach(x=>people.add(x));
  for(const m of t.matchAll(/^场景：[^·]*·\s*([^·\n]+?)\s*·/gm)) locs.add(m[1]);
  for(const m of t.matchAll(/^#{2,4}\s*场\s*\d+\s*[｜|]\s*([^（(\n]+)/gm)) locs.add(m[1].trim());
  for(const m of t.matchAll(/^([一-龥]{2,5})(?:（[^）]*）)?：[「“]/gm)) people.add(m[1]);
  for(const m of t.matchAll(/^\d+-\d+\s+[^／\n]*／([^／（(\n]+)[^／\n]*／(.+)$/gm)){ locs.add(m[1].trim()); m[2].split(/[、，,]/).map(x=>x.trim()).filter(x=>x&&x.length<=5).forEach(x=>people.add(x)); }
  return {people:[...people], locs:[...locs]};
}

/** 旧 vibeData：作品的剧本——有模型结果就用模型的，否则用模板草稿（sxScript）。 */
export function vibeData(w: VibeWork, rng: Rng = Math.random): { s: VibeSx; eps: string[] } {
  const s=vibeSx(w, rng), g=w.gen;
  if(g&&(g.status==='done'||g.status==='writing'||(g.status==='error'&&g.engine==='yq'))&&g.data&&g.data.outline.length){
    const d=g.data;
    s.outline=d.outline.map((o)=>[o.title,o.body] as [string, string]); s.cast=d.cast; s.real=true; s.written=d.outline.map((_,i)=>!!d.eps[i]);
    const eps=s.outline.map(([h,b]: [string, string],i: number)=>`# 第${i+1}集：${h}\n`+(d.eps[i] ? d.eps[i].replace(/^#{1,3}\s*第\s*\d+\s*集[^\n]*\n+/,'') : b));
    return {s, eps};
  }
  return {s, eps:sxScript(s)};
}
