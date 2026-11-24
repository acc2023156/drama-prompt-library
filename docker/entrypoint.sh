#!/bin/sh
# 镜像入口：同一个镜像用不同子命令切换用途，其余参数原样传给对应命令。
#   docker run <镜像>                     启动 API 服务（默认）
#   docker run <镜像> migrate             执行待执行的数据库迁移（发布前的 Job / initContainer）
#   docker run <镜像> migrate:dry         只打印将要执行的 SQL
#   docker run <镜像> migrate:status      列出已执行 / 待执行迁移，有待执行时退出码为 2
#   docker run <镜像> <其他命令>          原样执行，例如 sh、node -v
set -e

cmd="${1:-server}"
[ "$#" -gt 0 ] && shift

case "$cmd" in
  server)         exec node src/server.js "$@" ;;
  migrate)        exec node-pg-migrate up --migration-file-language sql --advisory-lock-mode wait "$@" ;;
  migrate:dry)    exec node-pg-migrate up --migration-file-language sql --dry-run "$@" ;;
  migrate:status) exec node scripts/migration-status.js "$@" ;;
  help|-h|--help)
    sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
    echo "前端静态页已构建在 /app/site，可复制到静态服务器目录。"
    ;;
  *)              exec "$cmd" "$@" ;;
esac
