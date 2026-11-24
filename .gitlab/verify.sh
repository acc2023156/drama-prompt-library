#!/bin/sh
# Entry point of every check:<name> job; plan.py CHECKS lists the names. "web" needs only
# Python 3; "worker" and "web-react" also need Node.js and npm (see .gitlab/Dockerfile.ci).
set -eu
# CI jobs start from a clean checkout and install once; local runs reuse an existing node_modules.
node_deps() {
  command -v npm >/dev/null 2>&1 || { echo "$1: npm not found; this check needs Node.js 24 (see .gitlab/Dockerfile.ci)" >&2; exit 1; }
  [ -d node_modules ] || npm ci --no-audit --no-fund
}
case "${1:?check required}" in
  policy) python3 -B -m unittest discover -s .gitlab -p 'test_*.py' ;;
  web) PYTHONUTF8=1 python3 -B packages/web/build.py site ;;
  worker)
    node_deps worker
    npm run typecheck:worker
    # The integration tests need an empty PostgreSQL; without one node:test reports them as skipped.
    [ -n "${TEST_DATABASE_URL:-}" ] || echo 'worker: TEST_DATABASE_URL is not set, database integration tests are SKIPPED' >&2
    npm run test:worker
    ;;
  web-react)
    node_deps web-react
    npm run typecheck:web-react
    npm run test:web-react
    npm run build:web-react
    npm run check:dist -w @tianji/web-react
    ;;
  *) echo "Unknown check: $1" >&2; exit 2 ;;
esac
