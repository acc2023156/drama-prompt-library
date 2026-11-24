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
