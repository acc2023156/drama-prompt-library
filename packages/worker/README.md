# @tianji/worker

天玑后端 `tianji-api`，网站所有后端都走这里。技术栈：TypeScript（严格模式）+ [Hono](https://hono.dev)（`@hono/node-server`）+ [Zod](https://zod.dev)（环境变量与请求校验）+ [Prisma 7](https://www.prisma.io)（`@prisma/adapter-pg`）+ PostgreSQL。Node.js `^20.19`、`^22.12` 或 `>=24`。

| 路由 | 用途 |
|---|---|
| `/yq/v1/*` | 写作模型代理（需登录，每次 1 点，失败退点；支持 `stream: true` 流式，流结束才判成败） |
| `/v1/*` | 公司模型代理（需通行码） |
| `/jobs` | 长剧本任务，交给 GitHub Actions `script-job.yml` 跑 |
| `/auth/login`、`/me`、`/works` | 手机号登录、积分、作品上云 |
| `/hot`、`/words` | 热点与热词（由 `hot-sync.yml` 推送到 `/hot/push`、`/words/push`） |
| `/admin/*` | 会员后台（`X-Admin-Key`） |

错误响应统一为 `{error: 文本}`；未知路径一律 404 `{error: "not found"}`。服务本身不做按 IP 的调用限流，需要限流请放在网关 / Ingress。

## 目录

| 路径 | 作用 |
|---|---|
| `src/server.ts` | 启动入口：dotenv、读配置、检查迁移、起服务、定时清理、优雅退出 |
| `src/app.ts` | `createApp({ cfg, prisma })`：CORS、请求体上限、统一错误处理，挂载各路由 |
| `src/routes/` | `account`（登录、我的、作品）、`admin`、`feeds`（热点热词）、`jobs`、`yq`（写作代理）、`models`（公司模型代理） |
| `src/lib/` | `points`（补点扣点退点）、`store`（快照与任务）、`token`、`db`、`migrations`、`http`、`validate` |
| `src/config.ts` | 环境变量的 Zod 校验与默认值 |
| `prisma/schema.prisma` | 表结构的唯一来源 |
| `prisma/migrations/` | Prisma Migrate 迁移文件 |
| `src/generated/` | `prisma generate` 产物，不入库，构建与测试前自动生成 |

## 运行

```
cp packages/worker/.env.example packages/worker/.env   # 填 DATABASE_URL、AUTH_SECRET 等
npm install                                            # 在仓库根目录执行
npm run migrate:worker                                 # 建表 / 升级表结构（首次必须先执行）
npm run dev:worker                                     # 开发（tsx watch，改代码自动重启）
npm run build:worker && npm run start:worker           # 生产：编译到 dist/ 后运行
```

表：`users`、`works`、`yqlog`、`ledger`、`snapshots`（热点热词）、`jobs`（长剧本任务）。服务启动时对照 `prisma/migrations/` 与库里的 `_prisma_migrations` 表（`finished_at` 非空且未回滚才算已执行），有未执行的迁移就拒绝启动并提示命令；不在启动时自动建表。

## 数据库迁移

用 Prisma Migrate。改表结构的唯一入口是 `prisma/schema.prisma`，迁移文件由 `migrate:dev` 生成，已执行的版本记录在 `_prisma_migrations` 表。`DATABASE_URL` 取自环境变量，没设时读 `.env`（`prisma.config.ts`）。

| 命令（在仓库根目录） | 作用 |
|---|---|
| `npm run migrate:worker` | `prisma migrate deploy`：执行全部待执行的迁移（生产、CI 用这个） |
| `npm run migrate:status -w @tianji/worker` | `prisma migrate status`：有待执行项时退出码非 0 |
| `npm run migrate:dev:worker -- --name 迁移名` | `prisma migrate dev`：改完 schema 后在开发库生成并执行新迁移 |
| `npm run prisma:generate -w @tianji/worker` | 只重新生成客户端 |

- **改表结构一律走 schema + 新迁移**，已执行过的迁移文件不要再改；有问题就再生成一个新迁移去修正。
- 并发安全：`migrate deploy` 带数据库咨询锁，K8s 里多个 Job 同时跑只会执行一次（已实测两个容器并发都成功）。
- 上线顺序：**先迁移，再发新版本**。K8s 里把镜像的 `migrate` 子命令作为发布前的 Job 或 initContainer，迁移账号需要建表权限。
- `migrate dev` 只用于开发库：它会用影子库比对，发现漂移时可能要求重置数据库。

### 接管 node-pg-migrate 时代的开发库

此前没有生产库，D1 旧数据已决定丢弃，初始迁移 `20261124100000_init` 直接建全部表（不带 `IF NOT EXISTS`）。已被旧版 node-pg-migrate 建过表的开发库二选一：

- **重建**（推荐）：删库重建后 `npm run migrate:worker`。
- **保留数据接管**：旧表的部分列允许 NULL，新 schema 收紧成了 NOT NULL。先确认这些列没有 NULL 值（有就补上），再在 `packages/worker` 下执行：

```
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script 2>/dev/null > fix.sql   # 审阅：应只有 SET NOT NULL 与 DROP TABLE "pgmigrations"
npx prisma db execute --file fix.sql
npx prisma migrate resolve --applied 20261124100000_init
npx prisma migrate status                          # Database schema is up to date!
```

已实测：数据保留，执行后再 diff 为空迁移。

## 容器镜像

仓库根目录的 `Dockerfile` 多阶段构建（前端静态页、编译 TypeScript、生产依赖、运行镜像），得到**一个镜像**，用子命令切换用途（`docker/entrypoint.sh`）：

| 命令 | 作用 |
|---|---|
| `docker run <镜像>` | 启动 API 服务（默认，`node dist/server.js`），监听 `PORT`，默认 8080 |
| `docker run <镜像> migrate` | `prisma migrate deploy`（发布前的 Job 或 initContainer） |
| `docker run <镜像> migrate:status` | `prisma migrate status`；有待执行时退出码非 0 |
| `docker run <镜像> 其他命令` | 原样执行，例如 `sh` |

```
docker build -t tianji:dev \
  --build-arg TIANJI_API_BASE=https://后端域名 \
  --build-arg GIT_SHA=$(git rev-parse --short HEAD) .
```

- 以非 root 用户（`node`，uid 1000）运行；容器里没有 `.env`，环境变量直接传入。
- 运行镜像含编译产物 `dist/`、`prisma/` 与 `prisma.config.ts`、迁移用的 prisma CLI 与 schema-engine（Alpine 上依赖 `openssl`，已安装）；设了 `CHECKPOINT_DISABLE=1`，prisma CLI 不向外发版本检查请求。
- `/app/site/index.html` 是构建好的前端静态页，后端地址由构建参数 `TIANJI_API_BASE` 写入（留空为同源）；需要静态服务器托管时从该目录复制。
- 镜像里没有 Python、TypeScript 源码、测试和开发依赖；`/` 可作为存活探测路径。
- schema-engine 按构建机架构下载，给 amd64 集群用的镜像要在 amd64 上或用 `docker buildx --platform linux/amd64` 构建。

## 环境变量

本机从 `.env` 读取（dotenv）；线上直接给环境变量。已存在的环境变量优先于 `.env`。完整示例见 `.env.example`。启动时用 Zod 校验：空值按默认处理，写了非法值（如 `PORT=abc`、`YQ_BASE` 不是完整 URL）直接拒绝启动。

| 名称 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `AUTH_SECRET` | 是 | 登录 token 的签名密钥；换掉会让所有人重新登录 |
| `PORT` | 否 | 默认 8080 |
| `CORS_ALLOW_ORIGINS` | 否 | 来源白名单，逗号分隔；设了就整组替换默认值（`https://acc2023156.github.io`、`http://localhost:8765`、`http://localhost:8766`） |
| `PG_POOL_MAX` | 否 | 连接池上限，默认 10 |
| `MAX_BODY_BYTES` | 否 | 请求体上限，默认 5MB，超出回 413 |
| `UPSTREAM_TIMEOUT_MS` | 否 | 写作上游超时，默认 0（不设） |
| `ADMIN_KEY` | 否 | 会员后台密码 |
| `ACCESS_CODE` | 否 | 内部通行码（不扣积分） |
| `JOB_SECRET` | 否 | GitHub Actions 回报、热点推送的密码 |
| `YQ_BASE`、`YQ_KEY` | 否 | 云桥（写作主力）；未设时 `/yq/v1/*` 回 503 |
| `QWEN_BASE`、`QWEN_KEY` | 否 | 公司模型；未设时 `/v1/*` 回 503 |
| `GH_TOKEN`、`GH_REPO`、`GH_WORKFLOW` | 否 | 触发长剧本任务；后两项默认 `acc2023156/drama-prompt-library`、`script-job.yml` |

仓库里不放真实网址和密钥，一律走环境变量。

## 测试与类型检查

集成测试（`node:test` + `tsx`）直接连 PostgreSQL，开始时用 `prisma migrate deploy` 建表并**清空该库里天玑的表**，请指向一个专用的空库：

```
TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/tianji_test npm run test:worker
npm run typecheck:worker
```

没设 `TEST_DATABASE_URL` 时数据库相关用例会跳过。

## 前端如何找到后端

网页的后端地址在建置时由环境变量 `TIANJI_API_BASE` 注入（`packages/web/build.py`）；留空表示与网页同源。GitHub Actions 里通过仓库变量 `TIANJI_API_BASE` 传入。
