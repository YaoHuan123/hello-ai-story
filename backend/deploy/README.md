# Hello Story 服务器部署

部署路径（全项目规范）：`/home/admin/apps/hello-story`

公开 URL（hellotita.top + **本项目 path**）：

| 用途 | 公网 URL | 本进程路由 |
|------|----------|------------|
| **Web 应用** | `https://hellotita.top/hello-story/` | Nginx 静态 `frontend/dist` |
| API | `https://hellotita.top/hello-story/api` | `/api/*` |
| 隐私政策 | `https://hellotita.top/hello-story/privacy` | `/privacy` |
| 用户协议 | `https://hellotita.top/hello-story/terms` | `/terms` |
| Support | `https://hellotita.top/hello-story/support` | `/support` |

法律页 HTML **在本仓库** `backend/public/legal/`，随 API 一起部署，**不要**挂到其它项目的主站目录。

## 1. 首次部署（Ubuntu 22）

服务器预装：Node.js LTS、npm、pm2（全局）、ffmpeg。

```bash
sudo mkdir -p /home/admin/apps
cd /home/admin/apps
git clone <repo-url> hello-story
cd hello-story/backend
cp .env.example .env   # 填入生产密钥
chmod +x deploy/start.sh
./deploy/start.sh
```

或仓库根目录：`npm run deploy:backend`

脚本会 `npm ci` → `npm run build` → `pm2 start|restart ecosystem.config.cjs`。

更新代码后再次执行 `./deploy/start.sh` 即可。

## 1b. Web 静态站（浏览器）

构建配置见 `frontend/.env.web`（`VITE_API_BASE_URL=https://hellotita.top/hello-story`）。**不影响 iOS/Android 构建**（仍用 `build:ios` / `build:android`）。

```bash
cd /home/admin/apps/hello-story/backend
chmod +x deploy/start-web.sh   # 首次
./deploy/start-web.sh
```

或仓库根目录：`npm run deploy:web`

产物：`frontend/dist/`，由 Nginx `location /hello-story/` 托管（见 [`nginx-hellotita-default.conf`](nginx-hellotita-default.conf)）。Web 端为短信登录；Apple 登录仅 iOS App。

本地验证法律页：`curl -I http://127.0.0.1:3002/privacy`

## 2. PM2（手动，一般不必）

**video-worker 只能 1 个实例**（磁盘队列无分布式锁）。详见 [`../docs/video-worker.md`](../docs/video-worker.md)。

生产环境 `.env` 建议：

```env
APP_LOCALE=en
APPLE_AUTH_DEV_MOCK=0
ALIYUN_DYPNSAPI_DEV_MOCK=0
```

根目录快捷命令（开发机）：`npm run pm2:start` / `pm2:restart` / `pm2:logs`；服务器更新用 `./deploy/start.sh`。

## 3. Nginx 反代（示例）

API 生产监听 `PORT=3002`。在 hellotita.top 上为 **hello-story 项目** 增加（完整模板见 [`nginx-hellotita-default.conf`](nginx-hellotita-default.conf)）：

```nginx
# API
location /hello-story/api/ {
  proxy_pass http://127.0.0.1:3002/api/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 300s;
}

# 法律 / Support（本项目 backend/public/legal）
location ~ ^/hello-story/(privacy|terms|support)$ {
  proxy_pass http://127.0.0.1:3002/$1;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
}

# Web SPA（须在 api 之后）
location /hello-story/ {
  alias /home/admin/apps/hello-story/frontend/dist/;
  index index.html;
  try_files $uri $uri/ /hello-story/index.html;
}
```

其它项目使用各自 path（如 `/other-app/privacy`）反代到各自端口，互不共用静态目录。

## 4. systemd（可选，替代 PM2）

见 [`systemd/README.md`](systemd/README.md)。PM2 与 systemd **二选一**，勿重复启动 worker。

## 5. iOS 生产构建

`frontend/.env.ios.local`：

```env
VITE_API_BASE_URL=https://hellotita.top/hello-story/api
VITE_LOCALE=en
VITE_ENABLE_QUIZ_REWARDS=0
```

App 内法律链接见 `frontend/src/lib/legalUrls.ts`（`https://hellotita.top/hello-story/...`）。
