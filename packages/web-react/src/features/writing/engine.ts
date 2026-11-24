import { applyGenPatch, genReq } from '../../domain/gen'
import { KW_RAW, KW_STOP, kwOk, type ListingSrc } from '../../domain/listing'
import type { CastMember, Gen, GenData, Work, WzSettings } from '../../domain/types'
import { WZ_DEF, wzEps } from '../../domain/wz'
import { depthOf, parseJSON, YQ_PLAN, yqCardPrompt, yqPlanPrompt } from '../../domain/yq'
import type { WritingDeps } from './deps'
import { yqWriteEpisode } from './episode'
import { type ChatOptions, type Run, yqChat } from './request'

/*
 * 写作引擎（旧 yqDrive、startYq、listingSources 与作品页里推进写作状态的几处按钮，快照第 2807–2860、2955–3014 行）。
 * 不含界面：纯 TypeScript，不 import React、不读 DOM；依赖全部经 WritingDeps 注入。
 * 状态都存在作品的 gen 字段（pl.works），经 domain 的 applyGenPatch 合并后整表写回，写入的 JSON 原文与旧页面一致。
 */

/** 某作品的引擎状态。running：本页正在为它写；refresh：旧页面调 yqRefresh 重画作品页的次数（每次加 1）。 */
export interface WritingState {
  readonly running: boolean
  readonly refresh: number
}

/** 进入作品页时的结果（旧 viewVibeScript 前半段的分支）。 */
export type WorkPhase =
  | 'missing' // 找不到作品
  | 'login' // 未登录，显示登录闸（旧 loginGate）
  | 'wait' // 排大纲中，显示等待页（旧 genWait）
  | 'fail' // 没写成且没有大纲，显示失败页（旧 genFail）
  | 'ready' // 显示作品页（写作中、已完成、出错但有大纲、看草稿）

export interface WritingEngine {
  startYq(wid: string): Work | null
  driveYq(wid: string): Promise<void>
  enterWork(wid: string): WorkPhase
  redoEpisode(wid: string, k: number): WorkPhase
  resumeWriting(wid: string): WorkPhase
  retryWork(wid: string): WorkPhase
  showDraft(wid: string): WorkPhase
  stopYq(wid: string): boolean
  stopAll(): void
  isRunning(wid: string): boolean
  getState(wid: string): WritingState
  subscribe(wid: string, listener: () => void): () => void
  listingSources(heat: string): Promise<ListingSrc>
  yqChat(model: string, content: string, max_tokens?: number, opts?: ChatOptions & { signal?: AbortSignal }): Promise<string>
}

const IDLE: WritingState = Object.freeze({ running: false, refresh: 0 })
const busyNote = (k: number, sec?: number): string | null => (k ? `云端忙线，${sec} 秒后第 ${k} 次重试…` : null)

export function createWritingEngine(deps: WritingDeps): WritingEngine {
  /** 正在写的作品（旧 yqRun），值为本次任务的停止开关。 */
  const runs = new Map<string, { ac: AbortController; done: Promise<void> }>()
  const states = new Map<string, WritingState>()
  const listeners = new Map<string, Set<() => void>>()

  const readWorks = (): Work[] => deps.storage.get('works') || []
  const find = (wid: string): Work | undefined => readWorks().find((x) => x.id === wid)

  function setState(wid: string, next: Partial<WritingState>): void {
    states.set(wid, Object.freeze({ ...(states.get(wid) || IDLE), ...next }))
    listeners.get(wid)?.forEach((fn) => fn())
  }

  /** 旧 updateGen：作品不存在时不写，返回 null。 */
  function updateGen(wid: string, patch: Partial<Gen> | null): Work | null {
    const r = applyGenPatch(readWorks(), wid, patch)
    if (!r) return null
    deps.storage.set('works', r.list)
    return r.work
  }

  /** 旧 yqDrive 的主体。写入一律经 put / refresh：任务被停止后两者都不再生效，作品停在停止前最后一次写入的状态。 */
  async function drive(wid: string, run: Run): Promise<void> {
    const live = () => !run.signal!.aborted
    const put = (patch: Partial<Gen>) => (live() ? updateGen(wid, patch) : null)
    const refresh = () => { if (live()) setState(wid, { refresh: (states.get(wid) || IDLE).refresh + 1 }) }
    const cur = () => find(wid)
    try{
      let w=cur(); if(!w||!w.gen) return;
      if(!w.gen.data){
        const W: WzSettings=Object.assign({},WZ_DEF,w.W), n=Math.max(2,Math.min(80,+wzEps(W)||10));
        let card=w.gen.card||null;
        const opt={onRetry:(k: number,sec?: number)=>{ put({note:busyNote(k,sec)}); }};
        if(depthOf(W)==='重度' && !card){ card=parseJSON(await yqChat(YQ_PLAN, yqCardPrompt(W,n), 6000, opt, run)); put({card}); refresh(); }
        const pl=parseJSON(await yqChat(YQ_PLAN, yqPlanPrompt(W,n,card), 8000, opt, run));
        const outline=(pl.episodes||[]).slice(0,n).map((e: any,i: number)=>({title:e.title||`第${i+1}集`, event:e.event||'', hook:e.hook||'', body:[e.event, e.hook?`钩子：${e.hook}`:''].filter(Boolean).join('\n\n')}));
        if(!outline.length) throw new Error('outline empty');
        const castSrc: any[]=card&&(card.cast||[]).length?card.cast!.map(c=>({...c, bio:[c.want&&`想要${c.want}`, c.flaw&&`弱点：${c.flaw}`, c.voice&&`说话：${c.voice}`].filter(Boolean).join('；')})):(pl.cast||[]);
        const data: GenData={title:((card&&card.title)||pl.title||'').trim(), logline:(card&&card.logline)||pl.logline||'', outline, eps:[], card, fixed:[],
          cast:castSrc.filter(c=>c&&c.name).map((c): CastMember=>({name:String(c.name).trim(), role:String(c.role||'配角'), bio:`${c.age?c.age+' 岁，':''}${c.bio||''}`, look:c.look||''}))};
        put({status:'writing', data}); refresh();
      }
      for(;;){
        w=cur(); if(!live()||!w||!w.gen||w.gen.status!=='writing'||!w.gen.data) break;
        const d=w.gen.data, i=d.outline.findIndex((_,k)=>!d.eps[k]);
        if(i<0){ put({status:'done'}); refresh(); break; }
        const Wx: WzSettings=Object.assign({},WZ_DEF,w.W);
        const [txt, fixedN]=await yqWriteEpisode(d, Wx, i, {
          save:()=>{ put({data:d}); },
          onRetry:(k,sec)=>{ put({note:busyNote(k,sec)}); refresh(); } }, run);
        d.eps[i]=txt; (d.fixed=d.fixed||[])[i]=fixedN; put({data:d, note:null}); refresh();
      }
    }catch(e){ put({status:'error', err:String((e as Error).message||e)}); refresh(); }
  }

  /**
   * 按作品当前 gen 状态继续写（旧 yqDrive）。单飞：该作品已有任务在跑时不另起，直接返回那次任务的 Promise。
   * 状态推进：gen.data 为空 → 先出策划卡（重度且没有 card）再出大纲，写 status:'writing' 与 data；
   * 然后循环写 outline 里第一个 eps 为空的集，直到全部写完（status:'done'），或作品被删、status 不再是 'writing'；
   * 任何错误写 status:'error' 与 err，已写好的集与批次保留。gen 为空或作品不存在时什么都不做。
   */
  function driveYq(wid: string): Promise<void> {
    const had = runs.get(wid)
    if (had) return had.done
    const ac = new AbortController()
    const entry = { ac, done: Promise.resolve() }
    runs.set(wid, entry)
    setState(wid, { running: true })
    entry.done = drive(wid, { deps, signal: ac.signal }).finally(() => {
      if (runs.get(wid) !== entry) return
      runs.delete(wid)
      setState(wid, { running: false })
    })
    return entry.done
  }

  /** 旧 startYq：重开写作状态（engine:'yq'、status:'outline'、at、req、data:null、err:null），其余 gen 字段（如 card）保留。不启动写作。 */
  function startYq(wid: string): Work | null {
    const w = find(wid)
    if (!w) return null
    return updateGen(w.id, { engine: 'yq', status: 'outline', at: deps.now(), req: genReq(w.W), data: null, err: null })
  }

  /**
   * 进入作品页时推进写作状态（旧 viewVibeScript 第 2969–2974 行与 genWait 第 2932 行）：
   * 1. gen.req 与按当前设定算出的 genReq 不同（且 status 不是 'off'）：视为设定已改，当作没有 gen；
   * 2. 没有 gen 且未登录 → 'login'；没有 gen 已登录 → startYq 后重新判断；
   * 3. status 含 starting/queued/running/outline → 'wait'，yq 引擎时同时 driveYq；
   * 4. status 'error' 且没有大纲（或非 yq 引擎）→ 'fail'；
   * 5. status 'writing' → driveYq；其余 → 'ready'。
   * 页面在调用前要先完成旧第 2966–2967 行的 lastVibe 与 vname/seed 写入。
   */
  function enterWork(wid: string): WorkPhase {
    const w = find(wid)
    if (!w) return 'missing'
    let gen = w.gen
    if(gen && gen.req && gen.status!=='off' && JSON.stringify(gen.req)!==JSON.stringify(genReq(w.W))) gen=null;
    if(gen==null && !deps.storage.get('auth')) return 'login';
    if(gen==null){ startYq(wid); return enterWork(wid); }
    if(/starting|queued|running|outline/.test(gen.status as string)){ if(gen.engine==='yq') void driveYq(wid); return 'wait'; }
    if(gen.status==='error' && !(gen.engine==='yq'&&gen.data)) return 'fail';
    if(gen.status==='writing') void driveYq(wid);
    return 'ready';
  }

  /** 单集重写（旧“重写”按钮）：清掉第 k 集（从 0 起）的正文，status 改回 'writing'，再进入作品页（会接着写）。作品没有大纲时只做进入。 */
  function redoEpisode(wid: string, k: number): WorkPhase {
    const w = find(wid)
    const d = w && w.gen && w.gen.data
    if (d) { d.eps[k] = null; updateGen(wid, { data: d, status: 'writing', err: null }) }
    return enterWork(wid)
  }

  /** 出错后接着写（旧“接着写”按钮，作品页进度条上）：status 改回 'writing'、清 err，再进入作品页。 */
  function resumeWriting(wid: string): WorkPhase {
    updateGen(wid, { status: 'writing', err: null })
    return enterWork(wid)
  }

  /** 失败页“再写一次”（旧 gRetry）：yq 引擎且已有大纲时同 resumeWriting；否则清空 gen，重新开写。 */
  function retryWork(wid: string): WorkPhase {
    const g = find(wid)?.gen
    updateGen(wid, g && g.engine === 'yq' && g.data ? { status: 'writing', err: null } : null)
    return enterWork(wid)
  }

  /** 失败页“先看草稿”（旧 gDraft）：status 改为 'off'，作品页改用本地模板草稿。 */
  function showDraft(wid: string): WorkPhase {
    updateGen(wid, { status: 'off' })
    return enterWork(wid)
  }

  /**
   * 停止该作品的写作任务，效果等同旧页面关闭：中止进行中的请求与重试等待，之后不再写任何状态。
   * 作品停在最后一次写入的状态（通常是 'outline' 或 'writing'，已写好的集与批次都在），再 driveYq / enterWork 就接着写。
   * 返回是否确有任务被停止。
   */
  function stopYq(wid: string): boolean {
    const entry = runs.get(wid)
    if (!entry) return false
    runs.delete(wid)
    entry.ac.abort()
    setState(wid, { running: false })
    return true
  }

  /** 旧 listingSources：并行拉 /words 与 /hot（失败当空），按上架资料的规则过滤热词（30 个）与热点（15 个）。 */
  async function listingSources(heat: string): Promise<ListingSrc> {
    const get=(u: string): Promise<any>=>deps.fetch(deps.apiBase()+u).then(r=>r.ok?r.json():null).catch(()=>null);
    const [wj,hj]=await Promise.all([get('/words'), get('/hot')]);
    const words=((wj&&wj.words)||[]).filter((x: any)=>x.cat!=='社会，名单命中' && String(x.word||'').length>=2 && !KW_STOP.has(x.word) && kwOk(x.word) && (heat==='高尺度'||!KW_RAW.test(x.word)))
      .sort((a: any,b: any)=>(b.heat||0)-(a.heat||0)).slice(0,30).map((x: any)=>`${x.word}（热度 ${x.heat}，${x.trend}）`);
    const topics=((hj&&hj.topics)||[]).filter((x: any)=>!/政|军|国际/.test(x.cat||'') && kwOk(x.t)).slice(0,15).map((x: any)=>`${x.t}（${x.cat||''}，${x.trend||''}）`);
    return {words, topics, at:(wj&&wj.at)||(hj&&hj.at)||''};
  }

  return {
    startYq,
    driveYq,
    enterWork,
    redoEpisode,
    resumeWriting,
    retryWork,
    showDraft,
    stopYq,
    stopAll() {
      for (const wid of [...runs.keys()]) stopYq(wid)
    },
    isRunning: (wid) => runs.has(wid),
    getState: (wid) => states.get(wid) || IDLE,
    subscribe(wid, listener) {
      let set = listeners.get(wid)
      if (!set) listeners.set(wid, (set = new Set()))
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
    listingSources,
    yqChat: (model, content, max_tokens, opts) => yqChat(model, content, max_tokens, opts, { deps, signal: opts?.signal }),
  }
}
