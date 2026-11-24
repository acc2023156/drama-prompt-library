import { WZ_DEF, wzEps, wzMins } from './wz'
import { depthOf, heatOf } from './yq'
import type { Gen, Work, WzSettings } from './types'

export interface GenReq {
  logline: string
  audience: string
  setting: string
  episodes: number
  chars_per_episode: number
  explicit_ratio: [number, number]
  heat: string
  depth: string
  theme?: string
  tone?: string
  characters?: { name: string; role: string; brief: string }[]
}

/** 旧 genReq：把作品设定转成写作请求（startYq 写进 gen.req）。 */
export function genReq(W0: Partial<WzSettings>): GenReq {
  const W: WzSettings = Object.assign({}, WZ_DEF, W0), mins=wzMins(W)||1;
  const req: GenReq={logline:(W.pitch||'').trim(), audience:W.aud, setting:W.genre, episodes:Math.min(12,Math.max(2,+wzEps(W)||10)),
    chars_per_episode:Math.min(1300,Math.max(400,Math.round(mins*400))), explicit_ratio:[0,0] as [number, number], heat:heatOf(W), depth:depthOf(W)};
  const core=(W.core||'').trim(); if(core) req.theme=core;
  const tone=[W.qxMode, ...(W.hooks||[])].filter(Boolean); if(tone.length) req.tone=tone.join('、');
  if(W.qxRole) req.characters=[{name:'', role:'核心角色', brief:W.qxRole}];
  return req;
}

/** 旧 genParse：解析旧版云端作业结果（仅旧版作品数据会用到）。 */
export function genParse(r: { x_gateway?: any }): { title: string; logline: string; outline: { title: string; body: string }[]; eps: string[]; cast: { name: string; role: string; bio: string }[] } {
  const x=r.x_gateway||{}, fw=x.framework||{};
  const outline=(fw.episodes||[]).map((e: any,i: number)=>({title:e.title||`第${i+1}集`, body:[e.event, e.hook?`钩子：${e.hook}`:''].filter(Boolean).join('\n\n')}));
  const eps: string[]=[]; (x.episodes||[]).forEach((e: any,i: number)=>{ eps[(e.ep||i+1)-1]=e.text||''; });
  const cast: { name: string; role: string; bio: string }[]=[]; for(const m of String(x.cards||'').matchAll(/\*\*([^*（(]+)[（(]([^)）]+)[)）]\*\*\s*\n([\s\S]*?)(?=\n\s*\*\*|$)/g)) cast.push({name:m[1].trim(), role:m[2].trim(), bio:m[3].trim()});
  return {title:fw.title||x.title||'', logline:fw.logline||'', outline, eps, cast};
}

/**
 * 旧 updateGen 的纯逻辑：给作品 wid 的 gen 合并 patch（patch 为 null 则清空）。
 * 作品不存在返回 null（旧实现也是返回 null 且不写存储）；否则返回新列表与更新后的作品，不改入参。
 * 读写 localStorage 由调用方负责。
 */
export function applyGenPatch(list: Work[], wid: string, patch: Partial<Gen> | null): { list: Work[]; work: Work } | null {
  const i = list.findIndex((x) => x.id === wid)
  if (i < 0) return null
  const w: Work = { ...list[i] }
  w.gen = patch === null ? null : { ...(w.gen || {}), ...patch }
  if (w.gen && w.gen.data && w.gen.data.title && !((w.W || {}).title || '').trim()) w.title = w.gen.data.title
  const next = list.slice()
  next[i] = w
  return { list: next, work: w }
}
