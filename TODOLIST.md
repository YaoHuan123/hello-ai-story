# 用户管理代码移植 TODO

> 目标：将 `E:\hello story` 的用户管理相关能力移植到当前项目 `E:\hello story2`。  
> 策略：先跑通 P0（短信登录 + `/auth/me` + JWT 鉴权），再补 P1/P2。  
> **Tier1 LLM 选题分步清单**：见 [`docs/TIER1_LLM_MIGRATION.md`](docs/TIER1_LLM_MIGRATION.md)。

## 0. 迁移范围确认

- [ ] 确认本次范围（P0/P1/P2）与验收标准
- [ ] 明确是否启用阿里云真实短信，或先走开发 mock

### 分层范围

- **P0 必要**：短信登录、`/api/auth/me`、JWT 鉴权中间件
- **P1 常用**：换绑手机号、删除账号
- **P2 增强**：审计日志、短信限流、角色字段、token version 撤销

---

## 1. 后端依赖与运行时对齐

- [x] 安装依赖：`jsonwebtoken`、`zod`、`nanoid`、`dotenv`
- [x] 安装阿里云依赖：`@alicloud/dypnsapi20170525`、`@alicloud/openapi-client`、`@alicloud/openapi-core`、`@alicloud/tea-util`
- [x] 安装类型：`@types/jsonwebtoken`
- [x] 校验 Node 版本满足 `node:sqlite` 能力
- [x] 在 `backend/.env` 添加基础环境变量
- [x] 在 `backend/src/index.ts` 启用 `dotenv` 加载

---

## 2. 数据库与用户域基础表

- [x] 新建 `backend/src/db/init.ts`
- [x] 迁移并创建 `users` 表（含 `token_version`）
- [x] 迁移并创建 `sms_send_log` 表（短信限流）
- [x] 迁移并创建 `audit_auth_log` 表（鉴权审计）
- [x] 启动阶段完成 DB 初始化并注入到服务层
- [ ] 暂不迁移 `materials/texts/wallet` 等非用户核心表

---

## 3. 配置与类型层迁移

- [x] 新建 `backend/src/config.ts`（`PORT`、`JWT_SECRET`、`JWT_EXPIRES_IN` 等）
- [x] 新建 `backend/src/types.ts`（`JwtPayload`、`AuthSuccessResponse`、`UserRecord`）
- [x] 新建 `backend/src/utils/phone.ts`（手机号标准化）
- [x] 新建/迁移用户工作目录服务（`workspace.service.ts` 或简化版）

---

## 4. 用户管理核心服务迁移（后端）

- [x] 迁移 `smsRateLimit.service.ts`
- [x] 迁移 `authAuditLog.service.ts`
- [x] 迁移 `aliyunSms.service.ts`
- [x] 迁移 `auth.service.ts`
- [x] 先用简化日志（`console`）替代复杂日志依赖，后续再回补

---

## 5. 鉴权中间件与路由迁移（后端）

- [x] 迁移 `backend/src/middleware/auth.ts`
- [x] 确保调用 `initAuthMiddleware(db)`
- [x] 迁移 `backend/src/routes/auth.routes.ts`
- [x] 在 `index.ts` 挂载 `app.use("/api/auth", createAuthRouter(authService))`
- [x] 保留统一错误映射与返回码结构

### 路由验收（后端）

- [x] `POST /api/auth/sms/send`
- [x] `POST /api/auth/sms/login`
- [x] `GET /api/auth/me`
- [x] `PATCH /api/auth/phone`（P1，验收见 `npm run test:auth:p1`）
- [x] `DELETE /api/auth/me`（P1，验收见 `npm run test:auth:p1`）

---

## 6. 前端用户管理最小接入

- [x] 迁移 `frontend/src/types/auth.ts`（或合并到现有类型文件）
- [x] 新建 `frontend/src/api/auth.ts`（`sendSms` / `smsLogin` / `getMe`）
- [x] 新建 token 存储与读取（localStorage）
- [x] 请求层统一附加 `Authorization: Bearer <token>`
- [x] 新建最小登录页（手机号 + 验证码）
- [x] 登录成功后调用 `/api/auth/me` 完成会话验证

---

## 7. 联调与验收

- [x] 后端启动无报错（`.env` 缺失时按预期走 mock 或报配置错误）
- [x] 前端可完成短信登录流程
- [x] `/api/auth/me` 可稳定返回用户信息
- [x] 验证 `token_version`：变更后旧 token 失效（`npm run test:auth:p1`）
- [x] （P1）换绑流程通过
- [x] （P1）删号流程通过

---

## 8. 收口与加固

- [x] 统一错误码与文案（前后端）
- [x] 敏感信息脱敏（手机号/验证码/token）
- [x] 固化 CORS 与前端代理策略
- [x] 更新 `README.md`（环境变量、启动方式、mock 说明）

---

## 建议执行节奏

- [x] 阶段 A：完成 1~3（依赖/DB/配置与类型）
- [x] 阶段 B：完成 4~5（后端 auth 能力跑通）
- [x] 阶段 C：完成 6~7（前端接入与联调）
- [x] 阶段 D：完成 8（加固与文档）

> 当前建议优先级：先做 **P0**，拿到可登录可鉴权的最小闭环，再进入 P1/P2。

---

# 前端访谈模块 TODO

> 目标：在 hello story2 前端对接新后端 `/api/interviews`（`interviewId` + `current` / `submit`），**不移植**老项目 `interviewV2`（`materialId` + MessageAgent）。  
> 参考老项目仅作 UX/交互意图；实现保持薄客户端。持久化说明见 [`docs/interview-persistence.md`](docs/interview-persistence.md)。

## 原则

- 不复用老项目 `frontend/src/features/interviewV2/**` 源码
- API 以 [`backend/src/routes/interview.routes.ts`](backend/src/routes/interview.routes.ts) 为准
- 每期一个可联调闭环，再叠功能

---

## 阶段 1：最小访谈闭环（已完成）

- [x] **1.1** `api/interviews.ts` + `types/interview.ts`（create / list / getCurrent / submit）
- [x] **1.2** 访谈页：新建采访 → 循环读题/提交；按 `type: topic | normal` 渲染（选项 + 文本输入）
- [x] **1.3** 与现有登录页串联：有 token 可进入访谈；展示 loading / 错误文案
- [x] **1.4** 本地联调验收：登录 → 新建 → 基本档案冷启动 → 至少答 1 题 → 选主题 1 次（已完成 50 轮前端 trace）

## 阶段 2：体验补强（进行中）

- [x] 采访列表页：继续未完成 / 新建
- [x] 展示当前 `title`（进行中主题）、简单进度提示
- [x] 复制 `template-config.v2.json` 到 `public/`（仅展示/对照，后端 catalog 仍以代码为准）

## 阶段 3：从老项目「借」交互（非移植，进行中）

- [x] 参考老 `InterviewEditPage`：备选 chips、选主题卡片样式
- [x] 表单类题目（年月 / 单选）：`InterviewQuestion.fieldType` + `fieldChoices`；catalog `control` 映射；`YearMonthInput` / 选项 chips

## 阶段 4：视频创建（传记成片 biography_narration，已完成）

- [x] **4.1** LLM 基础设施：`backend/src/video/shared/llm/`（client、loadPrompt、分片并发）
- [x] **4.2** 传记成片 LLM 步骤（100→225 共 18 步）+ `prompts/create-video/`
- [x] **4.3** 输入适配：`sections.json` → step-20 → pipeline JSON（`video/shared/input/` + `materialPolish20`）
- [x] **4.4** 任务编排 + HTTP + 非 LLM 步（TTS / 文生图 / ffmpeg）
  - worker 队列 + `production.routes.ts`（传记/演播室入队、进度、产物下载）
  - 前端 `ProductionPage` + `PipelineProgress` 制片条
  - 开发：`npm run dev:worker`；文档：`backend/docs/video-worker.md`

## 阶段 5：素材墙与成片增强（进行中）

- [x] **5.1** 采访级地点实景图（最小素材墙）
  - `采访/{id}/素材/places/` + HTTP `GET|POST|DELETE /assets/place-images`
  - 前端生产页上传/列表/删除
- [x] **5.2** step 220 用户地点图风格化（有图时图生图，无图跳过）
- [ ] **5.3** step 220 → 240 文生图参考（**暂缓**，见 [`backend/docs/video-step220-240.md`](backend/docs/video-step220-240.md)）
- [x] **5.4** E2E 验收：`E2E_VIDEO_RENDER=1` 跑通 240→260（文生图 + ffmpeg）；需 `HTTPS_PROXY` + 启动时 `NODE_USE_ENV_PROXY=1`
- [ ] 全站 Tab 壳、钱包、故事墙（不移植老 `materialId` 体系）
