#!/bin/sh
# 镜像入口：同一个镜像用不同子命令切换用途，其余参数原样传给对应命令。
#   docker run <镜像>                     启动 API 服务（默认）
#   docker run <镜像> migrate             执行待执行的数据库迁移（prisma migrate deploy，发布前的 Job / initContainer）
#   docker run <镜像> migrate:status      列出迁移状态（prisma migrate status），有待执行时退出码非 0
#   docker run <镜像> <其他命令>          原样执行，例如 sh、node -v
set -e

cmd="${1:-server}"
[ "$#" -gt 0 ] && shift

case "$cmd" in
  server)         exec node dist/server.js "$@" ;;
  migrate)        exec prisma migrate deploy "$@" ;;
  migrate:status) exec prisma migrate status "$@" ;;
  help|-h|--help)
    sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'
    echo "前端静态页已构建在 /app/site，可复制到静态服务器目录。"
    ;;
  *)              exec "$cmd" "$@" ;;
esac
