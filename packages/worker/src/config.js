/* 配置：全部从环境变量读取（本机开发用 .env，由 server.js 里的 dotenv 载入；线上直接给环境变量） */

// CORS 来源白名单的默认值；设了 CORS_ALLOW_ORIGINS（逗号分隔）就整组替换
export const DEFAULT_CORS_ORIGINS = ['https://acc2023156.github.io', 'http://localhost:8765', 'http://localhost:8766'];

const csv = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };

export function loadConfig(env = process.env) {
  const cors = csv(env.CORS_ALLOW_ORIGINS);
  return {
    port: int(env.PORT, 8080),
    databaseUrl: env.DATABASE_URL || '',
    poolMax: int(env.PG_POOL_MAX, 10),
    corsOrigins: cors.length ? cors : DEFAULT_CORS_ORIGINS,
    maxBodyBytes: int(env.MAX_BODY_BYTES, 5 * 1024 * 1024),
    upstreamTimeoutMs: int(env.UPSTREAM_TIMEOUT_MS, 0),   // 0 = 不设超时，沿用运行时默认
    authSecret: env.AUTH_SECRET || '',     // 登录 token 的签名密钥；换掉会让所有人重新登录
    adminKey: env.ADMIN_KEY || '',         // 会员后台密码（X-Admin-Key）
    accessCode: env.ACCESS_CODE || '',     // 内部通行码（X-Tianji-Code，不扣积分）
    jobSecret: env.JOB_SECRET || '',       // GitHub Actions 回报、热点推送用的密码（X-Job-Secret）
    yqBase: env.YQ_BASE || '', yqKey: env.YQ_KEY || '',
    qwenBase: env.QWEN_BASE || '', qwenKey: env.QWEN_KEY || '',
    ghToken: env.GH_TOKEN || '',
    ghRepo: env.GH_REPO || 'acc2023156/drama-prompt-library',
    ghWorkflow: env.GH_WORKFLOW || 'script-job.yml',
  };
}

/* 必填项缺了直接报错；可选项缺了只返回提示，对应功能不可用 */
export function checkConfig(c) {
  const missing = [];
  if (!c.databaseUrl) missing.push('DATABASE_URL');
  if (!c.authSecret) missing.push('AUTH_SECRET');
  const warn = [];
  if (!c.yqBase || !c.yqKey) warn.push('YQ_BASE / YQ_KEY 未设：/yq/v1/* 写作代理不可用');
  if (!c.qwenBase || !c.qwenKey) warn.push('QWEN_BASE / QWEN_KEY 未设：/v1/* 公司模型代理不可用');
  if (!c.jobSecret) warn.push('JOB_SECRET 未设：热点推送与长剧本任务回报会被拒绝');
  if (!c.adminKey) warn.push('ADMIN_KEY 未设：会员后台不可用');
  if (!c.accessCode) warn.push('ACCESS_CODE 未设：内部通行码不可用');
  if (!c.ghToken) warn.push('GH_TOKEN 未设：长剧本任务无法触发');
  return { missing, warn };
}
