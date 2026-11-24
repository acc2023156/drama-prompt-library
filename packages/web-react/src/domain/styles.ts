import { firstCode } from './library'
import type { Entry } from './types'

export interface StyleItem {
  n: string
  tab: string
  t: string
  g: string
}

export const G = ['linear-gradient(160deg,#4a5d78,#1f2633)','linear-gradient(160deg,#6b5a4a,#2a221c)','linear-gradient(160deg,#55705f,#1f2a24)','linear-gradient(160deg,#6a4e6e,#261c29)'];

/**
 * 旧 styleList：风格 = 官方内置 + 项目画风块 + 6.5 仙侠 + 组装器里的自定义。
 * 读全局的地方改成显式参数：coreStyles（旧 DATA.core.styles）、byId（旧全局 byId，可由 makeById 得到）、custom（旧 store('asm').custom）。
 */
export function styleList(coreStyles: Record<string, string>, byId: Record<string, Pick<Entry, 'body'>>, custom?: string | null): StyleItem[] {
  const L: StyleItem[]=[
    {n:'无', tab:'官方', t:'', g:'#111'},
    {n:'真人写实', tab:'真人', t:'真人电影写实风格，自然光影，皮肤、布料与材质纹理真实。', g:G[0]},
    {n:'古风写实', tab:'真人', t:'古风写实风格，柔光滤镜，传统服饰与陈设考究，色调温润。', g:G[1]},
    {n:'2D 动漫', tab:'2D', t:'2D 日系动漫风格，线条干净，赛璐璐上色，色彩明快。', g:G[3]},
    {n:'3D 渲染', tab:'3D', t:'3D 渲染风格，PBR 材质，柔和全局光照，细节精致。', g:G[2]},
  ];
  for(const [n,t] of Object.entries(coreStyles)) L.push({n, tab:'真人', t:t.trim(), g:'linear-gradient(160deg,#5d6066,#26282c)'});
  const xian = byId['6.5'] && firstCode(byId['6.5'].body);
  if(xian) L.push({n:'国漫 3D 仙侠', tab:'3D', t:xian.trim(), g:'linear-gradient(160deg,#4f6f8f,#2a2342)'});
  const mine=custom;
  if(mine) L.push({n:'我的自定义', tab:'我的风格', t:mine.trim(), g:'linear-gradient(160deg,#731dfb,#2a1150)'});
  return L;
}
