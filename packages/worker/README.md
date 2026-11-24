# @tianji/worker

天玑后端 `tianji-api`（Node.js ≥ 20 + PostgreSQL），网站所有后端都走这里。

| 路由 | 用途 |
|---|---|
| `/yq/v1/*` | 写作模型代理（需登录，每次 1 点，失败退点；支持 `stream: true` 流式，流结束才判成败） |
| `/v1/*` | 公司模型代理（需通行码） |
| `/jobs` | 长剧本任务，交给 GitHub Actions `script-job.yml` 跑 |
| `/auth/login`、`/me`、`/works` | 手机号登录、积分、作品上云 |
| `/hot`、`/words` | 热点与热词（由 `hot-sync.yml` 推送到 `/hot/push`、`/words/push`） |
| `/admin/*` | 会员后台（`X-Admin-Key`） |

服务本身不做按 IP 的调用限流，需要限流请放在网关 / Ingress。

## 运行

```
cp packages/worker/.env.example packages/worker/.env   # 填 DATABASE_URL、AUTH_SECRET 等
npm install                                            # 在仓库根目录执行
npm run migrate:worker                                 # 建表 / 升级表结构（首次必须先执行）
npm run dev:worker                                     # 开发，改代码自动重启
npm run start:worker                                   # 生产
```

表：`users`、`works`、`yqlog`、`ledger`、`snapshots`（热点热词）、`jobs`（长剧本任务），由迁移文件创建。服务启动时只检查有没有未执行的迁移，有就拒绝启动并提示命令。

## 数据库迁移

用 [node-pg-migrate](https://github.com/salsita/node-pg-migrate)，迁移文件是 `migrations/` 下的纯 SQL，用 `-- Up Migration` / `-- Down Migration` 分隔升级与回退。已执行的版本记录在库里的 `pgmigrations` 表。

| 命令（在仓库根目录） | 作用 |
|---|---|
| `npm run migrate:worker` | 执行全部待执行的迁移 |
| `npm run migrate:dry -w @tianji/worker` | 只打印将要执行的 SQL，不落库 |
| `npm run migrate:status -w @tianji/worker` | 列出已执行 / 待执行；有待执行项时退出码为 2 |
| `npm run migrate:create:worker -- 迁移名` | 生成一个带时间戳的新迁移文件 |
| `npm run migrate:down -w @tianji/worker` | 回退最近一个迁移（会删数据，只用于开发库） |

`DATABASE_URL` 取自环境变量，没设时读 `.env`。

- **改表结构一律新增迁移文件**，已经执行过的文件不要再改；有问题就再写一个新迁移去修正。
- 多条待执行迁移在同一个事务里，任何一条失败就整批回滚，库不会停在一半。
- 并发执行安全：`migrate` 带数据库咨询锁并等待，K8s 里多个副本或 Job 同时跑也只会执行一次。
- 老库接管：初始迁移全部用 `IF NOT EXISTS`，已经有表和数据的库直接跑 `migrate` 即可，数据不动、只补上迁移记录。
- 上线顺序：**先迁移，再发新版本**。K8s 里把 `npm run migrate -w @tianji/worker` 作为发布前的 Job 或 initContainer 执行，迁移账号需要建表权限。

## 环境变量

本机从 `.env` 读取（dotenv）；线上直接给环境变量。已存在的环境变量优先于 `.env`。完整示例见 `.env.example`。

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

## 测试

集成测试直接连 PostgreSQL，**会清空该库里天玑的表**，请指向一个专用的空库：

```
TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/tianji_test npm run test:worker
```

测试开始会先用迁移建表；没设 `TEST_DATABASE_URL` 时数据库相关用例会跳过。

## 前端如何找到后端

网页的后端地址在建置时由环境变量 `TIANJI_API_BASE` 注入（`packages/web/build.py`）；留空表示与网页同源。GitHub Actions 里通过仓库变量 `TIANJI_API_BASE` 传入。
