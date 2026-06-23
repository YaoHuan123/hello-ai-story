#!/usr/bin/env python3
from pathlib import Path

nginx = Path("/etc/nginx/sites-enabled/default")
text = nginx.read_text()
if "alias /home/admin/apps/hello-story/frontend/dist/" in text:
    print("already patched")
    raise SystemExit(0)

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

nginx.write_text(text.replace(marker, block + marker, 1))
print("patched nginx")
