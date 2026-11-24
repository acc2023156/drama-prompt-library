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
- [新增] 启动时自动建表，并新增索引 `yqlog_day`、`yqlog_at`、`ledger_uid`；不再每个请求检查建表 — `src/db.js`
- [修改] 键值储存 KV 迁到 PostgreSQL：热点、热词最新一批存 `snapshots` 表；长剧本任务存 `jobs` 表（结果保留 7 天、请求体保留 2 小时），服务每小时清理过期数据 — `src/store.js`、`src/index.js`、`src/server.js`
- [修改] 扣点、退点、补点改为事务并锁用户行（`SELECT … FOR UPDATE`），退点返回精确余额 — `src/account.js`
- [修改] 口令与密码（`X-Admin-Key`、`X-Job-Secret`、`X-Tianji-Code`）改为常量时间比较；登录 token 算法不变，已登录用户不掉线（已用旧算法互相验证） — `src/account.js`
- [删除] 写作上游写死的 90 秒超时（原为躲 Cloudflare 的 100 秒硬切）；新增可选 `UPSTREAM_TIMEOUT_MS`，默认不设 — `src/index.js`、`src/config.js`
- [删除] Cloudflare 专有内容：`wrangler.toml`、`wrangler` 依赖与 `dev` / `deploy` 脚本、D1 / KV 绑定、`ctx.waitUntil`、`.dev.vars` 与 `.wrangler` 的忽略项 — `packages/worker`、`.gitignore`
- [新增] Node HTTP 入口与适配层：`Request` / `Response` 适配、请求体上限 `MAX_BODY_BYTES`（默认 5MB，超出 413）、浏览器断开即中止上游请求、优雅退出；缺少 `DATABASE_URL` 或 `AUTH_SECRET` 时拒绝启动 — `src/server.js`、`src/http.js`
- [修改] 上游地址或密钥未配置时返回 503（原为请求上游失败后回 502） — `src/index.js`
- [新增] 集成测试 13 项（登录、扣点与退点、已去掉的限流、CORS、热点热词、后台、任务流转、请求体上限）；用 `TEST_DATABASE_URL` 指定测试库 — `test/api.test.js`
- [修改] `package.json`：`type: module`，脚本改为 `dev` / `start` / `test`，依赖 `dotenv`、`pg`；根目录删 `deploy:worker`、加 `start:worker`、`test:worker`；新增 `package-lock.json` — `package.json`、`packages/worker/package.json`

### 前端 `packages/web`

- [修改] 后端地址由写死的 `workers.dev` 地址改为建置时环境变量 `TIANJI_API_BASE`（留空表示同源，末尾斜杠自动去掉）— `site-template.html`、`build.py`
- [修改] `pages.yml`、`publish-site.yml` 建置时传入仓库变量 `TIANJI_API_BASE` — `.github/workflows`
- [修改] 重试说明注释去掉 524 状态码 — `site-template.html`

> ⚠️ 发布前需在 `acc2023156/drama-prompt-library` 仓库设置变量 `TIANJI_API_BASE`，否则下次发布的网页会请求同源地址。

### 文档

- [修改] `packages/worker/README.md` 重写（运行方式、环境变量、测试）；`README.md` 与 `build.py` 中 `packages/worker` 的描述去掉 Cloudflare
- [新增] 本文件 `CHANGELOG-dev.md`
