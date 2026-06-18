# Hello Story Live Shell

Electron 桌面壳，加载本地 Vite 前端，供 **抖音直播伴侣 / OBS** 按窗口捕获推流。

## 首次安装

```powershell
npm install --prefix desktop
```

若 Electron 二进制下载失败（`ETIMEDOUT` / `ECONNRESET`），可改用国内镜像后重试：

```powershell
cd desktop
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm install
```

若提示 `EBUSY` / 文件被占用，先结束卡住的 `npm install` 进程，再删 `node_modules` 重装。

## 启动顺序

1. 终端 A：`npm run dev:backend`（端口 3001）
2. 终端 B：`npm run dev:frontend`（端口 5173）
3. 终端 C（任选其一）：
   - 仓库根目录：`npm run live-shell`
   - `desktop/` 目录：`npm start` 或 `npm run live-shell`

窗口标题固定为 **Hello Story Live**，默认尺寸 430×932（竖屏，对齐前端手机壳宽度）。

## 抖音直播伴侣

1. 添加来源 → **窗口捕获**
2. 选择窗口 **Hello Story Live**
3. 如需去掉标题栏区域，在伴侣里裁剪画面；或后续可改为无边框窗口

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `LIVE_SHELL_URL` | 加载地址 | `http://localhost:5173` |
| `LIVE_SHELL_ALWAYS_ON_TOP` | 设为 `1` 时窗口置顶 | 关 |
| `LIVE_SHELL_DEVTOOLS` | 设为 `0` 关闭 DevTools | 开发模式自动打开 |
| `NODE_ENV=production` | 不自动打开 DevTools | — |

PowerShell 示例：

```powershell
$env:LIVE_SHELL_URL='http://127.0.0.1:5173'
$env:LIVE_SHELL_ALWAYS_ON_TOP='1'
npm run live-shell
```

## 说明

- 壳内显示内容与浏览器访问同一 URL 一致；登录态保存在 Electron 独立 profile，需在壳内登录一次。
- 本目录不负责启动 backend/frontend，避免端口冲突。
- 打包 `.exe` 未包含在本阶段；需要时可后续加 `electron-builder`。
