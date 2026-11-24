import type { GenData, WzSettings } from '../../domain/types'
import { wzMins } from '../../domain/wz'
import {
  depthOf, heatOf, parseJSON, YQ_HOT, YQ_PLAN, YQ_WRITE, yqBatchPrompt, yqCheckPrompt, yqEpPrompt, yqFixPrompt, yqSceneCount, yqScenePrompt,
} from '../../domain/yq'
import { type ChatOptions, isStopped, type Run, yqChat } from './request'

export interface EpisodeHooks {
  /** 分场与每个写好的批次存进 d.part 后调用，由调用方把 d 写回作品（中途失败时下次只补没写成的批次）。 */
  save?: () => void
  onRetry?: ChatOptions['onRetry']
}

/** 每批场数（旧注释写“每批 3 场”，代码是 2）与同时写的批数。 */
export const BATCH_SIZE = 2
export const BATCH_WORKERS = 3

/**
 * 写一集（旧 yqWriteEpisode，快照第 2753–2781 行）：短集（不到 3 分钟）一次写完；3 分钟以上先排分场，再分批（每批 2 场）3 路同时写。
 * 重度思考时每段写完自检，有问题就修（修稿短于原稿 6 成则弃用）；自检出错只在登录、积分错误时抛出。
 * 会改动 d.part（分场与已写批次），返回 [本集文本, 修正条数]。
 */
export async function yqWriteEpisode(d: GenData, W: WzSettings, i: number, hooks: EpisodeHooks | undefined, run: Run): Promise<[string, number]> {
  const H=hooks||{}, opt={onRetry:H.onRetry};
  const writer=heatOf(W)==='高尺度'?YQ_HOT:YQ_WRITE, mx=heatOf(W)==='点到为止'?3000:4000;
  const check=async (txt: string): Promise<[string, number]>=>{ if(depthOf(W)!=='重度') return [txt,0];
    try{ const chk=parseJSON(await yqChat(YQ_PLAN, yqCheckPrompt(d, W, i, txt), 1500, opt, run)), iss=(chk.issues||[]).filter((x: any)=>x&&x.problem);
      if(iss.length){ const fx=await yqChat(writer, yqFixPrompt(d, W, i, txt, iss), mx, opt, run); if(fx&&fx.length>txt.length*.6) return [fx, iss.length]; } }catch(e){ if(isStopped(e)||/登录|积分/.test((e as Error).message)) throw e; }
    return [txt,0]; };
  if((wzMins(W)||1)<3){ const t=await yqChat(writer, yqEpPrompt(d, W, i), mx, opt, run); return check(t); }
  // 分场与写好的批次都存起来：中途失败，下次只补没写成的那几批
  const P=((d.part=d.part||{})[i]=(d.part[i]||{}));
  if(!P.plan||!P.plan.length){ const n=yqSceneCount(W); P.plan=(parseJSON(await yqChat(YQ_PLAN, yqScenePrompt(d, W, i, n), 4000, opt, run)).scenes||[]).slice(0,n); P.parts=[]; P.fixed=0; H.save&&H.save(); }
  const plan=P.plan!; if(!plan.length) throw new Error('scene plan empty');
  const batches: [number, number][]=[]; for(let k=0;k<plan.length;k+=BATCH_SIZE) batches.push([k, Math.min(plan.length,k+BATCH_SIZE)]);
  P.parts=P.parts||[];
  const parts=P.parts;
  const tailOf=(k: number)=>k===0?(d.eps[i-1]||'').slice(-500):`（上一场 ${i+1}-${k}：${plan[k-1].beat}）`;
  const todo=batches.map((_,b)=>b).filter(b=>!parts[b]); let next=0, firstErr: unknown=null;
  const worker=async()=>{ for(;;){ if(firstErr) return; const q=next++; if(q>=todo.length) return; const b=todo[q], [f,t]=batches[b];
    try{ const raw=await yqChat(writer, yqBatchPrompt(d, W, i, plan, f, t, tailOf(f)), 4000, opt, run);
      const [txt,fx]=await check(raw); parts[b]=txt; P.fixed=(P.fixed||0)+fx; H.save&&H.save(); }
    catch(e){ firstErr=firstErr||e; } } };
  await Promise.all(Array.from({length:BATCH_WORKERS}, ()=>worker()));
  if(firstErr) throw firstErr;
  let text=parts.join('\n\n');
  if(i===0){ const ages=d.cast.filter(c=>/\d/.test(c.bio||'')).map(c=>`${c.name} ${(c.bio!.match(/(\d+)\s*岁/)||[])[1]||''} 岁`).join('；');
    text=`【角色年龄】所有角色均已年满 18 岁${ages?'。'+ages:''}。所有亲密关系皆为双方自愿。\n\n`+text; }
  const fixed=P.fixed||0; delete d.part[i];
  return [text, fixed];
}
