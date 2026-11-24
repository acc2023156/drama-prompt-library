# 工程更新记录

记录代码、配置、部署相关的改动。提示词库本身的更新见 [CHANGELOG.md](CHANGELOG.md)（它会被打包进网站的“更新记录”页，不要把工程改动写进去）。

**约定**：每次改动都要在这里记一笔——按日期倒序，每个日期下用列表逐条写修改项，条目前标 `[新增]` / `[修改]` / `[删除]`，并写明涉及的文件或模块。

---

## 2026-11-24

基线：`a3541a4`（monorepo 改造后）。

### 后端 `packages/worker`

- [删除] 按 IP 的每日调用次数限制（`YQ_DAILY`、`YQ_COUNT`、`CF-Connecting-IP`）；写作接口只按登录积分计费 — `src/index.js`
- [新增] dotenv：启动时载入 `.env`，已有环境变量优先；新增 `.env.example`；`.env` 加入 `.gitignore` — `src/server.js`、`.env.example`、`.gitignore`
- [修改] CORS 来源白名单改由 `CORS_ALLOW_ORIGINS`（逗号分隔）读取，原写死的三个来源挪作默认值，设了变量即整组替换 — `src/config.js`、`src/index.js`
- [修改] 数据库由 Cloudflare D1（SQLite）迁到 PostgreSQL：改用 `pg` 连接池（`DATABASE_URL`）；SQL 全部改写（占位符 `$n`、`SUM(条件)` 改 `COUNT(*) FILTER`、`MAX` 改 `GREATEST`、`AUTOINCREMENT` 改 `BIGSERIAL`、`ORDER BY … NULLS LAST`）；bigint / numeric 按数字返回 — `src/db.js`、`src/account.js`
- [新增] 启动时自动建表，并新增索引 `yqlog_day`、`yqlog_at`、`ledger_uid`；不再每个请求检查建表（已被下方“迁移工具”条目取代）— `src/db.js`
- [修改] 键值储存 KV 迁到 PostgreSQL：热点、热词最新一批存 `snapshots` 表；长剧本任务存 `jobs` 表（结果保留 7 天、请求体保留 2 小时），服务每小时清理过期数据 — `src/store.js`、`src/index.js`、`src/server.js`
- [修改] 扣点、退点、补点改为事务并锁用户行（`SELECT … FOR UPDATE`），退点返回精确余额 — `src/account.js`
- [修改] 口令与密码（`X-Admin-Key`、`X-Job-Secret`、`X-Tianji-Code`）改为常量时间比较；登录 token 算法不变，已登录用户不掉线（已用旧算法互相验证） — `src/account.js`
- [删除] 写作上游写死的 90 秒超时（原为躲 Cloudflare 的 100 秒硬切）；新增可选 `UPSTREAM_TIMEOUT_MS`，默认不设 — `src/index.js`、`src/config.js`
- [删除] Cloudflare 专有内容：`wrangler.toml`、`wrangler` 依赖与 `dev` / `deploy` 脚本、D1 / KV 绑定、`ctx.waitUntil`、`.dev.vars` 与 `.wrangler` 的忽略项 — `packages/worker`、`.gitignore`
- [新增] Node HTTP 入口与适配层：`Request` / `Response` 适配、请求体上限 `MAX_BODY_BYTES`（默认 5MB，超出 413）、浏览器断开即中止上游请求、优雅退出；缺少 `DATABASE_URL` 或 `AUTH_SECRET` 时拒绝启动 — `src/server.js`、`src/http.js`
- [修改] 上游地址或密钥未配置时返回 503（原为请求上游失败后回 502） — `src/index.js`
- [新增] 集成测试 13 项（登录、扣点与退点、已去掉的限流、CORS、热点热词、后台、任务流转、请求体上限）；用 `TEST_DATABASE_URL` 指定测试库 — `test/api.test.js`
- [修改] `package.json`：`type: module`，脚本改为 `dev` / `start` / `test`，依赖 `dotenv`、`pg`；根目录删 `deploy:worker`、加 `start:worker`、`test:worker`；新增 `package-lock.json` — `package.json`、`packages/worker/package.json`

### 流式写作 `packages/worker`

背景：前端 11-24 起写作默认发 `stream: true`（提交 `bda418c`），该提交的后端部分只在 `cloudflare-worker` 分支的 Cloudflare 版里，这里移植到 Node 版。

- [新增] 写作代理支持流式响应：边收边转发；流结束才判成败，没收到结尾标记（`[DONE]` 或 `finish_reason`）就退点；浏览器中途断开立即取消上游请求，已收到结尾标记算成功、否则退点；每次请求只结算一次 — `src/index.js`
- [新增] 流式集成测试 4 项（边收边转发且首包先到、无结尾标记退点、上游中途断连退点、浏览器断开取消上游并退点），共 18 项；已用旧版对照验证这些用例能抓到缺口 — `test/api.test.js`
- [修改] `packages/worker/README.md` 路由表注明写作代理支持流式

### 数据库迁移 `packages/worker`

- [新增] 引入迁移工具 `node-pg-migrate`：纯 SQL 迁移文件放 `migrations/`，版本记录在 `pgmigrations` 表；单事务、失败整批回滚、带咨询锁并发安全（`--advisory-lock-mode wait`）— `package.json`、`migrations/`
- [新增] 初始迁移 `20261124073829054_init-schema.sql`：6 张表和 3 个索引，全部 `IF NOT EXISTS`，已有数据的旧库可直接接管；附回退段 — `migrations/`
- [删除] 启动时建表（`ensureSchema` 与写死的 `CREATE TABLE`）— `src/db.js`、`src/server.js`
- [修改] 启动时检查迁移：有未执行的迁移就拒绝启动并提示 `npm run migrate`，避免代码与表结构不一致 — `src/server.js`、`src/migrations.js`
- [新增] npm 脚本：`migrate`、`migrate:dry`、`migrate:status`（有待执行项时退出码 2）、`migrate:create`、`migrate:down`；根目录加 `migrate:worker`、`migrate:create:worker` — `package.json`、`packages/worker/package.json`、`scripts/migration-status.js`
- [修改] 测试改为用迁移建表，新增 2 项用例（迁移文件命名与 Up / Down 规范、执行后无待执行项且可重复执行），共 14 项 — `test/api.test.js`
- [修改] `packages/worker/README.md` 新增“数据库迁移”章节（命令、规则、上线顺序）；文档中“启动时自动建表”的说法改掉

### 容器镜像

- [新增] `Dockerfile`：三阶段构建（前端静态页、后端生产依赖、运行镜像），一个镜像包含 API 服务、数据库迁移、迁移状态检查和构建好的前端静态页；非 root 用户运行；构建参数 `TIANJI_API_BASE`、`GIT_SHA`、`VERSION` — `Dockerfile`
- [新增] 入口分发脚本，子命令 `server`（默认）、`migrate`、`migrate:dry`、`migrate:status`，其余命令原样透传 — `docker/entrypoint.sh`
- [新增] `.dockerignore`：排除 `.git`、`node_modules`、`.env`、本地构建产物；提示词 `*.md` 是前端构建的输入，不排除 — `.dockerignore`
- [修改] 有未执行迁移而拒绝启动时的提示，同时给出本地与镜像两种执行方式 — `src/server.js`
- [修改] `packages/worker/README.md` 新增“容器镜像”章节

### 前端 `packages/web`

- [修改] 后端地址由写死的 `workers.dev` 地址改为建置时环境变量 `TIANJI_API_BASE`（留空表示同源，末尾斜杠自动去掉）— `site-template.html`、`build.py`
- [修改] `pages.yml`、`publish-site.yml` 建置时传入仓库变量 `TIANJI_API_BASE` — `.github/workflows`
- [修改] 重试说明注释去掉 524 状态码 — `site-template.html`

> ⚠️ 发布前需在 `acc2023156/drama-prompt-library` 仓库设置变量 `TIANJI_API_BASE`，否则下次发布的网页会请求同源地址。

### 文档

- [修改] `packages/worker/README.md` 重写（运行方式、环境变量、测试）；`README.md` 与 `build.py` 中 `packages/worker` 的描述去掉 Cloudflare
- [新增] 本文件 `CHANGELOG-dev.md`
- [修改] 根目录的 `sources.md`（提示词来源与许可附录）移到 `docs/sources.md`，用 `git mv` 保留历史；同步更新引用：`_meta/manifest.json` 的附录路径（`build.py all` 依赖）、`build.py` 生成 README 的链接文字、`README.md`、`split.py` 的输出路径。已验证 `build.py all` 输出与移动前逐字节一致
- [新增] `docs/README.md`：docs 目录索引
- [修改] 提示词内容目录 `01-outline`、`02-adaptation`、`03-revision`、`06-video`、`07-compliance`、`archive`（共 101 个文件）移到 `docs/` 下，用 `git mv` 保留历史；`_meta`、`data` 仍在根目录
- [修改] `build.py`：新增 `DOCS` 基准目录，6.0 模板、画风块、条目、`patches` 列表都从 `docs/` 读取；网站路由用的逻辑目录键（`01-outline` 等）不变，README 生成器里的路径文字同步更新 — `packages/web/build.py`
- [修改] `_meta/manifest.json` 的 90 条条目路径加 `docs/` 前缀；一次性拆分脚本 `split.py` 同步改为写入 `docs/`
- [修改] 网站条目详情页显示的文件路径带 `docs/` 前缀（页面其余内容不变）
- [修改] 生成的 `README.md` 里陈旧的 `npm run deploy:worker` 改为当前可用的脚本；`docs/README.md` 补全目录索引
- 验证：`build.py all`、`video`（含成人内容条款）、`patches`、`site` 的输出与移动前一致（仅路径前缀不同）；README 94 个相对链接全部有效；镜像构建通过

### 后端重构：TypeScript + Hono + Prisma + Zod `packages/worker`

对外接口（路由、请求头、状态码、JSON 结构、积分规则、流式扣点退点）保持不变，原 18 项集成测试原样通过；有意的行为变化单列在本节末尾。

- [新增] TypeScript 严格模式（`strict`、`noUncheckedIndexedAccess`）：`tsconfig.json`（类型检查，含测试）、`tsconfig.build.json`（编译到 `dist/`）— `packages/worker`
- [修改] 路由与中间件改用 Hono + `@hono/node-server`：`src/app.ts` 的 `createApp({ cfg, prisma })` 挂载 `src/routes/` 下按领域拆分的 `account`、`admin`、`feeds`、`jobs`、`yq`、`models`；启动入口 `src/server.ts`（dotenv、配置校验、迁移检查、定时清理、优雅退出）
- [修改] CORS 改用 `hono/cors`，语义不变（白名单内回显来源，否则回第一个白名单项；暴露 `X-Points`；预检 204）— `src/app.ts`
- [修改] 请求体上限 `MAX_BODY_BYTES`：`Content-Length` 已超限时直接回 413 且不读请求体，分块上传交给 `hono/body-limit`；超限后 keep-alive 连接仍可复用（直接用 `bodyLimit` 会让 node-server 在 500ms 后强关该连接，客户端复用时 ECONNRESET，已加回归用例）— `src/app.ts`
- [修改] HEAD 请求：hono 默认用 GET 路由应答 HEAD，这里改回旧版的精确匹配，只有 `/`、`/me` 应答 HEAD，其余回 404 — `src/app.ts`
- [新增] 统一响应与错误处理：JSON 响应默认 `Cache-Control: no-store`（`/hot`、`/words` 为 `max-age=300`）；`HttpError`、Zod 校验失败、畸形 JSON、未知异常统一输出 `{error: 文本}`，旧版错误文本全部保留 — `src/lib/http.ts`、`src/lib/validate.ts`、`src/app.ts`
- [新增] Zod 校验：环境变量（非法 URL、非法数字拒绝启动，空值用默认）；各路由的路径参数、查询参数、JSON 请求体（`@hono/zod-validator` + `readJson`）。JSON 请求体不看 `Content-Type`，与旧版一致；热点、热词推送字段缺失或类型不对时给默认值，不整批拒收 — `src/config.ts`、`src/routes/*`
- [修改] 数据访问改用 Prisma 7.10.1（`@prisma/client`、`@prisma/adapter-pg`、`prisma` 三者固定同一版本）：BIGINT 时间戳对外一律转 number；扣点、退点用 `$transaction` + `SELECT … FOR UPDATE` 锁用户行，退点返回精确余额；后台统计（`FILTER`、`GREATEST`）用参数化的 `$queryRaw` 标签模板 — `src/lib/db.ts`、`src/lib/points.ts`、`src/lib/store.ts`、`src/routes/admin.ts`
- [修改] 流式写作移植到 Hono：边收边转发、流结束才判成败、无结尾标记退点、浏览器断开取消上游、每次请求只结算一次；实测 `@hono/node-server` 在客户端断开时会触发 `c.req.raw.signal` 的 abort 与响应流的 cancel — `src/routes/yq.ts`
- [修改] 迁移工具由 node-pg-migrate 换成 Prisma Migrate：`prisma/schema.prisma` 为表结构唯一来源，初始迁移 `prisma/migrations/20261124100000_init`；部分列收紧为 NOT NULL — `prisma/`、`prisma.config.ts`
- [修改] 启动时的迁移检查改为对照 `prisma/migrations/` 与 `_prisma_migrations` 表（`finished_at` 非空且未回滚才算已执行），有待执行项拒绝启动，提示本地与镜像两种命令 — `src/lib/migrations.ts`、`src/server.ts`
- [修改] npm 脚本：`build`（prisma generate + tsc）、`dev`（tsx watch）、`start`（node dist/server.js）、`test`、`typecheck`、`migrate`、`migrate:dev`、`migrate:status`、`prisma:generate`；`dev`、`test`、`typecheck` 前自动 `prisma generate`。根目录新增 `build:worker`、`typecheck:worker`、`migrate:dev:worker`，删除 `migrate:create:worker` — `package.json`、`packages/worker/package.json`
- [修改] 依赖：新增 hono、`@hono/node-server`、`@hono/zod-validator`、zod、Prisma 三件套，开发依赖 typescript、tsx、`@types/node`；移除 pg、node-pg-migrate — `packages/worker/package.json`、`package-lock.json`
- [修改] 测试改写为 TypeScript（`node --import tsx --test`），原 18 项断言不变（两项迁移用例改为检查 Prisma 迁移目录与 `migrate deploy` 重复执行无副作用）；新增 5 项：环境变量校验、请求校验（畸形 JSON、手机号、后台参数、作品请求体）、热点热词宽容解析、未知路径 404 与错误响应头、请求体超限（分块 413、连接复用），共 23 项 — `test/api.test.ts`
- [删除] 旧 JS 源码 `src/index.js`、`account.js`、`store.js`、`server.js`、`http.js`、`db.js`、`config.js`、`migrations.js`；node-pg-migrate 的 `migrations/` 与 `scripts/migration-status.js`；旧测试 `test/api.test.js`
- [新增] `.gitignore` 忽略 `packages/worker/src/generated/`（prisma generate 产物）与 `packages/worker/dist/`；`.dockerignore` 同步排除
- [修改] `Dockerfile` 改为四阶段：前端静态页、编译（全部依赖 + prisma generate + tsc）、生产依赖（含 prisma CLI 与 schema-engine）、运行镜像；运行镜像装 `openssl`（schema-engine 需要）、含 `dist/`、`prisma/`、`prisma.config.ts`，不含 TypeScript 源码；设 `CHECKPOINT_DISABLE=1`；保留构建参数 `TIANJI_API_BASE`、`GIT_SHA`、`VERSION` 与 `/app/site`，仍以 `node` 用户运行 — `Dockerfile`
- [修改] 入口子命令：`server` 改为 `node dist/server.js`，`migrate` 改为 `prisma migrate deploy`，`migrate:status` 改为 `prisma migrate status`（有待执行时退出码 1）；其余原样透传 — `docker/entrypoint.sh`
- [删除] `migrate:dry`（npm 脚本与镜像子命令）
- [修改] `packages/worker/README.md` 重写技术栈、目录、迁移、接管旧开发库、镜像、测试章节；`build.py` 生成 README 时对 `packages/worker` 的描述改为 TypeScript + Hono + Prisma + PostgreSQL，并重新生成 `README.md` — `packages/worker/README.md`、`packages/web/build.py`、`README.md`
- 验证：类型检查通过；集成测试 23 项全过（连续 8 次）；去掉流式结算逻辑后 3 个流式失败用例全部失败；Docker 实测构建、未迁移拒绝启动（退出码 1）、`migrate`、`migrate:status`、两个 `migrate` 容器并发、`GET /` 与登录、`docker stop` 0.19 秒退出码 0、缺 `AUTH_SECRET` 拒绝启动；node-pg-migrate 建过的旧库按 README 步骤接管，数据保留

有意的行为变化：

- 未知路径统一回 404 `{error: "not found"}`（旧版对未匹配路径会先做来源与通行码检查，常回 401 `bad access code`；`/admin/` 下未知路径旧版会回 400 `bad json`）
- `POST /works/:id` 的请求体必须是 JSON 对象，否则 400 `work must be a JSON object`；`POST /jobs` 同样要求对象，否则 400 `job must be a JSON object`（旧版对字符串、数字、`null` 会 500，对数组会建出请求体为 `[]` 的任务）
- 移除 `migrate:dry`
- 数据库列收紧为 NOT NULL（`users`、`works`、`yqlog`、`ledger`、`snapshots` 的业务列）
- 环境变量写了非法值（如 `PORT=abc`、`MAX_BODY_BYTES=-1`、`YQ_BASE` 不是完整 URL）时拒绝启动（旧版静默回退默认值）
- 请求体为 JSON `null` 等非对象时，`/auth/login`、`/admin/points`、`/admin/role`、`/hot/push`、`/words/push` 回 400 或按默认值处理（旧版抛异常回 500）

其他细微差异（不影响浏览器 CORS 判定与现有调用方，已逐条核对）：

- CORS 的 `Access-Control-Allow-Methods`、`Allow-Headers`、`Max-Age` 只出现在预检响应里（旧版每个响应都带）；`Allow-Methods` 写法为 `GET,POST,DELETE,OPTIONS`（无空格）
- 旧版不带 CORS 头的响应（热点热词推送、任务回报、413、500）现在也带 CORS 与 `Vary` 头；413、500 响应带 `Cache-Control: no-store`
- 热点热词推送字段类型不对时归一为默认值：如 `score` 为字符串 `"8"` 存为数字 8（旧版原样存字符串），`cat` 等非字符串存为空串，`ideas` 非数组存为空数组
- 路径参数按 URL 解码后校验（如 `/works/%41` 视为 id `A`；旧版按原始路径匹配，回 404）

### 前端 React 重构 P0：脚手架与构建链路 `packages/web-react`

方案见 Obsidian `plans/web-react/`；旧页面与发布链路不变，本节只新增新包与校验。

- [新增] `build.py data [-o 文件]` 子命令：输出网页内嵌的内容数据 JSON；`build_site` 里组装数据的部分抽成 `site_data()`，`site`、`all`、`video`（含 `--option 成人内容`）、`patches`、`index` 的输出与改前逐字节一致 — `packages/web/build.py`
- [新增] workspace 包 `@tianji/web-react`：Vite 8.3.8、React 19.3.1、TypeScript 7.0.2、`@vitejs/plugin-react` 6.3.0、`vite-plugin-singlefile` 2.3.4，产物为 `dist/` 下唯一的 `index.html`；`src/main.tsx` 目前只渲染构建信息占位 — `packages/web-react/package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`、`src/main.tsx`
- [新增] Vite 插件 `tjInject`：构建与 dev 时把数据 JSON 与 `TIANJI_API_BASE`（去尾部斜杠、留空同源）写进 `index.html`；数据取自 `TJ_DATA` 文件或现调 `build.py data`；`<` 一律转义为 `\u003c` — `plugins/tj-inject.ts`、`plugins/load-data.ts`、`src/data.ts`
- [新增] 构建后校验脚本：只有 `index.html`、JS/CSS 内联、内嵌数据与 `build.py data` 深度相等、`TJ_API_BASE` 与环境变量规范化结果一致 — `scripts/check-dist.mjs`
- [新增] 旧实现抽取器：用 acorn 从 `site-template.html`（只读）抽出顶层函数与常量，在 `node:vm` 中运行；`parse()` 冒烟对照 14 项、注入函数单测 9 项（vitest 5.1.1）— `tests/parity/legacy.ts`、`tests/parity/parse.test.ts`、`tests/unit/inject.test.ts`
- [新增] 只构建不发布的工作流：push main、pull_request 时安装 web-react 依赖、类型检查、测试、构建、校验产物；不用密钥，不限定仓库（与 `pages.yml`、`publish-site.yml` 不同，它不发布，需要在每个副本上都能校验）— `.github/workflows/web-react-build.yml`
- [修改] 根目录新增脚本 `build:web-react`、`dev:web-react`、`test:web-react`、`typecheck:web-react`；`package-lock.json` 只新增 web-react 的依赖，已有包版本不变 — `package.json`、`package-lock.json`
- [修改] `.gitignore` 忽略 `packages/web-react/dist/` — `.gitignore`
- [新增] 包说明 — `packages/web-react/README.md`
- 验证：`Dockerfile` 不改，加入新 workspace 后镜像构建通过，镜像 ID 与改前相同；缺 `DATABASE_URL`、`AUTH_SECRET` 时 `server` 仍拒绝启动（退出码 1）

### 前端 React 重构 P1-B：领域纯函数迁移 `packages/web-react`

对照基准：`packages/web/site-template.html` 在 `aa38d84`（该文件最后改动提交 `1cf6f6c`）；追平之后的改动不在本节范围。

- [新增] 领域层 `src/domain/`：旧页面的纯函数迁成带类型的 TypeScript 模块，不依赖 DOM、localStorage、网络、时间与全局变量；随机源与时间一律作显式参数（随机源默认 `Math.random`）— `src/domain/*.ts`
- [新增] 作品设定：`WZ_DEF`、`wzEps`、`wzMins`、`wzScore`、`wzTitle`、`wzNeeds`、`wzSettings`、`wzPrompt`、`wzDupCheck`、`wzRollTitle`、`wzGuess`；`wzSaveWork` 与 `wzSeedAssets` 的纯逻辑拆为 `wzBuildWork`、`wzSeedAssets` — `src/domain/wz.ts`
- [新增] 标准版：`sxOutline`、`sxPrompt`、`sxRng`、`sxScript`、`sxScriptText`、`sxHL`、`pick`；`sxSaveWork` 的纯逻辑拆为 `sxBuildWork` — `src/domain/sx.ts`
- [新增] 氛围写作与风格：`vibeLeads`、`vibeSx`、`vibeData`、`epMat`、`styleList`、`asmGenreStyle`、`assemble`（旧 `viewAssembler` 内的闭包，改为显式传入 core 数据）— `src/domain/vibe.ts`、`styles.ts`、`assembler.ts`
- [新增] 写作提示词：`heatOf`、`depthOf`、`cardText`、`parseJSON`、全部 `yq*Prompt`；`genReq`、`genParse`、`updateGen` 的纯逻辑 `applyGenPatch`；写作请求、重试、流式、驱动循环不迁移，留给写作引擎任务 — `src/domain/yq.ts`、`gen.ts`
- [新增] 上架资料：`kwOk`、`KW_STOP`、`KW_BLOCK`、`KW_RAW`、`listingPrompt`、`listingClean`、`lstDay`、`listingText`；`listingSources` 的拉取不迁移 — `src/domain/listing.ts`
- [新增] 提示词库与作品列表：`cmpId`、`firstCode`、`usage`、`licClass`、`makeLib`（旧 `lib`）、`filtered`、`liveWorks`、`purgeTrash` 的筛选逻辑、`workHref`、`workType`、`esc`、`nfmt` — `src/domain/library.ts`、`prompts-filter.ts`、`works.ts`、`text.ts`
- [新增] 云同步合并规则：`workHash`、`mergeCloudWorks`（旧 `cloudPull` 的合并）、`pendingPush`（旧 `cloudPush` 的筛选）— `src/domain/sync.ts`
- [修改] 旧函数读全局状态处改为显式参数：`wzPrompt` 与 `sxPrompt` 的 `lib`、`wzDupCheck` 的未删除作品列表、`filtered` 的筛选条件 `state`、`styleList` 的 core 画风与条目表和自定义画风、`assemble` 的 core 数据与当前选择、`purgeTrash` 与各 `*Build*` 函数的当前时间与作品列表
- [新增] 新旧对照测试 106 项（含 3 项元测试），覆盖约 19,300 次新旧输出比较：同一输入分别调用旧实现（抽取器）与新实现并要求深度相等，含边界值与异常结构；随机函数在旧页面 vm 内替换 `Math.random` 为循环序列、新实现传入同序列，时间固定；`cloudPull` 与 `cloudPush` 在旧页面里打桩 `api` 后运行，比较写回结果、推送序列与指纹；元测试检查每个导出都有对照用例，且领域层不触碰 DOM、存储、网络、时钟与全局随机源 — `tests/parity/domain*.test.ts`
- 验证：`kwOk` 对空值原样返回空值（不是 `false`），对照测试发现后按旧行为保持；对 29 处人为改动（改阈值、改文案、改正则、改排序）逐一运行，全部被测试发现

### 前端 React 重构 P1-A：外壳、存储层、路由与占位页 `packages/web-react`

对照基准：`packages/web/site-template.html` 在 `aa38d84`（该文件最后改动提交 `1cf6f6c`）；追平之后的改动不在本节范围。

- [新增] 存储层：18 个 `pl.*` 键的类型表、`get` / `set` / `remove`，键名、JSON 格式、读失败为 `null`、写 `null` 存字符串 `null` 与旧 `store()` 一致；写 `works` 触发推送钩子（旧 `window.cloudPush`）；`subscribe` 与 `useStored`（`useSyncExternalStore`）同页写入与其他标签页 `storage` 事件都通知；`readWorksRaw` / `writeWorksRaw` 供云同步绕过钩子；`sessionStorage.tjAdmin` 读写；`isPro` — `src/lib/storage.ts`
- [新增] 请求层：`api`（Bearer、401 登出、`noLogout`、非 2xx 抛带 `status` 的错误）、`adminApi`（`X-Admin-Key`）、`tjApi`、`yqPost`（写作接口的请求头与 `X-Points` 积分回写，网络失败抛可重试错误）、`getPublic`（/hot、/words）、`?k=` 通行码入库；后端地址读 `window.TJ_API_BASE` — `src/lib/api.ts`、`src/lib/auth.ts`
- [修改] 与旧页面的一处差异：后端 `error` 字段为对象（如 Zod 校验）时取其 `message`，旧页面会显示 `[object Object]`；字符串错误行为不变 — `src/lib/api.ts`
- [新增] 通用工具：`toast`、`copyText`、`saveBlob`、`saveText`、`makeZip` / `zipCrc`、hash 状态与 `refreshRoute` / `replaceHash` / `replaceStateHash`、导航覆盖 `setNavRoute`（作品页带 vibe 上下文画侧栏）、侧栏 `setPanel`、账户面板 `setAccount` / `openLogin`、提示词目录 `NAV` 与内容索引 — `src/lib/*.ts`
- [新增] 路由：`parseRoute` 逐行移植旧 `parse()`（不用 react-router），作品与提示词查找改为参数；`RouteView` 按旧 `route()` 顺序分派 14 类路由，含 PRO / 标准版切换；每次 `hashchange`（含合成事件）重新挂载页面 — `src/app/routes.ts`、`RouteView.tsx`、`useRoute.ts`、`App.tsx`
- [新增] 外壳：顶栏（四大功能高亮、PRO 开关）、侧栏四套目录与作品子目录、目录按钮、账户面板（未登录表单、登录、登出、积分与不限、升级跳会员页、Esc 与点外部关闭）、返回按钮对齐、换页滚到顶、手机收起侧栏；沿用旧 CSS 类名与元素 id — `src/app/Layout.tsx`、`Nav.tsx`、`nav-data.ts`、`Account.tsx`
- [新增] 云同步与启动：`cloudPull`、`cloudPush`、`purgeTrash` 的存储读写、请求与时序（合并、指纹、过期判定复用 `src/domain/sync.ts`、`works.ts`）；`doLogin`、`refreshMe`、`logout`；启动顺序同旧页面（通行码 → /me → /works → 清理回收站）— `src/app/cloud.ts`、`session.ts`、`boot.ts`
- [新增] 通用组件：`Icon`（旧 ICONS 运行结果，重复键取后者）、`StepNum`、`BackBar`（含“储存并返回”）、`Toast`、`CopyButton`、`TextModal`（旧 `showModal`）、`Markdown`（旧 `renderMd`，有 `window.marked` 时渲染，否则原文）、`NotImplemented` — `src/components/*`
- [新增] 旧 CSS 原样迁入（第 12–991 行，980 行，96,834 字节），未改写未拆分 — `src/styles/legacy.css`
- [新增] 17 个功能占位页（各任务包 feature 目录内，导出页面组件与 props 类型）— `src/features/**`
- [修改] 入口改为挂载 `App`、引入 `legacy.css`、调用启动副作用 — `src/main.tsx`
- [新增] 测试 235 项：路由对照 186 个 hash（58 个 14 类与边界用例、模板全部 23 个字面量链接、90 条提示词与 15 个目录链接）与旧 `parse()` 逐字段相等；旧 `drawNav`、`drawAccount` 在旧页面 vm 里放最小 document 实跑，与新组件服务端渲染按结构比较（3 种存储 × 24 个路由、作品页上下文、5 种登录态）；18 个键写出原文与旧 `store()` 逐字节相等、键集合与模板全部 `store(字面量)` 调用一致；ICONS、NAV、FUNCS、资产目录、`makeZip` 字节对照；存储钩子、跨标签页通知、请求层、云同步时序（fake timers）、路由分派单测 — `tests/parity/shell.test.ts`、`lib.test.ts`、`html.ts`、`tests/unit/*.test.ts`
- 验证：`vite build` 产物仍只有 `index.html`，`check:dist` 通过；浏览器串行对照（同源共用 localStorage，旧页面写入种子）14 个路由中 12 个顶栏、侧栏、PRO 开关、侧栏收起、logo 高亮、积分显示与旧页面一致，其余 2 个（`#/script/v/…`、`#/storyboard`）的差异来自旧作品页与分镜入口自身的重画与跳转，归 P5-B、P2-B；新页面控制台无报错

### 前端 React 重构 P0 补充：字体、marked 与组件测试基础设施 `packages/web-react`

- [修改] `index.html` 补上旧页面的 Google Fonts 三行（两行 `preconnect` 加 Inter、Noto Sans SC 样式表，原样取自 `site-template.html`），不再回落系统字体 — `packages/web-react/index.html`
- [修改] `check:dist` 放行 `fonts.googleapis.com` 的样式表外链，其余外链样式表与带 `src` 的脚本仍判失败（已用多一个外链的产物验证会失败）— `packages/web-react/scripts/check-dist.mjs`
- [新增] 依赖 `marked` 12.0.2（固定，不加 `^`），与旧页面 CDN 的 `marked@12.0.2` 同版本；CDN 文件与 npm 包内 `marked.min.js` 字节相同，ESM 与 UMD 对 99 篇内容输出相同；README 写明用法约定，Markdown 组件仍由 P2-A 接入 — `packages/web-react/package.json`、`README.md`
- [新增] 测试依赖 `jsdom`、`@testing-library/react`、`@testing-library/dom`（RTL 的 peer）、`@testing-library/jest-dom`、`@testing-library/user-event` — `packages/web-react/package.json`
- [修改] vitest 改为两个项目：`node`（`tests/**/*.test.ts`，环境与原来相同）与 `dom`（`tests/**/*.test.tsx`，jsdom，载入 `tests/setup-dom.ts`）— `packages/web-react/vitest.config.ts`
- [新增] 组件测试范例（占位页渲染、user-event 点击、用例间自动清理）与 setup 文件 — `packages/web-react/tests/unit/not-implemented.test.tsx`、`tests/setup-dom.ts`
- [修改] `engines.node` 收紧为 `^22.22.2 || ^24.15.0 || >=26.0.0`（jsdom 31 的要求）— `packages/web-react/package.json`
- [修改] `package-lock.json` 只新增 53 个条目与 web-react 工作区自身的依赖声明，已有包版本无变化 — `package-lock.json`
- 验证：node 项目 341 项不变，dom 项目 3 项，共 344 项通过；`tsc --noEmit` 通过；`dist/` 仍只有 `index.html`，空与有值后端地址下 `check:dist` 均通过；产物 676,918 字节增至 677,200（字体链接 +282；marked 尚未被引用，被引用后约 +34 KB，gzip 约 +10.6 KB）

### 前端 React 重构 P2-A：提示词库与更新记录页 `packages/web-react`

对照基准：`packages/web/site-template.html` 在 `1cf6f6c`（该文件最后改动提交，origin/main 为 `8d86e1e` 时取得）；追平之后的改动不在本节范围。

- [新增] 提示词首页与目录列表：英雄区与搜索框、来源筛选（全部、可直接用、仅参考、内部）、只看已用于生产、`n / m 条` 计数、首页无筛选时按 15 个目录分组、有筛选时平铺卡片、空结果提示；筛选用 `domain/prompts-filter` 的 `filtered`，沿用旧 CSS 类名与元素 id — `src/features/prompts/PromptListPage.tsx`、`parts.tsx`
- [新增] 搜索条件做成模块级状态，跨路由保留（旧页面的全局 `state`：首页搜过再进目录页，搜索框仍是原来的词）— `src/features/prompts/filter-state.ts`
- [新增] 搜索命中“相关功能”（旧 `funcIndex` / `drawFuncHits`）：最多显示 9 项，点击带 pick 的项先写 `pl.pro`、`pl.sxPick` 再跳转；资产功能的说明文字旧 `ASSET_MENUS` 才有，`nav-data` 里没有，所以在本目录放一份，由对照测试保证与旧页面逐项相等 — `src/features/prompts/func-index.ts`
- [新增] 提示词详情：面包屑、标签（详情页状态不截断）、复制提示词正文（`CopyButton`，1.3 秒“已复制”）、6.0 的“在组装器里调整”、文件路径标签、Markdown 正文、上一条 / 下一条；编号不存在显示“找不到这条提示词” — `src/features/prompts/PromptEntryPage.tsx`
- [新增] 更新记录页：去掉首行标题后渲染 Markdown — `src/features/prompts/ChangelogPage.tsx`
- [修改] `Markdown` 组件改为 `import { marked } from 'marked'`，选项 `{ gfm: true, breaks: false }` 与旧 `renderMd` 一致；不再读 `window.marked`，删掉无 marked 时输出原文的退路与 `Window.marked` 全局声明 — `src/components/Markdown.tsx`
- [修改] `route-view.test.ts` 改为按页面组件名判断分派（原按占位页的 `data-placeholder`），占位页被真实页面替换后不用再改；页面模块 import 时会读 `#tj-data`，测试先放一个空内容的假 document 再动态 import，24 项用例与期望表不变 — `tests/unit/route-view.test.ts`
- [新增] 对照测试 39 项：旧 `viewList`、`viewEntry`、`viewDoc` 在真 jsdom 窗口里实跑，与新组件渲染的 DOM 逐节点比较；覆盖首页、15 个目录分组加 3 个父级目录（03-revision、06-video、archive）共 18 个目录、4 个边界目录（空、不存在、`constructor`、`__proto__`）、90 条提示词详情（含 6.0 主模板、补丁条目、archive 条目）、4 个不存在的编号、更新记录页；3 个场景下 16 步筛选操作（搜索词、来源、生产开关及组合）每一步都比较；`funcIndex` 全部检索项相等 — `tests/parity/prompts.test.tsx`、`prompts-legacy.ts`
- [新增] Markdown 对照测试 6 项：全部 99 篇内容（90 条提示词、更新记录、`core.parts` 8 段）新旧渲染 HTML 逐字符相等（代码卡 60 个以上、外链出现过，不是空比较）；marked 选项、无 `window.marked` 可渲染、代码卡复制 — `tests/parity/markdown.test.tsx`
- [新增] 交互测试 16 项（jsdom + testing-library）：搜索与计数、来源与生产开关高亮、分组、条件跨页保留、相关功能点击写存储、详情页复制（假定时器）、代码卡复制、上下条链接、整个 `App` 下侧栏与顶栏高亮随 hash 变化 — `tests/unit/prompts-pages.test.tsx`
- [新增] jsdom 类型声明（不新增 `@types` 依赖）— `tests/parity/jsdom.d.ts`
- 差异：`#/e/constructor`、`#/e/__proto__` 等原型键，旧 `viewEntry` 取到原型上的函数后读 `e.body` 抛 TypeError，页面停在上一页（测试已实跑确认抛错）；新页面显示“找不到这条提示词”
- 差异：详情页复制按钮旧写法有 `id="cp"`，`CopyButton` 没有 id 参数，该 id 在旧页面脚本与 CSS 里没有别处引用，对照时忽略这一个 id
- 发现：`tests/parity/legacy.ts`、`plugins/load-data.ts` 用 `fileURLToPath(new URL(…, import.meta.url))` 取路径，在 jsdom 环境（`.test.tsx`）里 import 即抛 “The URL must be of scheme file”，所以对照辅助文件自带路径与抽取逻辑；这两个文件未改
- 验证：全包 19 个文件 405 项通过（node 341 项不变，dom 64 项，其中新增 61 项）；`tsc --noEmit` 无错误；变异检验 13 处人为改动（文案、条数、状态截断、6.0 按钮、pick 值、标题剥离、marked 的 gfm 与 breaks、外链 rel、代码卡文案、筛选条件不保留等）全部被测试发现；`vite build` 产物仍只有 `index.html`，`check:dist` 通过，产物 677,200 字节增至 721,884（marked 打进产物）；未做浏览器验证

### 前端 React 重构 P2-C：伙伴计划页与会员页 `packages/web-react`

对照基准：`packages/web/site-template.html` 在 `8d86e1e`（该文件最后改动提交 `1cf6f6c`）；追平之后的改动不在本节范围。

- [修改] 伙伴计划页：替换占位，移植旧 `viewPartner`（头图、六个章节、赛道与奖金卡、报名流程与评审表、“报名与评审”锚点平滑滚动到 `#pt-join`、返回键），沿用旧 CSS 类名 — `src/features/partner/PartnerPage.tsx`
- [新增] 伙伴计划横幅 `PartnerBanner`：默认是指向 `#/partner` 的链接形态（标准版首页 P3-A 复用，旧 `partnerBanner()`），`big` 为伙伴计划页头图形态（旧页面对其结果做字符串替换得到的结构，无“了解计划”按钮）— `src/features/partner/PartnerBanner.tsx`
- [修改] 会员页：替换占位，移植旧 `viewMembership`（全屏覆盖层、计费周期页签、四档价格与权益、对比表、关闭按钮；点击购买与选择方案只弹提示，无支付接口）— `src/features/membership/MembershipPage.tsx`
- [新增] 会员方案、对比表、页签的数据与折算月价、无限生成天数函数 — `src/features/membership/plans.ts`
- [新增] 新旧对照测试：经 Node 原生 `require` 加载 `legacy.ts` 与 `load-data.ts`（jsdom 转换下它们的 `new URL(…, import.meta.url)` 会被改写而失效，文件本身未改），在 `node:vm` 里实跑旧 `viewPartner`、`viewMembership`、`partnerBanner`，旧脚本的 `document`、`history`、`location` 指向 jsdom 真实对象，直接渲染进真实 DOM；与 React 渲染结果按节点逐一比较（标签、命名空间、属性、文本逐字；忽略内联 `on*` 属性与仅含空白的文本节点），并在两边各跑同一套交互场景（锚点、返回有无历史、关闭有无历史、6 次页签点击、9 个方案按钮提示、页脚按钮无事件）比较观察结果 — `tests/parity/partner.test.tsx`、`tests/parity/membership.test.tsx`、`tests/parity/static-pages-dom.tsx`
- [新增] 组件测试 10 项：路由挂载真实页面、锚点滚动、返回、关闭、页签、购买提示、横幅两种形态 — `tests/unit/static-pages.test.tsx`
- 验证：全包 22 个文件 426 项通过（含本包新增 3 个文件 21 项）；`tsc --noEmit` 通过；`vite build` 与 `check:dist` 通过；15 处人为改动（文案、属性、类名、价格、取整、提示语、全角空格、历史判断、取消 preventDefault 等）全部被测试发现；未做浏览器验证

### 前端 React 重构 P2-B：6.0 组装器与分镜入口 `packages/web-react`

对照基准：`packages/web/site-template.html` 在 `1cf6f6c`（该文件最后改动提交，origin/main 为 `8d86e1e` 时取得）；追平之后的改动不在本节范围。

- [修改] 6.0 组装器：替换占位，移植旧 `viewAssembler`（画风切换、自定义画风文本框、可选条款开关与成人内容警告、补丁条目列表、统计行、下载 .txt、复制全部、返回键“储存并返回”）；组装文本用 `domain/assembler` 的 `assemble`，画风与条款名不拼进选择器，沿用旧 CSS 类名与元素 id — `src/features/assembler/AssemblerPage.tsx`
- [新增] `?ep=` 分镜编辑：初始状态、作品默认画风（`asmGenreStyle`，命中“末日废土写实”选内置画风，否则走自定义）、`pl.asmW` 优先、追加该集剧本、集序超出取最后一集；集序为负或 NaN 时旧页面拼标题抛异常、页面保持空白，新页面同样不渲染也不写存储 — `src/features/assembler/model.ts`
- [新增] 存储行为与旧页面一致：普通模式每次更新（含首次渲染）写 `pl.asm`；分镜编辑模式只在“储存并返回”时写 `pl.asmW` 并提示“已储存” — `src/features/assembler/AssemblerPage.tsx`
- [修改] 分镜入口：替换占位，移植旧 `viewTool('storyboard')`（有氛围写作作品时 `location.replace` 到最近作品分镜页，最近记录失效取第一个，回收站里的作品也算；否则显示占位页与三个入口）— `src/features/assembler/StoryboardEntry.tsx`
- [新增] 对照测试 69 项：旧 `viewAssembler`、`viewTool` 在 jsdom 窗口里实跑，与新组件渲染的 DOM 逐节点比较（标签、属性、class 排序、style、textarea 值、文本逐字）并比较 localStorage；覆盖普通模式 10 种存储状态、分镜编辑 26 种场景（7 个题材分支、模型结果各状态、作品保存的画风、集序边界、回收站与标准版作品等）、3 个抛异常的集序、9 种分镜入口存储状态；画风切换、自定义文字、条款开关、复制、下载、返回的每一步操作后都比较；合成数据（3 画风、3 条款、补丁跨章节与编号 9.12 / 10.1 排序）另 9 项，8 种条款组合全比较；共 157 次比较、约 2.8 万个节点 — `tests/parity/assembler.test.tsx`、`assembler-synthetic.test.tsx`、`assembler-harness.tsx`、`assembler-legacy-dom.ts`、`assembler-dom-snapshot.ts`
- [新增] `assemble` 与 `build.py video` 逐字相等（真实数据下画风 × 条款的全部组合）— `tests/parity/assembler-build.test.ts`
- [新增] 组件测试 21 项（jsdom + user-event）：切换画风、自定义文字、条款开关、复制（假定时器验证 1.3 秒还原）、下载文件名与 BOM、返回键脏状态与保存、分镜编辑各分支、分镜入口跳转与占位 — `tests/unit/assembler.test.tsx`
- 差异：旧返回键的内联 `onclick` 与脏标记 `data-dirty` 在新页面是事件处理函数与状态，对照时忽略这两个属性，变脏后的类名与文字仍逐字比较；点击行为由组件测试覆盖
- 差异：`CopyButton` 不支持传 id，旧“复制全部”按钮有 `id="cpAll"`，本页自带一个等价的按钮组件保留该 id
- 发现：`tests/parity/legacy.ts`、`plugins/load-data.ts` 在 jsdom 环境（`.test.tsx`）里 import 即抛 “The URL must be of scheme file”，所以辅助文件自带路径与抽取逻辑（与 `legacy.ts` 的 `extractTopLevel` 同逻辑，旧页面结构变化时两处一起改）；这两个文件未改
- 验证：全包 26 个文件 520 项通过（本包新增 4 个文件 94 项）；`tsc --noEmit` 无错误；18 处人为改动（文案、class、display、写存储时机、脏状态、集序钳制、画风校验、章节列表、跳转目标与回收站过滤、链接等）全部被测试发现；`vite build` 与 `check:dist` 通过；未做浏览器验证
