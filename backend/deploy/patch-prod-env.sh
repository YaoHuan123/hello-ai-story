#!/usr/bin/env bash
set -euo pipefail
ENV="${1:-/home/admin/apps/hello-story/backend/.env}"
sed -i 's/^PORT=.*/PORT=3002/' "$ENV"
sed -i 's/^APP_LOCALE=.*/APP_LOCALE=en/' "$ENV"
grep -q '^APPLE_AUTH_DEV_MOCK=' "$ENV" && sed -i 's/^APPLE_AUTH_DEV_MOCK=.*/APPLE_AUTH_DEV_MOCK=0/' "$ENV" || echo 'APPLE_AUTH_DEV_MOCK=0' >> "$ENV"
grep -q '^ALIYUN_DYPNSAPI_DEV_MOCK=' "$ENV" && sed -i 's/^ALIYUN_DYPNSAPI_DEV_MOCK=.*/ALIYUN_DYPNSAPI_DEV_MOCK=0/' "$ENV" || echo 'ALIYUN_DYPNSAPI_DEV_MOCK=0' >> "$ENV"
grep -q '^WALLET_MOCK_RECHARGE=' "$ENV" && sed -i 's/^WALLET_MOCK_RECHARGE=.*/WALLET_MOCK_RECHARGE=0/' "$ENV" || echo 'WALLET_MOCK_RECHARGE=0' >> "$ENV"
grep -E '^(PORT|APP_LOCALE|APPLE_AUTH_DEV_MOCK)=' "$ENV"
