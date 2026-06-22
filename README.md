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
**阿里云短信**（启动不强制；未配齐时开发环境自动 mock，验证码 `123456`）：

- 配齐密钥 + 4 个模板 + 签名 → 设 `ALIYUN_DYPNSAPI_DEV_MOCK=0` 启用真实短信
- 自检：`GET /api/health` 看 `sms.mode`（`real` | `mock`）
- 控制台与变量说明：**[backend/docs/aliyun-sms.md](backend/docs/aliyun-sms.md)**

生产（`NODE_ENV=production`）须配齐全部 `ALIYUN_*`，且**不要**开启 `ALIYUN_DYPNSAPI_DEV_MOCK`。

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

### PM2 / 服务器（Ubuntu 22）

一键部署脚本：`backend/deploy/start.sh`（`npm run deploy:backend`）。说明见 **[backend/deploy/README.md](backend/deploy/README.md)**。

服务器路径：`/home/admin/apps/hello-story`

### systemd（Linux，可选）

示例 unit 文件：`backend/deploy/systemd/`，说明见同目录 `README.md`。

部署 checklist：

- `backend/.env` 与 API/worker 共用（尤其 `DATA_USERS_ROOT`）
- `ffmpeg` 在 PATH
- 仅 **1** 个 video-worker 进程（串行消费队列，一次一条 pipeline，见 `backend/docs/video-worker.md`）
- 出站网络可达 LLM / TTS / 文生图 API

## HTTP API

完整接口列表（按模块：认证、采访、文本/视频生产等）见 **[backend/docs/http-api.md](backend/docs/http-api.md)**。

开发时前端经 Vite 代理访问：`/api` → `http://localhost:3001`。

## Frontend shell

- 未登录：登录页
- 已登录：底部 Tab「故事」（故事墙 = 采访列表）/「我的」（账户）
- 故事卡片 → **访谈** / **生产** 子页（带返回故事墙）

Token 存在 `localStorage` 键 `auth_token`。

登录：**Android / Web 测试** 为 +86 短信（阿里云）；**iOS** 为 Sign in with Apple（国内+海外）。详见 [backend/docs/dual-auth.md](backend/docs/dual-auth.md)。开发环境短信验证码固定 `123456`，Apple mock token 为 `dev-apple-mock-token`。

### 界面语言（i18n）

完整规划见 **[docs/i18n.md](docs/i18n.md)**。

**现阶段：Web 先行**，在 `backend/.env` 用后台开关切换壳层语言：

```env
APP_LOCALE=zh   # 或 en
```

重启 API 后，Web 前端启动时会读 `GET /api/health` 的 `locale`。访谈 / 成文 / 口播等**业务内容仍为中文**（见文档 P1/P2）。

**后续**：Web 验收通过后再为 iOS/Android 配置 `VITE_LOCALE` 构建变体。

## Android（Capacitor）

前端用 [Capacitor](https://capacitorjs.com/) 打包为原生 Android App，复用现有 React UI。

### 前置

- [Android Studio](https://developer.android.com/studio)（含 SDK、模拟器）
- JDK 17+
- 本机已跑通 API：`npm run dev:backend`（默认 `http://localhost:3001`）

### 构建与运行

```bash
cd frontend
npm ci
npm run android          # 构建 Web 资源并 sync 到 android/
npm run cap:open         # 用 Android Studio 打开工程，Run 到模拟器或真机
```

首次若尚无 `android/` 目录，先执行：

```bash
cd frontend
npx cap add android
```

### API 地址

Android 无 Vite 代理，通过 `VITE_API_BASE_URL` 指向后端：

| 场景 | 地址 |
|------|------|
| 模拟器 | `http://10.0.2.2:3001`（默认写在 `frontend/.env.android`） |
| 真机调试 | 电脑局域网 IP，如 `http://192.168.1.100:3001` |
| 生产 | `https://你的域名` |

覆盖默认：复制 `frontend/.env.android.example` 为 `.env.android.local` 后重新 `npm run android`。

HTTP 调试需在 `android/app/src/main/AndroidManifest.xml` 的 `<application>` 上保留 `android:usesCleartextTraffic="true"`（`cap add android` 后已配置）。

仓库根目录快捷命令：`npm run android`、`npm run android:open`。

## iOS（Capacitor）

与 Android 共用同一套 React 前端，原生工程在 `frontend/ios/`。

### 前置

- **Mac** + [Xcode](https://developer.apple.com/xcode/)（含 iOS Simulator）
- [CocoaPods](https://cocoapods.org/)：`sudo gem install cocoapods`（首次在 Mac 上打开工程前执行 `pod install`）
- 本机 API：`npm run dev:backend`（`http://localhost:3001`）

> Windows 可执行 `npm run ios` 生成/同步 `ios/` 目录，但**编译与上架必须在 Mac + Xcode** 完成。

### 构建与运行（Mac）

```bash
cd frontend
npm ci
npm run ios              # vite build --mode ios + cap sync ios
cd ios/App && pod install && cd ../..
npm run cap:open:ios     # 用 Xcode 打开 App.xcworkspace，Run 到模拟器或真机
```

首次若尚无 `ios/` 目录：

```bash
cd frontend
npx cap add ios
```

### API 地址

通过 `VITE_API_BASE_URL` 指向后端（写在 `frontend/.env.ios`）：

| 场景 | 地址 |
|------|------|
| iOS 模拟器（Mac） | `http://127.0.0.1:3001`（默认） |
| 真机调试 | 电脑局域网 IP，如 `http://192.168.1.100:3001` |
| 生产 | `https://hellotita.top/hello-story/api`（须 HTTPS；见 `backend/deploy/README.md`） |

覆盖默认：复制 `frontend/.env.ios.example` 为 `.env.ios.local` 后重新 `npm run ios`。

本地 HTTP 调试已配置 `Info.plist` → `NSAllowsLocalNetworking`（访问局域网与本机 API）。

仓库根目录快捷命令：`npm run ios`、`npm run ios:open`。
