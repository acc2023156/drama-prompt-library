/* 配置：全部从环境变量读取，用 Zod 校验（本机开发用 .env，由 server.ts 里的 dotenv 载入；线上直接给环境变量） */
import { z } from 'zod';

// CORS 来源白名单的默认值；设了 CORS_ALLOW_ORIGINS（逗号分隔）就整组替换
export const DEFAULT_CORS_ORIGINS = ['https://acc2023156.github.io', 'http://localhost:8765', 'http://localhost:8766'];

// 空串、未设置都按默认值处理；写了非法值则报错，而不是悄悄回退
const optionalInt = (def: number) =>
  z.preprocess((v) => (v === undefined || v === '' ? undefined : v), z.coerce.number().int().nonnegative().default(def));
const str = z.string().default('');
const baseUrl = z.string().default('').refine((v) => v === '' || URL.canParse(v), { message: '必须是完整的 URL' });

const EnvSchema = z.object({
  PORT: optionalInt(8080),
  DATABASE_URL: str,
  PG_POOL_MAX: optionalInt(10),
  CORS_ALLOW_ORIGINS: str,
  MAX_BODY_BYTES: optionalInt(5 * 1024 * 1024),
  UPSTREAM_TIMEOUT_MS: optionalInt(0), // 0 = 不设超时，沿用运行时默认
  AUTH_SECRET: str, // 登录 token 的签名密钥；换掉会让所有人重新登录
  ADMIN_KEY: str, // 会员后台密码（X-Admin-Key）
  ACCESS_CODE: str, // 内部通行码（X-Tianji-Code，不扣积分）
  JOB_SECRET: str, // GitHub Actions 回报、热点推送用的密码（X-Job-Secret）
  YQ_BASE: baseUrl,
  YQ_KEY: str,
  QWEN_BASE: baseUrl,
  QWEN_KEY: str,
  GH_TOKEN: str,
  GH_REPO: z.string().default('acc2023156/drama-prompt-library'),
  GH_WORKFLOW: z.string().default('script-job.yml'),
});

export interface Config {
  port: number;
  databaseUrl: string;
  poolMax: number;
  corsOrigins: string[];
  maxBodyBytes: number;
  upstreamTimeoutMs: number;
  authSecret: string;
  adminKey: string;
  accessCode: string;
  jobSecret: string;
  yqBase: string;
  yqKey: string;
  qwenBase: string;
  qwenKey: string;
  ghToken: string;
  ghRepo: string;
  ghWorkflow: string;
}

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error('环境变量不合法：\n' + lines.join('\n'));
  }
  const e = parsed.data;
  const cors = csv(e.CORS_ALLOW_ORIGINS);
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    poolMax: e.PG_POOL_MAX,
    corsOrigins: cors.length ? cors : DEFAULT_CORS_ORIGINS,
    maxBodyBytes: e.MAX_BODY_BYTES,
    upstreamTimeoutMs: e.UPSTREAM_TIMEOUT_MS,
    authSecret: e.AUTH_SECRET,
    adminKey: e.ADMIN_KEY,
    accessCode: e.ACCESS_CODE,
    jobSecret: e.JOB_SECRET,
    yqBase: e.YQ_BASE,
    yqKey: e.YQ_KEY,
    qwenBase: e.QWEN_BASE,
    qwenKey: e.QWEN_KEY,
    ghToken: e.GH_TOKEN,
    ghRepo: e.GH_REPO,
    ghWorkflow: e.GH_WORKFLOW,
  };
}

/* 必填项缺了直接报错；可选项缺了只返回提示，对应功能不可用 */
export function checkConfig(c: Config): { missing: string[]; warn: string[] } {
  const missing: string[] = [];
  if (!c.databaseUrl) missing.push('DATABASE_URL');
  if (!c.authSecret) missing.push('AUTH_SECRET');
  const warn: string[] = [];
  if (!c.yqBase || !c.yqKey) warn.push('YQ_BASE / YQ_KEY 未设：/yq/v1/* 写作代理不可用');
  if (!c.qwenBase || !c.qwenKey) warn.push('QWEN_BASE / QWEN_KEY 未设：/v1/* 公司模型代理不可用');
  if (!c.jobSecret) warn.push('JOB_SECRET 未设：热点推送与长剧本任务回报会被拒绝');
  if (!c.adminKey) warn.push('ADMIN_KEY 未设：会员后台不可用');
  if (!c.accessCode) warn.push('ACCESS_CODE 未设：内部通行码不可用');
  if (!c.ghToken) warn.push('GH_TOKEN 未设：长剧本任务无法触发');
  return { missing, warn };
}
