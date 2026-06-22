#!/usr/bin/env bash
set -euo pipefail
FILE="/home/admin/apps/huanqi/apps/web/src/app/api/matches/route.ts"
python3 <<'PY'
from pathlib import Path
p = Path("/home/admin/apps/huanqi/apps/web/src/app/api/matches/route.ts")
text = p.read_text()
if "import type { Match }" not in text:
    text = text.replace(
        'import { prisma } from "@/lib/prisma";',
        'import { prisma } from "@/lib/prisma";\nimport type { Match } from "@prisma/client";',
    )
old = """function matchStatus(
  match: {
    userAUnlockAt: Date | null;
    userBUnlockAt: Date | null;
    userAContactSharedAt: Date | null;
    userBContactSharedAt: Date | null;
  },
  side: "A" | "B",
):"""
new = """function matchStatus(
  match: Match,
  side: "A" | "B",
):"""
if old not in text:
    raise SystemExit("route.ts pattern not found")
p.write_text(text.replace(old, new))
print("patched route.ts")
PY

PATH="/home/admin/.nvm/versions/node/v24.17.0/bin:/usr/local/bin:/usr/bin:/bin"
export PATH
cd /home/admin/apps/huanqi
npm run build --workspace=web
pm2 restart huanqi-web
sleep 4
pm2 list
curl -sI http://127.0.0.1:3001/ | head -3
curl -sI https://hellotita.top/ | head -3
pm2 save
