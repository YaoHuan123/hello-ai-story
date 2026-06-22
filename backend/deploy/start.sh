#!/usr/bin/env bash
# Hello Story 后端一键部署（Ubuntu 22 + PM2）
# 用法：在服务器 /home/admin/apps/hello-story/backend 执行
#   ./deploy/start.sh
# 或仓库根目录：npm run deploy:backend
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_ROOT"

slug="hello-story"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令: $1（Ubuntu 22 请先安装 Node.js 与 pm2）" >&2
    exit 1
  fi
}

require_cmd node
require_cmd npm
require_cmd pm2

if [[ ! -f .env ]]; then
  echo "未找到 .env — 请复制 .env.example 并填入生产配置：" >&2
  echo "  cp .env.example .env && \$EDITOR .env" >&2
  exit 1
fi

echo "==> [${slug}] npm ci"
npm ci

echo "==> [${slug}] npm run build"
npm run build

if pm2 describe "${slug}-api" >/dev/null 2>&1; then
  echo "==> [${slug}] pm2 restart"
  pm2 restart ecosystem.config.cjs
else
  echo "==> [${slug}] pm2 start"
  pm2 start ecosystem.config.cjs
fi

if pm2 save >/dev/null 2>&1; then
  echo "==> pm2 save OK"
else
  echo "==> 提示: 若需开机自启，以部署用户执行 pm2 startup 并按提示配置"
fi

echo "==> [${slug}] 部署完成"
pm2 list
echo ""
echo "健康检查: curl -sS http://127.0.0.1:\${PORT:-3001}/api/health | head -c 200"
