#!/usr/bin/env bash
# 在服务器 /home/admin/apps/hello-story/backend 执行：./deploy/server-apply-web.sh
set -euo pipefail
ROOT="/home/admin/apps/hello-story"
NGINX="/etc/nginx/sites-enabled/default"

cd "$ROOT"
git pull origin ios

cd "$ROOT/backend"
chmod +x deploy/start-web.sh
./deploy/start-web.sh

if ! grep -q 'alias /home/admin/apps/hello-story/frontend/dist/' "$NGINX" 2>/dev/null; then
  echo "==> 向 $NGINX 追加 Hello Story Web SPA location"
  sudo cp "$NGINX" "${NGINX}.bak.hello-story-web.$(date +%Y%m%d%H%M%S)"
  sudo python3 <<'PY'
from pathlib import Path
nginx = Path("/etc/nginx/sites-enabled/default")
text = nginx.read_text()
block = """
    # Hello Story Web SPA（静态 dist；须在 /hello-story/api/ 之后）
    location = /hello-story {
        return 301 /hello-story/;
    }

    location /hello-story/ {
        alias /home/admin/apps/hello-story/frontend/dist/;
        index index.html;
        try_files $uri $uri/ /hello-story/index.html;
    }

"""
marker = "    # HuanQi / default site"
if marker not in text:
    marker = "    location / {"
if marker not in text:
    raise SystemExit("nginx default: cannot find insert marker")
if "alias /home/admin/apps/hello-story/frontend/dist/" in text:
    raise SystemExit("already patched")
nginx.write_text(text.replace(marker, block + marker, 1))
print("patched nginx")
PY
fi

sudo nginx -t
sudo systemctl reload nginx

echo "==> verify"
curl -sI "https://hellotita.top/hello-story/" | head -5
curl -s "https://hellotita.top/hello-story/api/health" | head -c 160
echo ""
