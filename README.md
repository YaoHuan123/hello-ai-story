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

Open two terminals at the project root:

1) Start backend:

```bash
npm run dev:backend
```

2) Start frontend:

```bash
npm run dev:frontend
```

Then open `http://localhost:5173`.

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
