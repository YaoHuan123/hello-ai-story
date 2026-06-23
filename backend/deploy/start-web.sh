#!/usr/bin/env bash
# Hello Story Web 静态站一键构建（Ubuntu 22 + Nginx 托管 dist）
# 用法：在 backend 目录 ./deploy/start-web.sh
# 或仓库根：npm run deploy:web
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_ROOT="$(cd "${BACKEND_ROOT}/../frontend" && pwd)"
slug="hello-story"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令: $1" >&2
    exit 1
  fi
}

require_cmd node
require_cmd npm

if [[ ! -f "${FRONTEND_ROOT}/.env.web" ]]; then
  echo "未找到 frontend/.env.web" >&2
  exit 1
fi

echo "==> [${slug}-web] npm ci (frontend)"
cd "$FRONTEND_ROOT"
npm ci

echo "==> [${slug}-web] npm run build:web"
npm run build:web

echo "==> [${slug}-web] 构建完成: ${FRONTEND_ROOT}/dist"
echo "    公网 URL: https://hellotita.top/hello-story/"
echo "    若 Nginx 已配置 location /hello-story/，执行: sudo nginx -t && sudo systemctl reload nginx"
