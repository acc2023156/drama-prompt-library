# @tianji/worker

Cloudflare Worker `tianji-api`，网站所有后端都走这里。

| 路由 | 用途 |
|---|---|
| `/yq/v1/*` | 写作模型代理（需登录，每次 1 点，失败退点） |
| `/v1/*` | 公司模型代理 |
| `/jobs` | 长剧本任务，交给 GitHub Actions `script-job.yml` 跑 |
| `/auth/login`、`/me`、`/works` | 手机号登录、积分、作品上云（D1） |
| `/hot`、`/words` | 热点与热词（由 `hot-sync.yml` 推送） |
| `/admin/*` | 会员后台 |

## 部署

```
npm install
npm run deploy:worker      # 在仓库根目录执行
```

## Secret（不进仓库，用 `wrangler secret put <名称>` 设置）

QWEN_BASE、QWEN_KEY、YQ_BASE、YQ_KEY、ACCESS_CODE、JOB_SECRET、GH_TOKEN、AUTH_SECRET、ADMIN_KEY

本机调试用的值放 `packages/worker/.dev.vars`（已被 git 忽略）。
