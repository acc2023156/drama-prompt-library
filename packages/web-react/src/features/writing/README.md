# 写作引擎 `features/writing`

逐集写作的流程控制：请求、重试与换模型、SSE 流式读取、策划卡 / 大纲 / 分场 / 分批并行、断点续写、单集重写，以及上架资料的热词热点来源。迁自旧页面 M10（快照 `tests/fixtures/legacy-template.1cf6f6c.html` 第 2634–2860 行）与作品页里推进写作状态的几处按钮（第 2955–3014 行）。提示词构造在 `src/domain/yq.ts`，本目录不含界面。

## 文件

| 文件 | 内容 |
|---|---|
| `request.ts` | `yqReadStream`、`yqOnce`、`yqChat`；常量 `YQ_WAIT`、`YQ_STREAM`、`YQ_IDLE_MS`、`YQ_CAP_MS` |
| `episode.ts` | `yqWriteEpisode`（短集一次写；3 分钟以上先分场，每批 2 场、3 路并行；重度自检与修稿） |
| `engine.ts` | `createWritingEngine(deps)`：驱动循环、状态推进入口、单飞、停止、订阅、`listingSources` |
| `deps.ts` | 注入接口 `WritingDeps`（fetch、定时器、时间、存储、后端地址、登录面板、提示条） |
| `index.ts` | 默认依赖接到 lib 层，导出模块级单例 `writing` 与各入口 |

`engine.ts`、`episode.ts`、`request.ts`、`deps.ts` 不 import React，不读 DOM 与全局（由 `tests/unit/writing-engine.test.ts` 检查）；`index.ts` 引用的 lib 模块自身依赖 React，只在接线层。

## 入口（`import { … } from 'features/writing'`）

wid 都是作品 id。返回 `WorkPhase` 的入口在推进状态后都按“进入作品页”重新判断（同旧页面按钮处理完调 `viewVibeScript`）。

| 入口 | 对应旧实现 | 语义与副作用 |
|---|---|---|
| `enterWork(wid): WorkPhase` | `viewVibeScript` 第 2969–2974 行、`genWait` 第 2932 行 | 见下节判断条件；需要时调 `startYq`、`driveYq`。调用前页面要先完成第 2966–2967 行：写 `pl.lastVibe`，作品缺 `vname` 或 `seed` 时用 `vibeSx` 补上并写回 |
| `startYq(wid): Work \| null` | `startYq(w)` | gen 合并 `{engine:'yq', status:'outline', at:now, req:genReq(W), data:null, err:null}`，其余字段（如 `card`、`note`）保留；不启动写作；作品不存在返回 null 且不写 |
| `driveYq(wid): Promise<void>` | `yqDrive` | 按 gen 当前状态接着写，见“流程”；单飞；Promise 在本次任务结束（完成、出错写回、被停止）时 resolve，不会 reject |
| `redoEpisode(wid, k): WorkPhase` | “重写”按钮（第 3014 行） | 第 k 集（从 0 起）正文置 null，gen 合并 `{data, status:'writing', err:null}`，再 `enterWork`（会只重写这一集）。旧页面只在不在写时显示该按钮 |
| `resumeWriting(wid): WorkPhase` | 进度条“接着写”（第 2992 行） | gen 合并 `{status:'writing', err:null}`，再 `enterWork` |
| `retryWork(wid): WorkPhase` | 失败页“再写一次”（gRetry） | yq 引擎且有大纲：同 `resumeWriting`；否则 gen 置 null，再 `enterWork`（已登录会重新开写） |
| `showDraft(wid): WorkPhase` | 失败页“先看草稿”（gDraft） | gen 合并 `{status:'off'}`，再 `enterWork`（返回 `'ready'`，页面用本地模板草稿） |
| `stopYq(wid): boolean` | 无（等同关闭旧页面） | 中止进行中的请求与重试等待，之后不再写任何存储、不弹登录与提示；作品停在最后一次写入的状态。返回是否确有任务 |
| `stopAll(): void` | 无 | 停止全部任务 |
| `isRunning(wid): boolean` | `yqRun[wid]` | 本页是否正在为该作品写 |
| `getState(wid): WritingState` | 无 | `{running, refresh}` 冻结快照，只在变化时换新对象；未知作品返回同一个空闲快照 |
| `subscribe(wid, fn): () => void` | `yqRefresh(wid)` | `running` 变化与每次 `refresh` 加 1 时调用 fn；返回取消订阅 |
| `listingSources(heat): Promise<ListingSrc>` | `listingSources` | 并行 `GET /words`、`GET /hot`（不带鉴权，失败当空），热词按规则过滤后按热度取 30 个，热点去掉政、军、国际与红线后取 15 个，`at` 取 `/words` 的、其次 `/hot` 的 |
| `yqChat(model, content, max_tokens?, opts?)` | `yqChat` | 带重试的单次写作调用，给上架资料等用；`opts.onRetry(k, 秒)`，`opts.signal` 中止时以 `WritingStopped` 结束 |

另导出：`createWritingEngine(deps)`（测试或另起实例用）、`defaultDeps()`、`WritingStopped` / `isStopped`、常量 `YQ_WAIT`、`YQ_STREAM`、`YQ_IDLE_MS`、`YQ_CAP_MS`、`YQ_PATH`、`BATCH_SIZE`、`BATCH_WORKERS`、类型 `WorkPhase`、`WritingState`、`WritingEngine`、`WritingDeps`。

## 进入作品页的判断（`enterWork`，原样迁自旧 `viewVibeScript`）

| 顺序 | 条件 | 结果 |
|---|---|---|
| 0 | 作品不存在 | `'missing'` |
| 1 | gen 有 `req`、`status` 不是 `'off'`、`JSON.stringify(req)` 与按当前设定算的 `genReq(W)` 不同 | 视为设定已改，本次当作没有 gen（不写存储） |
| 2 | 没有 gen 且未登录（`pl.auth` 为空） | `'login'`（登录闸）；登录后再调 `enterWork` |
| 3 | 没有 gen 且已登录 | `startYq` 后从第 0 步重来 |
| 4 | `status` 含 `starting`、`queued`、`running`、`outline`（正则 `test`，`undefined` 不命中） | `'wait'`；`engine==='yq'` 时同时 `driveYq` |
| 5 | `status==='error'` 且不是（yq 引擎且有 `data`） | `'fail'` |
| 6 | `status==='writing'` | `driveYq`，`'ready'` |
| 7 | 其余（`done`、`off`、yq 出错但有大纲、未知状态） | `'ready'` |

## 流程（`driveYq`）

1. 作品不存在或没有 gen：直接结束。
2. `gen.data` 为空：集数 n = `wzEps` 夹在 2–80（非数字按 10）；思考深度为重度且 `gen.card` 为空时先用 `YQ_PLAN` 写策划卡（max_tokens 6000），写回 `{card}` 并重画；再用 `YQ_PLAN` 排大纲（8000），取前 n 集，空则报 `outline empty`；人物取策划卡（有 cast 时）否则大纲的 cast；写回 `{status:'writing', data}` 并重画。
3. 循环：重读作品，作品没了、gen 没了、`status` 不是 `'writing'`、没有 `data` 就停；找第一个 `eps` 为空的集，没有就写 `{status:'done'}`、重画、结束；否则写这一集（`yqWriteEpisode`），写回 `{data, note:null}` 并重画。
4. 任何错误：写 `{status:'error', err:消息}` 并重画。已写好的集、已排好的分场与已写好的批次都在 `data` 里保留。
5. 忙线重试：大纲阶段写 `note`（不重画），写作阶段写 `note` 并重画；文案 `云端忙线，N 秒后第 K 次重试…`，重试后成功时写 `note:null`。

单集：每集时长不到 3 分钟一次写完（写作模型按尺度：高尺度 `YQ_HOT`，其他 `YQ_WRITE`；max_tokens 点到为止 3000，其他 4000）。3 分钟以上先排分场（场数 `yqSceneCount`，存进 `data.part[i]` 并写回），每 2 场一批、3 路同时写，每写好一批立刻写回；某批出错后其他路不再取新批，在途的批照常写回，然后抛出第一个错误；第 1 集在正文前加角色年龄声明；写完删掉 `part[i]`。重度时每段写完用 `YQ_PLAN` 自检（1500），有问题就修，修稿长度不超过原稿 6 成则弃用；自检与修稿的错误只有消息含“登录”“积分”时抛出。

请求：`POST /yq/v1/chat/completions`，头 `X-Tianji-Code`（`pl.tjCode`，空串兜底）、`Content-Type`、已登录时 `Authorization: Bearer`；请求体键序 `model, messages, max_tokens(默认 3000), temperature:0.8, stream:true`。响应头 `X-Points` 有值且已登录时写回 `pl.auth` 的积分。401：删 `pl.auth`、打开登录面板、抛“请先登录”；402：提示“今天的积分用完了，明天 0 点补满”、抛“积分不足”；二者与其他 4xx 不重试。429、5xx、网络中断、空回应（去掉 `<think>` 段后为空）、流中断可重试：最多 4 次，前三次失败后等 5、15、45 秒，第 4 次改用 `YQ_PLAN`。流式读取：按行取 `data:`，`[DONE]` 或 `finish_reason` 算结尾；没有结尾标记、超过 100 秒没有新字（空 delta、注释行等保活不算）或整段超过 15 分钟都视为流中断。

## 单飞、订阅与“离开页面”

- 单飞：引擎是模块级单例（`index.ts` 的 `writing`），按作品 id 登记正在跑的任务；重复 `driveYq` / `enterWork`（含 StrictMode 重复挂载、多个组件同时挂载）直接返回已有任务，不重复请求、不重复扣积分。
- 视图刷新：作品数据（gen）写在 `pl.works`，页面用 `useStored('works')` 订阅即可随每次写入重画；`subscribe` / `getState` 提供运行状态与旧 `yqRefresh` 的重画时机（`refresh` 计数），可直接给 `useSyncExternalStore`：

```ts
const st = useSyncExternalStore((fn) => subscribe(wid, fn), () => getState(wid))
useEffect(() => { setPhase(enterWork(wid)) }, [wid])   // 不要在卸载时 stopYq
```

- 离开页面：旧页面在站内换路由时写作继续（`yqRefresh` 只在当前 hash 是该作品时重画），只有关闭或刷新整页才停；回来时 `viewVibeScript` 读到 `status` 为 `outline`（等待页）或 `writing`（作品页）就再调 `yqDrive`，从存储里的状态接着写：大纲没写好就重写大纲（已写好的策划卡保留在 `gen.card`），已写好的集跳过，写到一半的集只补没写成的批次。新引擎保持同一语义：组件卸载不要停止任务；关闭整页时任务随页面结束；`stopYq` 用于需要显式停下的场合（效果与关闭页面相同，之后 `enterWork` / `driveYq` 接着写）。
- 多标签页：单飞只在本页内有效，两个标签页同时打开同一作品会各写各的，同旧页面。

## 与旧实现的差异

| 项 | 旧页面 | 新引擎 | 原因 |
|---|---|---|---|
| `startYq` 参数 | 作品对象 | 作品 id（从存储读设定） | 旧调用处传入的就是刚从存储读出的作品 |
| `driveYq` 重复调用的返回值 | 立即 resolve 的新 Promise | 正在跑的那次任务的 Promise | 便于调用方等待结束，对界面不可见 |
| `yqDrive` 里 `continue` 之后的死代码 | 存在（不可达） | 不迁移 | 不可达 |
| `stopYq`、`subscribe`、`getState` | 无 | 新增 | 停止等同关闭页面；订阅替代 `yqRefresh` |
| 401 后打开登录面板 | `openLogin()` 并重画账户面板 | `deps.openLogin()`；账户面板订阅 `pl.auth` 自动重画 | 架构约定 |

`startGen` / `POST /jobs` 是旧页面的死代码，未迁移；旧版作业状态（`starting`、`queued`、`running`）只在 `enterWork` 里按原条件进等待页，轮询 `GET /jobs/:id` 归作品页。

## 测试

| 文件 | 内容 |
|---|---|
| `tests/parity/writing-harness.ts` | 虚拟时钟、记录写入的 localStorage、按脚本回应的 fetch 与 SSE 桩、在 vm 里实跑旧引擎（经 `legacy.ts` 的 `legacyTopLevel`） |
| `tests/parity/writing-request.test.ts` | SSE 分片切法、100 秒与 15 分钟、yqOnce 状态码与积分、yqChat 重试与换模型 |
| `tests/parity/writing-drive.test.ts` | 整段写作流程、失败与重试路径、运行中改作品、单飞、进入作品页、按钮、停止与续写 |
| `tests/parity/writing-listing.test.ts` | `listingSources` |
| `tests/unit/writing-engine.test.ts` | 订阅与快照、单飞、停止、公开 `yqChat`、默认依赖与单例、核心不依赖框架与全局 |
