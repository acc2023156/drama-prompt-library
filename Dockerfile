# syntax=docker/dockerfile:1

# 一个镜像包含全部入口：API 服务、数据库迁移、迁移状态检查，以及构建好的前端静态页。
# 用法见 docker/entrypoint.sh；API 的环境变量见 packages/worker/README.md。

# ---- 1) 前端：把提示词库和 site-template.html 打包成单文件页面 ----
FROM python:3.13-alpine AS web
# 网页请求后端的地址，建置时写入页面；留空表示与网页同源
ARG TIANJI_API_BASE=""
ENV PYTHONUTF8=1 TIANJI_API_BASE=${TIANJI_API_BASE}
WORKDIR /src
COPY . .
RUN python packages/web/build.py site

# ---- 2) 后端依赖：只装生产依赖 ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/web/package.json packages/web/
COPY packages/worker/package.json packages/worker/
RUN npm ci --omit=dev --workspace @tianji/worker --no-audit --no-fund

# ---- 3) 运行镜像 ----
FROM node:24-alpine
ARG GIT_SHA=""
ARG VERSION=""
LABEL org.opencontainers.image.revision=${GIT_SHA} \
      org.opencontainers.image.version=${VERSION}

ENV NODE_ENV=production \
    PORT=8080 \
    PATH=/app/node_modules/.bin:$PATH

# 依赖装在 /app/node_modules，后端代码在 /app/packages/worker（迁移文件按相对路径读取，工作目录必须是这里）
WORKDIR /app/packages/worker
COPY --from=deps /app/node_modules /app/node_modules
COPY packages/worker/package.json ./
COPY packages/worker/src ./src
COPY packages/worker/migrations ./migrations
COPY packages/worker/scripts ./scripts
COPY --from=web /src/packages/web/site /app/site
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["server"]
