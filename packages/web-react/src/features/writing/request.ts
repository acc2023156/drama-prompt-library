import { YQ_PLAN } from '../../domain/yq'
import type { WritingDeps } from './deps'

/*
 * 写作接口调用（旧 yqReadStream、yqOnce、yqChat，快照第 2634–2674 行）。
 * 忙线（429）、逾时（504）、5xx、网路断掉、空回应、串流中断都会自动重试 3 次（等 5、15、45 秒），最后一次改用较快的模型。
 */

export const YQ_WAIT: readonly number[] = [5, 15, 45]
/** 串流：模型边写边传。设成 false 就回到整段一次回传。 */
export const YQ_STREAM = true
/** 超过 100 秒没有新字（上游的保活 PING 不算）就中止。 */
export const YQ_IDLE_MS = 100000
/** 整段超过 15 分钟就中止。 */
export const YQ_CAP_MS = 15 * 60000
export const YQ_PATH = '/yq/v1/chat/completions'

/** 引擎抛出的错误：retry 为真表示可重试（同旧实现给 Error 挂 retry）。 */
export type YqError = Error & { retry?: boolean }
const fail = (message: string, retry: boolean): YqError => Object.assign(new Error(message), { retry })

/** 停止写作（stopYq）后，进行中的调用以这个错误结束；它不可重试，引擎收到后不再写任何状态。 */
export class WritingStopped extends Error {
  readonly stopped = true
  constructor() {
    super('已停止写作')
  }
}
export const isStopped = (e: unknown): boolean => e instanceof WritingStopped

/** 一次写作任务的上下文：依赖 + 停止信号（stopYq 时 abort）。 */
export interface Run {
  deps: WritingDeps
  signal?: AbortSignal
}

function checkStop(run: Run): void {
  if (run.signal && run.signal.aborted) throw new WritingStopped()
}

/** 等 ms 毫秒（旧 await new Promise(r=>setTimeout(r,ms))）；停止时清掉定时器并以 WritingStopped 结束。 */
function sleep(ms: number, run: Run): Promise<void> {
  return new Promise((resolve, reject) => {
    const h = run.deps.setTimeout(() => {
      run.signal?.removeEventListener('abort', onStop)
      resolve()
    }, ms)
    const onStop = () => {
      run.deps.clearTimeout(h)
      reject(new WritingStopped())
    }
    run.signal?.addEventListener('abort', onStop)
  })
}

/** 读 SSE：按行取 data:，[DONE] 或 finish_reason 算结尾；没有结尾标记、读取出错（含超时中止）都抛可重试的“串流中断”。 */
export async function yqReadStream(r: Response, ac: AbortController, deps: Pick<WritingDeps, 'setTimeout' | 'clearTimeout'>): Promise<string> {
  const rd=r.body!.getReader(), dec=new TextDecoder(); let buf='', out='', ended=false, idle: unknown;
  const arm=()=>{ deps.clearTimeout(idle); idle=deps.setTimeout(()=>ac.abort(), YQ_IDLE_MS); }, cap=deps.setTimeout(()=>ac.abort(), YQ_CAP_MS);
  try{ arm();
    for(;;){ const {done,value}=await rd.read(); if(done) break;
      buf+=dec.decode(value,{stream:true}); const lines=buf.split('\n'); buf=lines.pop() as string;
      for(const l of lines){ const s=l.trim(); if(!s.startsWith('data:')) continue; const d=s.slice(5).trim();
        if(d==='[DONE]'){ ended=true; continue; }
        try{ const c=(JSON.parse(d).choices||[])[0]||{}, t=(c.delta&&c.delta.content)||''; if(t) arm(); out+=t; if(c.finish_reason) ended=true; }catch{ /* 同旧实现：坏行跳过 */ } } } }
  catch{ throw fail('串流中断', true); }
  finally{ deps.clearTimeout(idle); deps.clearTimeout(cap); }
  if(!ended) throw fail('串流中断', true);
  return out;
}

/** 请求体，与旧页面逐字节一致（键顺序 model、messages、max_tokens、temperature、stream）。 */
export const yqBody = (model: string, content: string, max_tokens?: number): string =>
  JSON.stringify({model, messages:[{role:'user',content}], max_tokens:max_tokens||3000, temperature:0.8, ...(YQ_STREAM?{stream:true}:{})})

/**
 * 调一次写作接口（旧 yqOnce）。头：X-Tianji-Code、JSON、已登录时 Bearer；响应头 X-Points 回写积分。
 * 401：登出并打开登录面板，抛“请先登录”；402：提示积分用完，抛“积分不足”；两者都不重试。
 * 其他非 2xx：429 与 5xx 可重试；回应去掉 <think> 段后为空也可重试。
 */
export async function yqOnce(model: string, content: string, max_tokens: number | undefined, run: Run): Promise<string> {
  checkStop(run);
  const { deps } = run, A=deps.storage.get('auth'), ac=new AbortController();
  const onStop=()=>ac.abort(); run.signal?.addEventListener('abort', onStop);
  try{
    let r: Response; try{ r=await deps.fetch(deps.apiBase()+YQ_PATH,{method:'POST', signal:ac.signal, headers:{'X-Tianji-Code':deps.storage.get('tjCode')||'','Content-Type':'application/json',...(A?{'Authorization':'Bearer '+A.token}:{})},
      body:yqBody(model, content, max_tokens)}); }
    catch{ checkStop(run); throw fail('网路中断', true); }
    checkStop(run);
    const left=r.headers.get('X-Points'); if(left!==null&&A){ A.user.points=+left; deps.storage.set('auth', A); }
    const sse=r.ok && /event-stream/.test(r.headers.get('Content-Type')||'');
    const j: any=sse?{}:await r.json().catch(()=>({}));
    checkStop(run);
    if(r.status===401){ deps.storage.remove('auth'); deps.openLogin(); throw new Error('请先登录'); }
    if(r.status===402){ deps.toast('今天的积分用完了，明天 0 点补满'); throw new Error('积分不足'); }
    if(!r.ok) throw fail(String((j.error&&(j.error.message||j.error))||('HTTP '+r.status)), r.status===429||r.status>=500);
    const raw=sse?await yqReadStream(r, ac, deps):(((j.choices||[])[0]||{}).message?.content||'');
    checkStop(run);
    const txt=String(raw).replace(/<think>[\s\S]*?<\/think>/g,'').trim();
    if(!txt) throw fail('空白回应', true);
    return txt;
  } finally { run.signal?.removeEventListener('abort', onStop); }
}

export interface ChatOptions {
  /** 重试回调：第 k 次重试前调用 onRetry(k, 等待秒数)；重试后成功时调用 onRetry(0)。 */
  onRetry?: (k: number, sec?: number) => void
}

/** 带重试的写作调用（旧 yqChat）：最多 4 次，失败后依次等 5、15、45 秒；第 4 次改用 YQ_PLAN（本来就是 YQ_PLAN 则不变）。 */
export async function yqChat(model: string, content: string, max_tokens: number | undefined, opts: ChatOptions | undefined, run: Run): Promise<string> {
  for(let k=0;;k++){
    const m=(k===YQ_WAIT.length && model!==YQ_PLAN) ? YQ_PLAN : model;
    try{ const t=await yqOnce(m, content, max_tokens, run); if(k&&opts&&opts.onRetry) opts.onRetry(0); return t; }
    catch(e){ if(!(e as YqError).retry||k>=YQ_WAIT.length) throw e; checkStop(run); if(opts&&opts.onRetry) opts.onRetry(k+1, YQ_WAIT[k]); await sleep(YQ_WAIT[k]*1000, run); }
  }
}
