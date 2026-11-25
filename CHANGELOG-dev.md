# 工程更新记录

记录代码、配置、部署相关的改动。提示词库本身的更新见 [CHANGELOG.md](CHANGELOG.md)（它会被打包进网站的“更新记录”页，不要把工程改动写进去）。

**约定**：每次改动都要在这里记一笔——按日期倒序，每个日期下用列表逐条写修改项，条目前标 `[新增]` / `[修改]` / `[删除]`，并写明涉及的文件或模块。

---

## 2026-11-25

### 上手指南 `packages/web`

- [新增] 上手指南静态页：图文教程（两条起点、氛围写作设定、资产库、提示词库、常见问题）＋ 两段竖屏教学视频（快速上手 26 秒、氛围写作 50 秒，720×1280）；截图 1600×1000 按原比例显示 — `packages/web/guide/`
- [新增] 顶栏在 PRO 开关与账户按钮之间加「上手指南」入口，链接到 `guide/`；760px 以下只显示图标 — `packages/web/site-template.html`
- [修改] `build.py site` 生成 `index.html` 后把 `guide/` 整个复制到 `site/guide/`，GitHub Pages 发布随之带上 — `packages/web/build.py`
- [修改] 同步发布站时一并复制 `guide/` 目录 — `.github/workflows/publish-site.yml`
- [新增] React 版顶栏同步加入「上手指南」入口与样式（React 版构建产物仍为单文件，上线前需另行带上 `guide/`）— `packages/web-react/src/app/Layout.tsx`、`packages/web-react/src/styles/legacy.css`

### GitLab dev 分支与首次合入（`outdoor/tianji`，项目 37）

- [新增] GitLab `dev` 分支：用 API 从合入 CI 文件前的 main `e2f3677` 创建，未设保护；创建未触发流水线
- [修改] `dfb48ef`、`2d68b5c`、`a45ecf8` 快进推送到 GitHub 与 GitLab 的 main；GitLab main 推送触发校验流水线 #5407，failed：作业实际标签为 `outdoor-verify`（Runner `outdoor-mr-verify`），镜像 `python:3.12-bookworm`，`policy`（15 项）与 `web` 通过，`worker` 因镜像里没有 npm 明确失败
- [新增] MR !1（main → dev，保留源分支）：MR 流水线 #5408 failed，原因同上；项目未开“流水线成功才能合并”，GitLab 判定可合并，按现有规则合入，合并提交 `37e45ab`
- 合入后 4 分钟内 dev 上没有流水线：dev 不是受保护分支，`.gitlab-ci.yml` 的 workflow 只对受保护分支的推送运行；项目 CI 配置路径仍为空（未切到 `devops/artifacts`），容器镜像库仍为 0 个，没有构建镜像

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

### 前端 React 重构 P3-B：标准版结果页 `packages/web-react`

对照基准：`packages/web/site-template.html` 在 `1cf6f6c`（该文件最后改动提交，origin/main 为 `8d86e1e` 时取得）；追平之后的改动不在本节范围。

- [修改] 结果页替换占位：作品标题与角色卡（头像底色、表面 / 内心 / 金手指 / 关系 / 要点、流派标签）、10 集大纲与完整台词（`sxScript`、`sxHL`、`sxScriptText`、`sxPrompt`、`sxBuildWork` 取自 `domain/sx`）、分页切换、重写（换随机种子写回 works）、AI 精写提示词弹窗（`showModal`）、复制全部、下载 .txt、到 PRO 版细修、删除（确认后从 works 直接删掉，不进回收站）、`?new=1` 的撒花与“剧本大纲完成！”徽章、作品不存在的空状态；沿用旧 CSS 类名与元素 id，不改 `legacy.css`；文件名、导出名、props 不变 — `src/features/simple/result/SimpleResultPage.tsx`
- [新增] 对照测试 83 项：旧 `viewScriptResult` 在 `node:vm` 里实跑、挂独立 jsdom 文档，与新组件的渲染 DOM 逐节点比较；随机数、`Date.now`、剪贴板、下载、`confirm`、滚动、`location.hash` 两边同样打桩并比较记录。覆盖：男频 10 + 女频 10 个角色类型各 fresh 无种子与非 fresh 有种子共 40 例、9 个边界（fresh 带种子、种子为 0、标准版与 PRO 的返回链接、非 simple 的 kind、标题含特殊字符、多作品取对应 id）、作品不存在 3 例（无该 id、无 works 键、works 为 null）、React 服务端渲染原文与旧页面 style 原文逐字符一致（4 组夹具，另有撒花与头像底色的原文检查）、交互 17 例（切页签写种子、完整台词大按钮含滚动、重写三次、重写后切回大纲、重写重挂载条目、复制含 1.3 秒还原边界、下载文件名与 BOM、提示词弹窗 DOM 与开关、弹窗下载文件名、到 PRO 版细修、删除取消与确认、删最后一个、写入时读最新 works、StrictMode 只写一次、换 sid 重挂载、无 sx 的作品）；每个写入点断言 `pl.works`、`pl.pro` 原文与旧页面逐字节相等 — `tests/parity/simple-result.test.ts`
- [新增] 对照辅助：旧页面沙箱（`result-legacy.ts`）、打桩记录（`result-stubs.ts`）、DOM 树归一与比较（`dom-tree.ts`，style 有 css 与 raw 两种模式）、node 环境手动装 jsdom 全局（`dom-env.ts`）— `tests/parity/`
- [新增] 变异检验：对旧页面 DOM 的 9 种改动，以及对组件源码的 18 处人为改动（动画延迟系数、种子范围、返回链接判定、`pl.pro` 写入、提示文案、复制还原时长、删除过滤、跳转地址、下载文件名、时间戳、撒花颜色、初始页签、动画开关、滚动调用等）全部被测试发现；检验中发现复制还原时长改 1200 毫秒能逃过，已把用例拆成 1299 毫秒仍显示“已复制”、再 1 毫秒还原
- 差异：旧页面连点“复制全部”会把“已复制”状态存进还原用的 HTML 而卡住，新页面与 `CopyButton` 一致，重复点击时重新计时
- 差异：作品存在但没有 `sx` 时，旧页面抛 TypeError 并停在上一页（站内链接到不了），新页面显示“找不到这部剧本”
- 差异：旧页面的 `data-x`、`data-dl`、`data-cp` 只是事件绑定钩子，新弹窗（`TextModalHost`，P1-A）没有，对照时忽略这三个属性
- 发现：`tests/parity/legacy.ts`、`plugins/load-data.ts` 在 jsdom 环境（`.test.tsx`）里 import 抛 “The URL must be of scheme file”（vitest 的 jsdom 环境下 `import.meta.url` 是 http 地址）；本测试放 node 项目（`.test.ts`），自己装 jsdom 窗口，两个文件未改
- 验证：全包 20 个文件 488 项通过（含本节 83 项）；`tsc --noEmit` 无错误；`vite build` 产物仍只有 `index.html`，`check:dist` 通过；未做浏览器验证

### 前端 React 重构 P2-D：热词、回收站与会员后台 `packages/web-react`

对照基准：`packages/web/site-template.html` 在 `f331924`（该文件最后改动提交，origin/main 为 `2bc181f` 时取得）；该提交只新增资产回收桶（`viewAssetTrash`、`purgeAssetTrash`），M15 的三个 view 未变；之后的改动不在本节范围。

- [修改] 热词页替换占位：读取 `GET /words`（只走 `getPublic`，无头无选项），分类条（分类多于 1 个时才显示）、序号、热度条（分母取最高热度，至少 1）、走势；点词条把起手话写进 `pl.chat`（沿用旧 `chatState` 的默认值与键序）、`pl.vibeCard` 写 `null`、`pl.pro` 写 `true`，跳 `#/script` 并提示 — `src/features/account/HotwordsPage.tsx`
- [修改] 回收站替换占位：进入时清理 30 天前的作品（`domain/works` 的 `purgeTrash`，已登录时对每个发 `DELETE /works/:id`），按删除时间倒序列出，剩余天数、还原（删 `trashed`、`time` 改为当前时间）、永久删除、清空（`confirm` 文案同旧页面）；列表订阅 `pl.works`，其他来源写入后自动刷新 — `src/features/account/TrashPage.tsx`
- [修改] 会员后台替换占位：口令存 `sessionStorage.tjAdmin`（提交时去首尾空格）并经 `adminApi` 作 `X-Admin-Key`，用户表、调用统计面板（今日调用、成功率、平均耗时、忙线 429、逾时、近 1 小时、分模型）、加点（`POST /admin/points`）、改身份（`POST /admin/role`）、403 提示“密码不对”、其他失败提示“读取失败”；每次重新读取后输入框清空 — `src/features/account/AdminPage.tsx`
- [新增] 对照测试 67 项（`tests/parity/account.test.tsx`）：在 jsdom 里整页运行旧 `site-template.html` 的真实脚本，与新组件在同一份种子、同一组桩响应、同一串操作下逐步比较 DOM（逐节点：标签、属性、style 声明、表单值、文本）、localStorage 与 sessionStorage 原文、fetch 请求（路径、方法、头、体，含参数个数）、toast、confirm 提问、location.hash。覆盖：热词 17 例（读取中、为空、5 种失败、多分类切换、单分类、热度全 0、非空后端地址、点词条 4 种既有存储）、回收站 18 例（空、有数据、已过期登录与未登录、还原、永久删除确认与取消、DELETE 返回 500 被忽略与 401 登出、清空）、后台 31 例（无口令、读取中、403、401 不登出、5 种读取失败、口令提交与空格、加点成功与失败、改身份成功与失败、统计缺失）、对照方法自检 1 例
- [新增] 交互测试 17 项（`tests/unit/account.test.tsx`）：user-event 真实点击，localStorage 原文、请求的路径 / 方法 / 头 / 体逐字符写死，另覆盖卸载后迟到响应、`pl.works` 外部写入后列表刷新
- [新增] 对照辅助 `tests/parity/legacy-page.ts`：jsdom 整页载入旧页面（外部脚本不加载，fetch、confirm、matchMedia、`scrollIntoView`、`Date` 打桩），`go()` 先在静态页启动再清空存储写入种子，避免启动时登录态的 `/me`、`/works` 同步混入记录；自带模板路径与 `build.py data` 取数，不 import `legacy.ts`
- [新增] 变异检验：对三个页面源码的 42 处人为改动（文案、序号位数、分类条阈值、`pl.chat` 键序与字段、`vibeCard`/`pro` 写入、提示文案、热度条取整与分母、剩余天数取整、排序方向、过期边界、`time` 写入、`trashed` 删除、云端删除条件、id 转义、口令去空格、请求方法与体字段顺序、重载清输入框、统计面板各栏、身份下拉选中项、积分与手机号显示等）全部被测试发现；首轮有 3 处逃过（读取中文案、统计缺字段缺省、转义字符），已补用例后复跑 0 存活
- 差异：后台用户列表响应缺 `users` 数组时，旧页面在 `users.length` 处抛 TypeError 被捕获显示“读取失败”，新页面显式判断数组，结果相同
- 差异：直角引号（起手话 `以…为题材，`）在源码里写成转义序列，写入的文本与旧页面逐字节相同
- 发现：`tests/parity/lib.test.ts`、`tests/parity/shell.test.ts` 各 1 项失败，在不含本节改动的 `2bc181f` 上同样失败（`f331924` 新增键 `assetsTrash` 与路由 `#/assets-trash`，`legacy.ts` 读取的是当前模板而非固定快照），不属本节范围，未改
- 验证：全包 29 个文件 687 项，685 通过（含本节 84 项），2 项为上条的既有失败；`tsc --noEmit` 无错误；`vite build` 产物仍只有 `index.html`，`check:dist` 通过；未做浏览器验证

### 前端 React 重构 P3-A：标准版首页（七星、角色库、角色卡与 dock）`packages/web-react`

对照基准：`packages/web/site-template.html` 在 `f331924`（该文件最后改动提交，origin/main 为 `3ed5da5` 时取得）；开工时基准为 `1cf6f6c`，两者之间 `viewScriptSimple` 函数体 sha256 相同，它依赖的 `partnerBanner`、`chatState`、`wzGuess`、`sxOutline`、`sxSaveWork`、`toast` 也未变；之后的改动不在本节范围。

- [修改] 标准版首页替换占位：角色库 / 创作平台切换（写 `pl.homeMode`，挂载时按旧页面原样写回）、伙伴计划横幅（复用 `features/partner/PartnerBanner`）、我的作品列表、角色卡（搜索、选中、随机名）、选频道、dock（主角名改动同步剧名、剧名、骰子、一键产出）；沿用旧 CSS 类名与元素 id，不改 `legacy.css`；文件名、导出名、props 不变 — `src/features/simple/home/SimpleHomePage.tsx`
- [新增] 七星行星排行：剧本热点七星（内置示例按 1 小时 / 24 小时 / 7 天调整热度）与开阳角色七星、实时热点分类页签与渐层配色、核心星 / 行星 / 排行点击、角色排行“角色库”“开剧本”按钮、悬停减速（`getAnimations` 播放速率 0.3）、鼠标落星（35 毫秒节流、900 毫秒移除、减少动态偏好时关闭）；每次重画重建行星与排行节点，轨道动画从头开始，同旧页面 — `src/features/simple/home/Orbit.tsx`、`orbit-data.ts`
- [新增] `GET /hot` 页面级缓存（旧 `window._hotLive` / `_hotLoading`）：走 `lib/api` 的 `getPublic`，请求中不重复发，成功且 `topics` 非空才缓存，失败或为空时下次切换模式再请求，返回后重画七星 — `src/features/simple/home/hot.ts`
- [新增] 角色库四级导航（root、男频 / 女频列表、角色详情、服装库 / 发型库整理中）与 `pl.libNav` 记忆（键顺序、额外键、无数据频道改为 wip 的修正与旧页面一致）、用这个角色写剧本、做角色设定板（写 `pl.assetPick` 跳资产库） — `src/features/simple/home/RoleLibrary.tsx`
- [新增] 写存储的动作：点热点星体写 `pl.chat`（沿用旧 `chatState` 默认值与键序）、`pl.vibeCard`（`WZ_DEF` + `wzGuess` + `depthOf`）、`pl.pro` 并跳 `#/script`；点角色星体写 `pl.sxPick`、`pl.homeMode`、`pl.libNav` 后整页重挂载并滚动；一键产出用 `sxOutline`、`sxBuildWork` 写 `pl.works`、`pl.sxPick` 写 `null`，跳 `#/script/s/<id>?new=1` — `src/features/simple/home/actions.ts`
- [新增] 对照测试 120 项（`tests/parity/simple-home.test.tsx`）：旧 `viewScriptSimple` 在独立 jsdom 窗口里真跑（顶层声明抽取后在该窗口的 vm 上下文运行），新组件渲染在测试 jsdom 里；两边同一 localStorage 种子、同一随机序列、同一 `Date.now` / `performance.now`、同一 `/hot` 桩，每步操作后逐节点比较 DOM（标签、属性、class 排序、style 解析后比较、输入框当前值、文本），并比较 localStorage 原文、`location.hash`、`/hot` 请求序列、提示条、`scrollIntoView` 调用、动画速率、works 推送钩子次数。覆盖：初次渲染 16 种存储 × 有无 `/hot`（两种模式、角色库各层级、wip 修正、额外键、已选角色、搜索命中与无结果、作品列表、未知模式）、三种时间范围下点星体、实时热点 7 个页签与各页签点击、灵感 8 / 9 字边界、缓存与重试 4 例、角色七星、落星与节流、重画时节点重建 5 例、角色卡与 dock、一键产出 6 例、角色库导航与模式往返、用这个角色写剧本 4 例、做角色设定板；另按旧页面 24 个事件绑定逐个建用例（每个断言新旧相等且确有可见效果）
- [新增] `/hot` 缓存单测 7 项（`tests/unit/simple-home-hot.test.ts`）：并发去重、成功缓存与通知、5 种失败不缓存、后端地址前缀
- [新增] 对照辅助：新旧双跑与 DOM 归一（`simple-home-twin.tsx`）、数据与模板路径（`simple-home-data.ts`，不 import `legacy.ts` 与 `plugins/load-data.ts`，绕开 jsdom 下 `import.meta.url` 报错）— `tests/parity/`
- [新增] 变异检验：对源码 31 处人为改动（热度偏移、实时热度公式、灵感长度阈值、`pl.pro` 与 `vibeCard` 字段、`sxPick` 清空、`homeMode` 写入、缓存条件与去重、节流、减速倍率、落星时长、截字、排行按钮冒泡判断、星体尺寸、wip 返回频道、wip 修正、爆款验证标签、剧名同步、同频道不重置、提示文案、闪烁时长、挂载写回、选卡随机名、搜索范围、重画、空状态样式、设定板文案等），1 处匹配不到源码未生效；生效的 30 处首轮 25 处被发现，5 处逃过：灵感长度阈值、闪烁时长、重画重建节点 3 处补用例后被发现，另 2 处为等价改动（`hotData` 下限 45 在内置数据里不会触发；`go()` 每次都覆盖 `lv`，合并前是否修正不可观测）
- 差异：`/hot` 返回缺 `works` 数组时，旧页面切到“爆款”页签会在 `H.works.map` 抛 TypeError、七星不重画，新页面按空列表处理（回落内置示例）；后端 `/hot/push` 总会写入 `works`
- 差异：旧页面在 `/hot` 返回时用发起请求那次渲染的闭包重画（期间若已整页重画，会用旧闭包的板块与分类画到新 DOM 上），新页面总按当前状态重画
- 差异：React 之外追加的落星节点与旧页面一样挂在舞台末尾；旧页面每次 `drawOrbit` 先删后加行星节点，新页面用重画计数作 key 重建，DOM 顺序相同
- 发现：`npm install` 会把根 `package-lock.json` 里 web-react 的 `engines` 改成与 `packages/web-react/package.json` 一致（`^22.22.2 || ^24.15.0 || >=26.0.0`），锁文件与清单不同步，归 P0，本节未提交该改动
- 发现：`tests/parity/lib.test.ts`、`tests/parity/shell.test.ts` 各 1 项失败，在不含本节改动的 `3ed5da5` 上同样失败（`f331924` 新增键 `assetsTrash` 与路由 `#/assets-trash`），不属本节范围，未改
- 验证：全包 31 个文件 814 项，812 通过（含本节 127 项），2 项为上条的既有失败；`tsc --noEmit` 无错误；`vite build` 产物仍只有 `index.html`，`check:dist` 通过；未做浏览器验证

### 前端 React 重构：固定对照基准与测试基础设施收尾 `packages/web-react`

背景：旧模板每天在改，对照基准随之漂移；`f331924`（资产回收站，新增存储键 `assetsTrash` 与路由 `#/assets-trash`）使 `lib.test.ts`、`shell.test.ts` 各 1 项失败。另外 `legacy.ts` 与 `plugins/load-data.ts` 在 jsdom 项目里 import 会抛错，P2、P3 的 6 个包各自写了一份加载旧模板的绕开代码。

- [新增] 旧模板快照：`git show 1cf6f6c:packages/web/site-template.html` 原样存档（329,328 字节，sha256 `e023143e…524e`）；README 写明提交、固定原因、更新办法 — `tests/fixtures/legacy-template.1cf6f6c.html`、`tests/fixtures/README.md`
- [修改] `legacy.ts` 成为读取旧模板的唯一入口：默认读快照，`LEGACY_TEMPLATE=latest` 读仓库最新模板（给 P6-A 追平用），其他取值报错；新增导出 `readLegacyTemplate`、`legacyScript`、`legacyTopLevel`、`legacyHtml`、`inlineScript` — `tests/parity/legacy.ts`
- [修改] 路径改用 `fileURLToPath(import.meta.url)` 加 `path.resolve`，不再写 `new URL('相对路径', import.meta.url)`（vitest jsdom 转换会改写它并替换全局 URL），`legacy.ts` 与 `load-data.ts` 在 node、jsdom 两个项目里都能 import — `tests/parity/legacy.ts`、`plugins/load-data.ts`
- [新增] 快照守卫：快照存在、sha256 与记录一致、README 同步记录 — `tests/unit/legacy-snapshot.test.ts`
- [删除] 6 个包各自重复的加载层：脚本抽取（`extractTopLevel`、`declaredNames`、`inlineScript`）、模板与 build.py 路径、数据加载（`loadDataDom`、`loadContentData`、`simple-home-data.ts`）、用 `createRequire` 绕开 vitest 加载 `legacy.ts` 的代码；各包的 DOM 对照、桩与快照逻辑保留，断言未改 — `tests/parity/prompts-legacy.ts`、`assembler-legacy-dom.ts`、`static-pages-dom.tsx`、`legacy-page.ts`、`result-legacy.ts`、`simple-home-twin.tsx`、`simple-home-data.ts`
- [修改] 调用点改用统一入口：`readLegacyTemplate()`、`data.ts` 的 `loadData()` — `shell.test.ts`、`lib.test.ts`、`domain-vibe.test.ts`、`prompts.test.tsx`、`markdown.test.tsx`、`assembler.test.tsx`、`assembler-synthetic.test.tsx`、`account.test.tsx`、`simple-home.test.tsx`、`tests/unit/prompts-pages.test.tsx`
- [修改] 说明文字 — `packages/web-react/README.md`、`tests/parity/dom-env.ts`（只改注释）
- 验证：全包 815 项（node 436、dom 379）全部通过，含新增 1 项守卫，收敛前后 32 个文件的用例数逐文件相同；`tsc --noEmit`、`vite build`、`check:dist`（后端地址为空与有值）通过；`LEGACY_TEMPLATE=latest` 只有 `f331924` 引入的 2 项失败；快照里改一处文案，jsdom 项目的 27 项对照与守卫失败；3 个包各 3 处变异（提示词库、组装器、结果页）9 处全部发现

### 前端 React 重构 P5-A：写作引擎 `packages/web-react`

对照基准：旧模板快照 `tests/fixtures/legacy-template.1cf6f6c.html` 第 2634–2860 行（`yqReadStream`、`yqOnce`、`yqChat`、`yqWriteEpisode`、`yqDrive`、`startYq`、`listingSources`、`YQ_WAIT`、`YQ_STREAM`）与作品页推进写作状态的部分（第 2932、2955–2974、2992、3014 行）；`startGen` 为死代码，未迁移。

- [新增] 写作调用层：`yqReadStream`（SSE 按行解析、`[DONE]` 或 `finish_reason` 算结尾、100 秒无新字与 15 分钟上限中止、无结尾标记视为流中断）、`yqOnce`（请求头与请求体与旧页面逐字节一致、`X-Points` 回写积分、401 登出并打开登录面板、402 提示积分用完）、`yqChat`（429 / 5xx / 网络 / 空回应 / 流中断重试 3 次，等 5、15、45 秒，末次换 `YQ_PLAN`）— `src/features/writing/request.ts`
- [新增] 单集写作 `yqWriteEpisode`：短集一次写完；3 分钟以上先排分场、每批 2 场 3 路并行、每批写好即存盘、失败后只补没写成的批次；重度自检与修稿 — `src/features/writing/episode.ts`
- [新增] 引擎 `createWritingEngine(deps)`：`driveYq`（旧 `yqDrive`，策划卡、大纲、逐集写、忙线提示、出错写回）、`startYq`、`enterWork`（旧 `viewVibeScript` 前半段的分支）、`redoEpisode`、`resumeWriting`、`retryWork`、`showDraft`、`listingSources`、公开 `yqChat`；新增按作品单飞、`stopYq` / `stopAll`（效果同关闭旧页面）、`subscribe` / `getState`（替代 `yqRefresh`，供 `useSyncExternalStore`）；gen 读写经 `applyGenPatch` 与存储层 — `src/features/writing/engine.ts`
- [新增] 依赖注入接口与默认实现、模块级单例 `writing` — `src/features/writing/deps.ts`、`index.ts`
- [新增] 引擎说明：入口签名与副作用、进入作品页的判断条件、流程、单飞与离开页面的语义、与旧实现的差异 — `src/features/writing/README.md`
- [新增] 对照设施：虚拟时钟、记录写入的 localStorage、可脚本化的 fetch 与 SSE 桩（遵守 AbortSignal）、在 vm 里实跑旧引擎（经 `legacy.ts` 的 `legacyTopLevel`，只给渲染层打桩）— `tests/parity/writing-harness.ts`
- [新增] 对照测试 152 项：SSE 18 种流 × 逐字节单刀切、随机多刀切、逐字节分片，100 秒 / 15 分钟边界，yqOnce 15 种状态码 × 8 种错误体、登录态 × X-Points × 通行码 × 后端地址 × max_tokens，yqChat 1,500 余条失败序列 × 3 个模型（共 4,321 次）；整段写作 557 个场景逐事件比较（每个 fetch 的 URL、头、请求体原文，每次 `pl.works` / `pl.auth` 写入原文，引擎定时器，重画、登录、提示、推送事件，均带时刻）：思考深度 × 尺度 × 时长矩阵、续写与已存批次、分场与大纲异常、各阶段重试 / 重试用尽 / 400 / 401 / 402 / 403、自检与修稿失败、3 路并行调度与失败、运行中改作品、单飞、进入作品页 69 种状态、失败页与进度条按钮、单集重写、13 个时刻停止后再进入；`listingSources` 514 次 — `tests/parity/writing-request.test.ts`、`writing-drive.test.ts`、`writing-listing.test.ts`
- [新增] 单测 15 项：订阅与快照、单飞、停止（3 路在途、重试等待、停止后才到的 401 / 402）、公开 `yqChat`、默认依赖与单例、核心文件不 import React 与 lib 运行时、不读全局 — `tests/unit/writing-engine.test.ts`
- 变异检验：85 处人为改动（等待秒数、重试次数、阈值、条件分支、模型选择、字段名与键序、并行与顺序、停止与单飞），首轮 82 处被发现；补用例后“上一集结尾截 500 字”“重写清 err”被发现；剩 1 处为等价改动（第 4 次换模型时去掉 `model!==YQ_PLAN`，原模型已是 `YQ_PLAN` 时两者相同）
- 差异：`startYq` 参数改为作品 id；`driveYq` 重复调用返回正在跑的那次任务的 Promise（旧为立即 resolve）；`yqDrive` 循环里 `continue` 之后的不可达代码未迁移
- 验证：全包 36 个文件 982 项通过（新增 167 项）；`tsc --noEmit` 无错误；`vite build` 与 `check:dist` 通过；未做浏览器验证

### 前端 React 重构 P4-D：资产库（资产首页与节点编辑器）`packages/web-react`

对照基准：旧模板快照 `tests/fixtures/legacy-template.1cf6f6c.html`（`viewAssets` 第 1261–1291 行、`viewAssetEditor` 第 1293–1408 行）；`f331924` 的资产回收站与“我的资产”选择模式不在本节范围，留给 P6-A 追平。

- [新增] 完整资产菜单常量 `ASSET_MENUS`、`FN`（文案、模板、预览格、参考图节点、多选项与默认值），逐字取自旧页面；`fnOf` 只认菜单里的 id，不命中 `constructor` 等原型键 — `src/features/assets/menus.ts`、`seed.ts`
- [修改] 资产首页替换占位：两张菜单卡与悬停预览、作品导入条（逐项进入编辑器并写 `pl.assetPick`、关闭写 `pl.assetSeed` 为 `null`、全部完成后“去分镜”高亮，目标按旧 `seedBoard`）、我的资产（复制提示词、确认后删除、空状态）；删除与关闭导入条后整页重挂载，同旧页面整页重画；文件名、导出名、props 不变 — `src/features/assets/AssetsHomePage.tsx`、`Pv.tsx`
- [修改] 节点编辑器替换占位：参考图上传只做预览不保存、名称与档案、多选项（按功能原顺序重排）、风格弹层（页签、搜索、选中后收起，格子高亮沿用旧页面只在重画时更新的时机）、比例与分辨率、按节点位置画连线并随窗口尺寸重画、手改提示词（再改表单即被模板覆盖）、保存与“储存并返回”、带入后标记导入条完成并在全部完成时 0.9 秒后跳分镜；功能 id 不在菜单里时显示资产首页 — `src/features/assets/AssetEditorPage.tsx`、`StylePop.tsx`、`prompt.ts`
- [新增] 档案框语音输入（旧 `addMic` / `micListen`）：浏览器支持语音识别时才出现话筒，结果接在原文后，原文不以标点结尾时用逗号连接；卸载时停止识别 — `src/features/assets/Mic.tsx`
- [修改] 提示词搜索的资产功能说明改为从资产库完整菜单取 `desc`，去掉重复的一份；P2-A 对照测试 39 项照常通过 — `src/features/prompts/func-index.ts`
- [新增] 新旧双跑对照：旧页面在独立 jsdom 窗口整页运行（真实内联脚本与 hashchange 路由），新页面经 `RouteView` 渲染；同一 localStorage 种子与同一组桩（时钟、手动推进的定时器、confirm、剪贴板、FileReader、语音识别、元素尺寸、计算样式），每步比较 `#view` DOM、localStorage 原文、hash、请求、提示条、confirm、剪贴板 — `tests/parity/assets-twin.tsx`
- [新增] 对照与单测 123 项：资产首页 30 项、编辑器 74 项（8 个功能 × 新建 / 已存 / 带入，`assetPick` 指向别的功能、缺字段、`?i=` 越界与非数字、`$&` 与占位符、未知风格、自定义画风、未知功能、连线层隐藏；旧代码 21 个事件各有用例并断言可见变化）、常量与提示词拼装 15 项、StrictMode 4 项 — `tests/parity/assets-home.test.tsx`、`assets-editor.test.tsx`、`assets-menus.test.ts`、`tests/unit/assets.test.tsx`
- [新增] 变异检验：源码 53 处人为改动（文案、阈值、键名、键顺序、正则、分支、跳转目标、定时、连线坐标），首轮 49 处被发现、1 处匹配多处未生效；3 处逃过（`assetPick` 键顺序、`seedBoard` 的 kind 判断、导入条标记序号），补 4 个用例后连同修正的 1 处全部被发现
- 差异：旧页面菜单与“我的资产”用普通对象查 `FN`，`#/assets/constructor` 等原型键会抛错；新页面按未知功能显示资产首页
- 差异：语音识别在离开编辑器时停止；旧页面不停止，之后的识别结果会写到已移除的输入框并抛错
- 差异：比较时不比较旧 `backDirty` 的内部标记 `data-dirty`（样式表不用它，`dirty` 类与“储存并返回”文字照常比较），由 P1-A 的 `BackBar` 用 props 表达
- 发现：保存或删除资产后，新侧栏（P1-A `Nav` 订阅 `pl.assets`）立即更新“我的资产”目录，旧页面要到下次换页才重画侧栏
- 验证：全包 36 个文件 938 项通过（node 451、dom 487）；`tsc --noEmit` 无错误；`vite build` 产物仍只有 `index.html`，`check:dist` 在后端地址为空与 `https://api.example.test/` 下通过；`LEGACY_TEMPLATE=latest` 下 36 项失败（既有 2 项加资产库 34 项，均来自 `f331924`）；未做浏览器验证

### web-react 撤销构建工作流

- [删除] 只构建不发布的工作流 `web-react-build.yml`（push main、pull_request 时安装依赖、类型检查、测试、构建、校验产物）；原因：用户决定去掉未被要求的 CI 工作流 — `.github/workflows/web-react-build.yml`
- [修改] 受影响的 README 说明：`packages/web-react/README.md` 里没有关于该工作流的文字，无需改动；根 `README.md` 与 `build.py` 对 `.github/workflows` 的描述（发布网站、长剧本任务、热点同步）本就不含它，也未改

### web-react P4：PRO 首页与对话框、作品卡、五步表单 `packages/web-react`

对照基准：固定快照 `tests/fixtures/legacy-template.1cf6f6c.html`（`viewScriptHome` 至 `wzSeedAssets`，第 1539–2073 行）；`f331924` 之后的模板改动不在本节范围。

- [修改] PRO 首页替换占位：对话框、作品网格（类型标签、规格、时间）、删除作品选择模式、全选 / 取消、移到回收桶（确认框、30 天提示、写 `trashed` 与 `time`、整页重画）、回收桶入口计数、空状态；文件名、导出名、props 不变 — `src/features/pro-chat/ScriptHomePage.tsx`
- [新增] 对话框：连接器（CSS 隐藏，DOM 与点击照旧）、三个页签、输入区只在旧 drawBody 时机重画（“清空”按钮、拖放区按重画时的快照）、字数提示、发送（auto 生成作品卡写 `pl.vibeCard`；paste / novel 合并 `pl.scriptDraft` 后跳 `#/script/new`）、风格 / 比例 / 思考强度弹层（滑杆同步写 `pl.vibeCard.depth`）、麦克风 — `src/features/pro-chat/Chat.tsx`、`chat-data.tsx`
- [新增] 文件读取：docx、pdf 与旧页面一样按需从 cdnjs 加载 mammoth 1.6.0、pdf.js 3.11.174（同地址只加载一次，脚本标签已在即不重试），直接引用全局名使错误提示文字相同；txt / md 依序试 UTF-8、GB18030、Big5 — `src/features/pro-chat/read-file.ts`
- [新增] 弹层开关：对话框与作品卡共用一个“当前打开的弹层”，点页面任意处关闭 — `src/features/pro-chat/pops.ts`
- [新增] 作品卡：七星（`QIXING` 男频 / 女频角色与剧本模式）、9 个下拉（风格、比例、受众、角色、模式、尺度三档、配对、集数、时长）、爽点、独家点子起手句、取名骰子、思考深度、切换受众时清掉不在新组的七星并整卡重画、开写（未登录打开登录面板并提示；已登录用 `wzBuildWork` 写 `pl.works`，设 `W.id` 后写回 `pl.vibeCard`，跳 `#/script/v/<id>`，不启动写作）；接口 `WorkCard` 的 props 写在 `types.ts` — `src/features/pro-chat/card/`
- [新增] 语音输入 hook `useMic`（旧 `micListen` / `addMic`）：对话框、作品卡故事框、独家点子框三处共用；分隔规则、zh-CN、连续识别、再按停止、start 抛错提示同旧页面 — `src/features/pro-chat/card/speech.ts`
- [修改] 五步表单替换占位：三种模式与 txt / md 汇入（4MB 上限）、读取这份文件取剧名、骨架、第一季规格（自定义集数与时长、每分钟字数）、补充设定、撞题比对、辨识度、就差提示、预览与进度、AI 帮我想弹窗（复用 `components/TextModal`）、草稿自动保存（编辑时不存）、建立作品并写 `pl.assetSeed` 跳资产库；输入框不受控，刷新区按 update() 快照渲染 — `src/features/script-form/ScriptFormPage.tsx`、`progress.ts`
- [新增] 对照测试 173 项：PRO 首页 102 项、作品卡 35 项、五步表单 36 项；旧页面在独立 jsdom 窗口里实跑，两边同种子、同随机序列与时钟、同一组桩（confirm、剪贴板、语音识别、动态脚本与解析库、FileReader、滚动、下载），每步比较 DOM 逐节点、localStorage 原文、hash、提示条、弹窗、滚动、焦点、桩调用、登录面板、works 推送次数 — `tests/parity/pro-twin.tsx`、`pro-home.test.tsx`、`pro-card.test.tsx`、`script-form.test.tsx`
- [新增] 变异检验 69 处：首轮 64 处被发现，1 处替换命中注释（无效，改到代码行重做），4 处逃过（回收桶计数阈值、正文只有空白的 paste 状态、弹窗小说截取长度、相似度取整），补用例后全部被发现
- 差异：作品卡切换受众重画、或页面卸载时，正在进行的语音识别会停止；旧页面不停止，识别结果继续写进已脱离页面的旧输入框
- 差异：旧 `viewScriptHome` 给 `[data-cp]` 绑复制 `wzPrompt`，页面里没有该元素，属不可达代码，未迁移；旧 `wcardOpts` 的 depth、genre、ai 三项卡片上从未渲染，未迁移
- 验证：全包 43 个文件 1278 项通过；`tsc --noEmit` 无错误；`vite build` 产物仍只有 `index.html`，`check:dist` 通过；未做浏览器验证

### web-react P5-B：作品页 `packages/web-react`

对照基准：旧模板快照 `tests/fixtures/legacy-template.1cf6f6c.html`（`viewVibeScript` 第 2963–3136 行、`genWait` / `loginGate` / `genFail` 第 2926–2962 行、上架资料第 2846–2900 行）。验证力度按 2026-11-24 决定：关键路径行为对照，不做逐节点 DOM 比较与大规模变异检验。

- [修改] 作品页替换占位：进入时写 `pl.lastVibe`、补 `vname` 与 `seed` 后调 `enterWork`；写作引擎每次刷新按地址里的分页重新进入（替代 `yqRefresh`）；卸载不调用 `stopYq`；文件名、导出名、props 不变 — `src/features/work/WorkPage.tsx`
- [新增] 状态页：登录闸（`doLogin` 后重进，期间已离开本页则不重进）、等待页（秒表；旧版云端作业每 8 秒轮询 `GET /jobs/:id`，90 秒未建单记为出错）、失败页（再写一次、先看草稿）— `src/features/work/StatusViews.tsx`
- [新增] 作品页主体：标题与写作进度（忙线提示、出错后接着写）、统计、五个分页按钮、编辑作品、AI 审稿（复制提示词并打开对应网站）；分页切换写 `pl.vibeTab`、`replaceState` 改地址、`setNavRoute` 进入作品上下文 — `src/features/work/ReadyView.tsx`、`model.ts`、`CopyBtn.tsx`
- [新增] 分页：各集大纲（策划卡、分集表、分集大纲弹窗、跳到剧情对话并滚动）、剧情对话（`sxHL` 高亮、不在写时可重写单集）、角色资产库（角色 / 场景切换，点卡片写 `pl.assetSeed`、`pl.assetPick` 跳资产库）、分镜图（时长与素材数、弹层播放器、编辑与去生成跳 `#/assembler?ep=作品.集`）— `src/features/work/tabs/OutlineTab.tsx`、`ScriptTab.tsx`、`AssetsTab.tsx`、`BoardTab.tsx`、`Vm.tsx`
- [新增] 上架资料：`listingSources` + `yqChat`（2500 tokens，高尺度用 `YQ_HOT`）+ `listingClean` 写回作品；逐行复制、复制全部、下载 .txt（带 BOM）、重新生成；生成中状态为模块级，离开再回来仍显示 — `src/features/work/tabs/ListingTab.tsx`、`listing-busy.ts`
- [新增] 导出：项目 ZIP 与 XTASY 导入包（文件清单、顺序、JSON 键序、BOM 规则同旧页面），XTASY 另开新窗口 — `src/features/work/export.ts`、`ReadyView.tsx`
- [新增] 新旧行为对照 29 项：旧页面在 jsdom 整页实跑，新组件同种子同桩（时钟、随机数、fetch、剪贴板、下载、新窗口），每步比较关键区块文字、`pl.*` 原文、请求、hash、提示条、下载文件逐字节、剪贴板、侧栏上下文、是否在写、上架资料入口参数；写作引擎两边打桩 — `tests/parity/work-harness.tsx`、`work.test.tsx`
- [新增] 组件测试 7 项：StrictMode 只开写一次、卸载不停止并续写、刷新重进、秒表、分页副作用、滚动与弹层 Esc、导出清单 — `tests/unit/work-page.test.tsx`
- 差异：地址里分页不存在（如 `/xyz`）时旧页面画侧栏抛错，新页面不抛错，显示同旧页面（分页不高亮、内容为空、侧栏不进作品上下文）
- 差异：旧页面在登录请求返回前已离开作品页时会把作品页画到当前页上，新页面不再进入；旧页面离开作品页时打开着的分镜弹层不关闭，新页面随卸载关闭
- 验证：全包 45 个文件 1314 项通过（新增 36 项）；`tsc --noEmit` 无错误；`vite build` 与 `check:dist` 通过；未做浏览器验证

### web-react P6-C：错误边界、语音输入合并与锁文件对齐 `packages/web-react`

- [新增] 路由错误边界：页面渲染期抛错时不白屏，保留上一次成功渲染的页面并在控制台记录错误（同旧页面停在上一页）；没有上一页，或保留的上一页再次抛错时，显示“页面出错了”提示与刷新按钮；路由变化（每次 hashchange）自动复位重试；正常路径不增加任何 DOM 节点 — `src/app/ErrorBoundary.tsx`
- [修改] `App` 在 `RouteView` 外层接入错误边界，`routes.ts`、`RouteView.tsx` 未改 — `src/app/App.tsx`
- [新增] 错误边界测试 9 项：正常路径无额外节点、抛错保留上一页并记录错误、连续出错停在最后成功页、路由变化复位、无上一页时提示与刷新按钮、保留页再抛错退回提示，以及 `App` 接入后的整体行为 — `tests/unit/error-boundary.test.tsx`、`tests/unit/app-error-boundary.test.tsx`
- [修改] 合并两份语音输入实现：对话框、作品卡故事框与独家点子框用的 `useMic`，和资产编辑器的话筒，合为 `lib/speech.ts` 一份识别逻辑（`useMic` 增加受控值写回方式 `listenText`）；识别参数、分隔规则、DOM、报错文案不变 — `src/lib/speech.ts`
- [新增] 资产编辑器话筒组件改放共享位置，基于 `useMic` — `src/components/MicButton.tsx`
- [删除] 重复实现：原 `features/pro-chat/card/speech.ts`（移到 `lib/speech.ts`）、`features/assets/Mic.tsx`（移到 `components/MicButton.tsx`） — `src/features/pro-chat/card/speech.ts`、`src/features/assets/Mic.tsx`
- [修改] 调用方只换引用：`Chat.tsx`、`WorkCard.tsx`、`AssetEditorPage.tsx`（`speechRec` 改 `speechCtor`） — `src/features/pro-chat/Chat.tsx`、`src/features/pro-chat/card/WorkCard.tsx`、`src/features/assets/AssetEditorPage.tsx`
- [修改] 根锁文件里 web-react 的 `engines` 记录对齐 `packages/web-react/package.json`（`^22.22.2 || ^24.15.0 || >=26.0.0`，与 jsdom 31 的要求一致）；此前每次 `npm install` 都会改写这一行；只改这一行，未升级或新增任何依赖 — `package-lock.json`
- 验证：全包 47 个文件 1323 项通过（新增 9 项，既有对照测试未改动，麦克风相关 45 项结果不变）；`tsc --noEmit` 无错误；`vite build` 与 `check:dist` 通过；`npm ci` 后与 `npm install` 后 `git status` 均干净；Dockerfile 的 build、deps 两个阶段构建通过；未做浏览器验证

### web-react P6-A：追平 f331924（资产回收桶与共用多选）`packages/web-react`

对照基准：由 `1cf6f6c` 推进到 `f331924`（`git log` 核对：两者之间 `site-template.html` 只有这一次改动，也是开工时的最新改动）。验证力度按 2026-11-24 决定：关键路径行为对照。

- [新增] 资产回收桶页 `#/assets-trash`（旧 `viewAssetTrash`）：剩余天数、清空回收桶、还原到我的资产末尾、永久删除，进入与每次写回后清理过期项 — `src/features/assets/AssetTrashPage.tsx`、`trash-store.ts`
- [新增] 领域函数 `purgeAssetTrash`（旧同名函数的纯逻辑：只在有过期项时写回，缺 `trashed` 的项随之丢掉）— `src/domain/asset-trash.ts`
- [新增] 存储键 `assetsTrash`，键数 18 → 19 — `src/lib/storage.ts`
- [新增] 路由 `#/assets-trash` 解析为 `{ view: 'tool', tool: 'assets', trash: true }`，分派到回收桶页 — `src/app/routes.ts`、`src/app/RouteView.tsx`
- [修改] 我的资产：去掉每张卡的“删除”，改为“删除资产”选择模式（勾选框、全选按已选顺序补齐、取消、移到回收桶确认框与提示条），按勾选顺序放到回收桶最前；标题右侧新增回收桶入口与计数；进入时先清理过期项 — `src/features/assets/AssetsHomePage.tsx`
- [新增] 选择模式样式 `.picking …`（旧模板由 `.works.picking` 放宽而来；`legacy.css` 不改，P6-D 拆分时并回去）— `src/features/assets/assets.css`
- [修改] 作品页多选同旧 `pickMode`：底栏按钮 `id="pkAll|pkCancel|pkGo"` 改为 `data-pk="all|x|go"`，确认框文案随旧模板改为“把 N 部移到回收桶？” — `src/features/pro-chat/ScriptHomePage.tsx`
- [修改] 固定快照换成 `legacy-template.f331924.html`（332,119 字节，sha256 `21bd18c2…6500`），删除 `1cf6f6c` 快照（留在 git 历史）；README 改写为可重复的追平 SOP；统一入口与守卫指向新快照 — `tests/fixtures/`、`tests/parity/legacy.ts`、`tests/unit/legacy-snapshot.test.ts`、`packages/web-react/README.md`
- [修改] 测试随新模板改写：资产首页涉及 `data-del` 的 4 项用例（旧模板已删掉该按钮）改写为选择模式、过期清理与回收桶入口的 11 项；作品页用例的按钮选择器与确认框文案；键表加 `assetsTrash`；路由用例加 3 个 `#/assets-trash` 地址 — `tests/parity/assets-home.test.tsx`、`pro-home.test.tsx`、`lib.test.ts`、`shell.test.ts`、`tests/unit/assets.test.tsx`
- [新增] 回收桶新旧对照 13 项（空、有数据、过期清理、缺时间项、返回、还原、永久删除、清空、完整流程）、`purgeAssetTrash` 7 组新旧对照、StrictMode 组件测试 2 项 — `tests/parity/assets-trash.test.tsx`、`domain-base.test.ts`、`tests/unit/assets.test.tsx`
- 验证：变基到 P6-C 之后全包 48 个文件 1350 项（本节新增 27 项），默认（固定快照）与 `LEGACY_TEMPLATE=latest` 都 0 失败；`tsc --noEmit`、`vite build`、`check:dist` 通过；未做浏览器验证

### GitLab 镜像接入（容器服务模板 `outdoor/service-template`）

依据模板 main `2f28dff9`。组件名 `outdoor-tianji`，制品名 `app`。接入申请材料只写在 Obsidian 项目文档里，未发送。

- [新增] MR 与受保护分支校验 `.gitlab-ci.yml`，与模板逐字一致；Runner 标签沿用模板默认 `devops-verify` 占位，待管理员提供 — `.gitlab-ci.yml`
- [新增] 与中央 CI（`devops/artifacts`）的约定文件，与模板逐字一致：`build-image.sh`、`manifest.py` 及 4 份 `test_*.py` — `.gitlab/`
- [新增] `plan.py`：相对模板只改 `RUNNER = 'outdoor-tianji'` 与 `CHECKS = ('policy', 'web', 'worker', 'web-react')`；`IMAGES` 保持 `{'app': ('Dockerfile', '.')}` — `.gitlab/plan.py`
- [新增] `verify.sh` 项目检查：`web`（`build.py site`，只需 Python）；`worker`（类型检查 + 测试，没设 `TEST_DATABASE_URL` 时 20 项数据库集成测试跳过并打印提示）；`web-react`（类型检查、测试、`vite build`、`check:dist`）；后两项缺 npm 时明确失败；没有 `node_modules` 时先 `npm ci` — `.gitlab/verify.sh`
- [新增] 检查工具链 `Dockerfile.ci`：模板的 Python 3.12 基础镜像加官方 Node.js 24 与 npm，两个基础镜像都固定 digest — `.gitlab/Dockerfile.ci`
- [新增] 运行配置键名示例（只有键名与公开默认值，密钥只列名字）— `config/variables.example.json`
- [修改] `.dockerignore` 补模板项：`*.pem`、`*.key`、`.gitlab-ci.yml`、`.gitlab/`、`config/`、CI 产物；`.gitignore` 补 `.env.*`（保留 `!.env.example`）、`*.pem`、`*.key`、CI 产物 — `.dockerignore`、`.gitignore`
- [修改] Dockerfile：4 个基础镜像固定 digest（多架构索引）；`USER node` 改为固定数字 `USER 1000:1000`；去掉 `# syntax=docker/dockerfile:1`，中央 CI 的 BuildKit 用内置前端，不再拉取 syntax 镜像 — `Dockerfile`
- [修改] worker README 容器镜像一节：数字 UID、只读根文件系统、amd64 schema-engine — `packages/worker/README.md`
- 健康检查沿用已有的 `GET /`（无需登录与 Origin，返回 `{ok:true}`），未新增接口，后端代码未改
- 验证：本机 macOS 上 `policy` 有 1 项失败（模板测试桩用 GNU `stat -c`，只能在 Linux 跑），其余通过；在 `.gitlab/Dockerfile.ci` 构建的 amd64 镜像里跑 README 的循环命令，接临时 PostgreSQL 16 时 4 项检查全过（policy 15 项、worker 23 项、web-react 1350 项）；不接数据库时 worker 3 过 20 跳过并打印提示；用模板的纯 Python 镜像跑时 `worker` 明确失败（npm not found）
- 验证（镜像）：`docker build --platform linux/amd64` 通过，镜像 amd64、`User=1000:1000`，含 `schema-engine-linux-musl-openssl-3.0.x`；`docker run --read-only --tmpfs /tmp` 下空库 `migrate:status` 退出码 1、服务拒绝启动，`migrate` 成功后 `migrate:status` 为最新；服务启动后 `GET /` 200、登录、`/me`、保存与读取作品正常，根文件系统写入被拒；不挂 `/tmp` 时 `migrate:status` 与服务也正常；`docker stop` 退出码 0
