import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// 不用 env()：它在变量缺失时直接报错，构建镜像时的 prisma generate 不需要连库
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
