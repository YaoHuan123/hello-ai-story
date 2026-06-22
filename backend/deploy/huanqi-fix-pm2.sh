#!/usr/bin/env bash
set -euo pipefail
ROOT="/home/admin/apps/huanqi"
cd "$ROOT"

python3 <<'PY'
from pathlib import Path
import json

eco = Path("ecosystem.config.cjs")
text = eco.read_text()
text = text.replace('args: "run start:web"', 'args: "run start --workspace=web"')
eco.write_text(text)

pkg = Path("package.json")
data = json.loads(pkg.read_text())
data.setdefault("scripts", {})["start:web"] = "npm run start --workspace=web"
pkg.write_text(json.dumps(data, indent=2) + "\n")
print("patched ecosystem + package.json")
PY

pm2 delete huanqi-web 2>/dev/null || true
PATH="/home/admin/.nvm/versions/node/v24.17.0/bin:/usr/local/bin:/usr/bin:/bin"
export PATH
pm2 start ecosystem.config.cjs
sleep 4
pm2 list
ss -tlnp | grep 3001 || true
curl -sI http://127.0.0.1:3001/ | head -3
curl -sI https://hellotita.top/ | head -3
pm2 save
