# 项目上线清单（美区 / iOS App Store）

> 全项目通用模板。`{slug}` = 仓库名（kebab-case）；域名固定 `hellotita.top`，每项目独立 path。  
> Hello Story 示例：`{slug}` = `hello-story`。

**列说明**

| 列 | 含义 |
|----|------|
| **阶段** | 工作所属环节 |
| **事项** | 具体要做的事 |
| **位置** | 代码 / 配置 / 平台 |
| **Hello Story 示例** | 本仓库对应值 |
| **完成标准** | 如何验收 |

---

## 总表

| 阶段 | 事项 | 位置 | Hello Story 示例 | 完成标准 |
|------|------|------|------------------|----------|
| **1. 代码** | 核心用户链路可跑通（登录→主流程→删号） | 仓库 | 采访→文本→成片 | TestFlight 真机走通 |
| **1. 代码** | iOS 登录方式符合 Guideline 4.8 | 前端 + 后端 | Sign in with Apple | 仅 Apple 登录，无其它社交登录 |
| **1. 代码** | 账号注销 + Apple 二次验证 | `DELETE /api/auth/me` | 已实现 | 删号后 token 失效、数据清除 |
| **1. 代码** | 美区首版隐藏未就绪功能（积分/IAP 等） | `VITE_ENABLE_QUIZ_REWARDS=0` | iOS 构建已关 | App 内无活动/观看/钱包 Tab |
| **1. 代码** | 壳层与关键页双语（目标市场语言） | `frontend/src/i18n/` | `en.ts` / `zh.ts` | 美区包英文 UI 无中文硬编码 |
| **1. 代码** | 业务内容语种与目标市场一致 | 后端 `APP_LOCALE` + LLM `outputLocale` | `APP_LOCALE=en` | 采访/成文/旁白为英文 |
| **1. 代码** | 法律/Support 静态页在**本项目**内 | `backend/public/legal/` | `privacy/terms/support.html` | `curl localhost:3001/privacy` 200 |
| **1. 代码** | 法律页 HTTP 路由 | `backend/src/routes/legal.routes.ts` | `/privacy` `/terms` `/support` | 本进程可访问 |
| **1. 代码** | App 内 Privacy / Terms / Support 链接 | 登录页 + 账户页 | `LegalLinks` + `legalUrls.ts` | 点击在浏览器打开 |
| **1. 代码** | AI 生成内容免责声明 | 账户「关于」等 | `legal.aiDisclaimer` | 用户可见说明 |
| **1. 代码** | PM2 进程定义 | `backend/ecosystem.config.cjs` | `hello-story-api` / `-video-worker` | `pm2 list` 名称唯一 |
| **1. 代码** | 一键部署脚本 | `backend/deploy/start.sh` | `./deploy/start.sh` | Ubuntu 上 ci+build+pm2 成功 |
| **1. 代码** | 生产包去掉开发用网络例外 | `frontend/ios/App/App/Info.plist` | 移除 `NSAllowsLocalNetworking`（若仅 dev 用） | 生产 IPA 无本地 HTTP 例外 |
| **1. 代码** | Privacy Manifest（若 SDK 要求） | `ios/App/PrivacyInfo.xcprivacy` | 暂无则需按插件文档补 | Archive 无隐私清单告警 |
| **2. 后端配置** | 生产 `.env` 存在且不入库 | 服务器 `/home/admin/apps/{slug}/backend/.env` | 从 `.env.example` 复制 | 密钥仅服务器本地 |
| **2. 后端配置** | `APP_LOCALE` | `.env` | `APP_LOCALE=en` | `GET /api/health` → `"locale":"en"` |
| **2. 后端配置** | 关闭 Apple 登录 mock | `.env` | `APPLE_AUTH_DEV_MOCK=0` | 真机 Apple 登录成功 |
| **2. 后端配置** | `APPLE_BUNDLE_ID` 与 Xcode 一致 | `.env` | `io.github.com.YaoHuan123.hello-ai-story` | 与 App ID 相同 |
| **2. 后端配置** | LLM / TTS / 文生图密钥与 endpoint | `.env` | `OPENAI_*` `TTS_*` | 成片任务可完成 |
| **2. 后端配置** | `JWT_SECRET` 生产随机值 | `.env` | 非 `change-me` | 安全审计通过 |
| **2. 后端配置** | 数据目录可写 | `DATA_USERS_ROOT` 等 | `./data/users` | worker 与 API 共用路径 |
| **2. 后端配置** | `PORT` 与 Nginx 反代一致 | `.env` | `PORT=3001` | 反代目标端口正确 |
| **3. 前端 / iOS 构建配置** | 生产 API 地址 | `frontend/.env.ios.local` 或 Codemagic vars | `VITE_API_BASE_URL=https://hellotita.top/hello-story/api` | App 请求生产 HTTPS |
| **3. 前端 / iOS 构建配置** | 界面语言（美区） | 同上 | `VITE_LOCALE=en` | 壳层固定英文 |
| **3. 前端 / iOS 构建配置** | 功能开关 | 同上 | `VITE_ENABLE_QUIZ_REWARDS=0` | 无积分相关 UI |
| **3. 前端 / iOS 构建配置** | 法律页 URL 基址（可选） | `VITE_LEGAL_SITE_ORIGIN` | `https://hellotita.top` | 链接与 Nginx path 一致 |
| **4. 服务器 Ubuntu 22** | 代码部署路径 | 服务器 | `/home/admin/apps/hello-story` | 目录与仓库名一致 |
| **4. 服务器 Ubuntu 22** | 预装 Node LTS、npm、pm2、ffmpeg | 服务器 | Node 22 + `npm i -g pm2` | `node -v` `pm2 -v` `ffmpeg -version` |
| **4. 服务器 Ubuntu 22** | 首次 / 更新部署 | `backend/deploy/start.sh` | `./deploy/start.sh` | `pm2` 两进程 online |
| **4. 服务器 Ubuntu 22** | 健康检查 | curl | `curl /api/health` | `"ok":true` |
| **4. 服务器 Ubuntu 22** | 法律页经 Nginx 公网可访问 | Nginx | 见 `backend/deploy/README.md` | 浏览器打开三 URL 200 |
| **4. 服务器 Ubuntu 22** | API 经 Nginx HTTPS 反代 | Nginx | `/hello-story/api/` → `:3001/api/` | App 可登录、拉数据 |
| **4. 服务器 Ubuntu 22** | TLS 证书 | Nginx / Certbot | `hellotita.top` | HTTPS 有效 |
| **4. 服务器 Ubuntu 22** | `pm2 startup` + `pm2 save`（可选） | 服务器 | 重启后进程自启 |  reboot 后 API 恢复 |
| **5. Codemagic** | 仓库分支与触发 | `codemagic.yaml` | `ios` 分支 push | Push 触发构建 |
| **5. Codemagic** | Apple Team ID / Bundle ID | yaml + Apple Developer | Team `TCPBS85F56` | 与 Xcode 一致 |
| **5. Codemagic** | **Sign in with Apple** 已开 | Apple Developer → App ID | Capability 已勾选 | Entitlements 含 Apple Sign In |
| **5. Codemagic** | 代码签名：App Store | Codemagic UI + yaml | `hellostory-appstore` + `app-common` | Archive / Upload 成功 |
| **5. Codemagic** | 代码签名：**App Store Distribution**（提审） | Codemagic UI | 需单独 App Store profile | Archive / Upload 成功 |
| **5. Codemagic** | 构建环境变量 `VITE_API_BASE_URL` | yaml `environment.vars` | 生产 HTTPS，非局域网 | IPA 内 API 指向生产 |
| **5. Codemagic** | 构建环境变量 `VITE_LOCALE` | yaml 或 `.env.ios` 生成块 | `en` | 美区英文包 |
| **5. Codemagic** | 构建环境变量 `VITE_ENABLE_QUIZ_REWARDS` | yaml `.env.ios` 块 | `0` | 与本地 iOS 一致 |
| **5. Codemagic** | `npm run ios` + `pod install` | yaml scripts | 已有 | 构建日志无 sync 错误 |
| **5. Codemagic** | 产出 IPA / 上传 TestFlight | artifacts + publishing | `build-ipa` 或 `app-store-connect` | TestFlight 可见构建 |
| **6. App Store Connect** | 创建 App 记录 | App Store Connect | Bundle ID 匹配 | App 状态可提交 |
| **6. App Store Connect** | **Privacy Policy URL** | Connect → App Information | `https://hellotita.top/hello-story/privacy` | 链接公网可开 |
| **6. App Store Connect** | **Support URL** | 同上 | `https://hellotita.top/hello-story/support` | 链接公网可开 |
| **6. App Store Connect** | 营销 URL（可选） | 同上 | 产品官网或 hellotita 路径 | 可选 |
| **6. App Store Connect** | App 名称、副标题、描述（英文） | Connect → 版本页 | Hello Story 英文文案 | 无误导、说明 AI 用途 |
| **6. App Store Connect** | 关键词、分类 | Connect | Lifestyle / Entertainment 等 | 与产品匹配 |
| **6. App Store Connect** | 截图（6.7" / 6.5" 等必填尺寸） | Connect | 真机或模拟器截图 | 各尺寸齐全 |
| **6. App Store Connect** | App 预览视频（可选） | Connect | — | 可选 |
| **6. App Store Connect** | **App Privacy（Privacy Nutrition Labels）** | Connect → App Privacy | 账号、用户内容、诊断等如实填写 | 与隐私政策一致 |
| **6. App Store Connect** | **年龄分级**问卷 | Connect | 如实填 UGC / 无限制网页等 | 分级结果合理 |
| **6. App Store Connect** | **出口合规**（加密） | 提交时问卷 | 通常标准加密豁免 | 可提交 |
| **6. App Store Connect** | **App 审核信息** | Connect | 演示账号说明；Apple 登录无需密码 | 审核员能测主流程 |
| **6. App Store Connect** | 审核备注（AI 说明） | Connect → Notes | 说明 AI 访谈与成片、删号路径 | 降低 2.5.x 拒审风险 |
| **6. App Store Connect** | 上传构建版本 | Transporter / Codemagic / Xcode | 选最新 TestFlight build | 版本页可选构建 |
| **6. App Store Connect** | 提交审核 | Connect | Submit for Review | 状态 Waiting for Review |
| **7. 法务（非代码）** | 隐私政策定稿 | `backend/public/legal/privacy.html` + 律师 | 英文正式版 | 与 Privacy Labels 一致 |
| **7. 法务（非代码）** | 用户协议定稿 | `terms.html` | 英文正式版 | 含 AI 免责 |
| **7. 法务（非代码）** | Support 联系邮箱有效 | `support.html` | `support@...` | 邮件有人收 |
| **8. 提审前自检** | TestFlight：Apple 登录 | 真机 | — | 成功进 App |
| **8. 提审前自检** | TestFlight：核心流程 | 真机 | 采访 + 至少一步生产 | 无崩溃 |
| **8. 提审前自检** | TestFlight：删号 | 真机 | Me → Delete | 账号清除、需重新登录 |
| **8. 提审前自检** | 法律链接从 App 点开 | 真机 | 三链接 HTTPS 200 | 非 404 |
| **8. 提审前自检** | 生产 API 延迟与错误率 | 监控 / 日志 | `pm2 logs` | 可接受 |
| **9. 上线后** | 监控 pm2 / 磁盘 / 队列 | 服务器 | worker 单实例 | 成片不堆积失败 |
| **9. 上线后** | 用户反馈与崩溃（可选） | Sentry 等 | — | 按需接入 |

---

## 按角色分工（简表）

| 角色 | 主要负责阶段 |
|------|----------------|
| **工程** | 1 代码、2 后端配置、3 前端构建配置、5 Codemagic 脚本与变量 |
| **运维** | 4 服务器、Nginx、TLS、PM2 |
| **产品 / 运营** | 6 Connect 文案与截图、7 法务协调 |
| **法务** | 7 隐私政策与用户协议定稿 |

---

## Hello Story 当前对照（2026-06，随开发更新）

| 事项 | 代码/配置状态 | 仍待做 |
|------|---------------|--------|
| Apple 登录 + 删号 | ✅ | — |
| 法律页 + App 内链接 | ✅ | 律师审正文、support 邮箱 |
| 部署脚本 + PM2 | ✅ | 服务器实际部署 + Nginx |
| 美区关积分 Tab | ✅（iOS 构建） | — |
| 生产 `APP_LOCALE=en` | ⚙️ 示例有 | 服务器 `.env` |
| 生产 `VITE_*` + Codemagic | ⚙️ 注释有 | yaml 改 HTTPS + `VITE_LOCALE=en` |
| App Store Distribution 签名 | ❌ | Codemagic 配 Store profile |
| Connect 材料 | — | 截图、Privacy Labels、提审 |
| `PrivacyInfo.xcprivacy` | ❌ | 按 SDK 要求补 |
| 生产 Info.plist 去 dev 例外 | ⚙️ | 上架前改 |

---

## 相关文档

| 文档 | 说明 |
|------|------|
| [backend/deploy/README.md](../backend/deploy/README.md) | Ubuntu + PM2 + Nginx |
| [.cursor/rules/project-deployment-standards.mdc](../.cursor/rules/project-deployment-standards.mdc) | 全项目部署规范 |
| [backend/docs/dual-auth.md](../backend/docs/dual-auth.md) | Apple 登录 |
| [docs/i18n.md](./i18n.md) | 语言与 `APP_LOCALE` |
