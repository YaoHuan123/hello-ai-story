# TypeScript Fullstack Starter

This workspace includes:

- `frontend`: React + TypeScript + Vite
- `backend`: Express + TypeScript

## Required backend env

Backend uses strict env validation: missing values will fail fast at startup.

Required keys in `backend/.env`:

- `PORT`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `DATA_ROOT`
- `DATA_DB_FILE`
- `DATA_USERS_ROOT`
- `OPENAI_API_KEY`（Tier1 选题 LLM，严格必填）
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `ALIYUN_ACCESS_KEY_ID`
- `ALIYUN_ACCESS_KEY_SECRET`
- `ALIYUN_DYPNSAPI_SIGN_NAME` (or `ALIYUN_SMS_SIGN_NAME`)
- `ALIYUN_DYPNSAPI_TEMPLATE_CODE_LOGIN` (or `ALIYUN_SMS_TEMPLATE_CODE_LOGIN`)
- `ALIYUN_DYPNSAPI_TEMPLATE_CODE_CHANGE_PHONE_OLD` (or `ALIYUN_SMS_TEMPLATE_CODE_CHANGE_PHONE_OLD`)
- `ALIYUN_DYPNSAPI_TEMPLATE_CODE_CHANGE_PHONE_NEW` (or `ALIYUN_SMS_TEMPLATE_CODE_CHANGE_PHONE_NEW`)
- `ALIYUN_DYPNSAPI_TEMPLATE_CODE_DELETE_ACCOUNT` (or `ALIYUN_SMS_TEMPLATE_CODE_DELETE_ACCOUNT`)

Optional for local debugging:

- `ALIYUN_DYPNSAPI_DEV_MOCK=1` (or `ALIYUN_SMS_DEV_MOCK=1`) to force mock SMS mode

## Run in development

Open **three** terminals at the project root (API + worker + frontend):

1) Backend API:

```bash
npm run dev:backend
```

2) Video worker（消费 `/video/biography|studio` 异步入队任务，**必开**）:

```bash
npm run dev:worker
```

3) Frontend:

```bash
npm run dev:frontend
```

Then open `http://localhost:5173`.

## Production (build + dist)

生产环境**不要**用 `ts-node-dev`；先编译再跑 `dist/`：

```bash
cd backend
npm ci
npm run build
npm run start              # HTTP API  → dist/index.js
npm run start:worker       # 成片 worker → dist/video/worker/cli.js
```

Worker 处理单条后退出（cron / 调试）：

```bash
npm run start:worker:once
```

### PM2（推荐）

需全局安装 [PM2](https://pm2.keymetrics.io/)：`npm install -g pm2`

```bash
cd backend
npm ci && npm run build
npm run pm2:start          # hello-story-api + hello-story-video-worker
npm run pm2:logs
npm run pm2:restart
npm run pm2:stop
```

或在仓库根目录：

```bash
npm run pm2:start
```

配置见 `backend/ecosystem.config.cjs`。**video-worker 保持 1 实例**（磁盘 JSON 队列）。

详见 **[成片 Worker 说明](backend/docs/video-worker.md)**：单进程、**一次只跑一条流水线**是当前设计（FIFO 排队即可），不要多开 worker 实例。

### systemd（Linux）

示例 unit 文件：`backend/deploy/systemd/`，说明见同目录 `README.md`。

部署 checklist：

- `backend/.env` 与 API/worker 共用（尤其 `DATA_USERS_ROOT`）
- `ffmpeg` 在 PATH
- 仅 **1** 个 video-worker 进程（串行消费队列，一次一条 pipeline，见 `backend/docs/video-worker.md`）
- 出站网络可达 LLM / TTS / 文生图 API

## API examples

- `GET /api/health`
- `POST /api/auth/sms/send`
- `POST /api/auth/sms/login`
- `GET /api/auth/me`
- `PATCH /api/auth/phone`
- `DELETE /api/auth/me`

The frontend calls APIs via Vite proxy (`/api` -> `http://localhost:3001`).

## Frontend auth debug page

Current `frontend/src/App.tsx` is a minimal auth integration page:

1. send SMS code
2. login with SMS code
3. call `/api/auth/me` with stored Bearer token

Token is stored in `localStorage` key `auth_token`.
