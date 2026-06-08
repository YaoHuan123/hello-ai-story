# HTTP API 一览

后端 Express 暴露的全部 JSON API（及关联静态资源）。实现见：

- `backend/src/app.ts` — 健康检查、视频风格、路由挂载
- `backend/src/routes/auth.routes.ts`
- `backend/src/routes/interview.routes.ts`
- `backend/src/routes/production.routes.ts`

默认 API 前缀：`/api`。除特别说明外，请求头需带：

```http
Authorization: Bearer <JWT>
Content-Type: application/json
```

错误响应一般为 `{ code, message }`；成功时返回 JSON 或 `204 No Content`（无 body）。

---

## 鉴权方式

| 类型 | 适用接口 |
|------|----------|
| 无需登录 | `GET /api/health`，`POST /api/auth/sms/send`，`POST /api/auth/sms/login` |
| Bearer JWT | 其余几乎全部 |
| Bearer **或** query `token=` | `GET /api/interviews/:interviewId/video/tasks/:taskId/cover`（供 `<img src>` 使用） |

---

## 1. 系统 / 健康检查

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `GET` | `/api/health` | 无 | 服务状态、时间戳、`locale`、短信模式（国内/海外 mock 或 real） |

**响应示例字段：** `ok`, `message`, `timestamp`, `locale` (`zh` \| `en`), `sms`（`mode`, `china`, `overseas`）

---

## 2. 认证与用户（`/api/auth`）

| 方法 | 路径 | 鉴权 | 请求体 | 响应 |
|------|------|------|--------|------|
| `POST` | `/api/auth/sms/send` | 无 | `{ phone, scene }` | `{ ok, ... }` |
| `POST` | `/api/auth/sms/login` | 无 | `{ phone, code }` | `{ token, userId, phone, ... }` |
| `GET` | `/api/auth/me` | Bearer | — | `{ userId, phone, dataDir, createdAt, role }` |
| `PATCH` | `/api/auth/phone` | Bearer | `{ newPhone, newCode, oldCode }` | `{ phone }` |
| `DELETE` | `/api/auth/me` | Bearer | `{ code }` | `{ ok: true }` |

**`scene` 枚举：** `login` | `change_phone_old` | `change_phone_new` | `delete_account`

---

## 3. 采访 / 故事（`/api/interviews`）

均需登录。`:interviewId` 为采访 UUID。

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/interviews` | 创建采访；body 可选 `{ title? }` → `InterviewMeta`（`201`） |
| `GET` | `/api/interviews` | 列出当前用户所有采访 → `{ interviews: [...] }` |
| `DELETE` | `/api/interviews/:interviewId` | 删除采访及数据 → `{ ok: true }` |
| `GET` | `/api/interviews/:interviewId/messages` | 聊天历史（已答记录）→ `{ messages: [...] }` |
| `GET` | `/api/interviews/:interviewId/current` | 当前题目 → `InterviewQuestion` |
| `POST` | `/api/interviews/:interviewId/submit` | 提交答案 / 选主题 / 跳过 → `{ ok: true }` |

**`submit` 请求体：**

```json
{
  "key": "题目 key",
  "text": "题目文案",
  "value": "用户答案（跳过时可为空）",
  "skip": false
}
```

跳过时须 `skip: true`，且可不传 `value`。

---

## 4. 生产就绪

挂载于采访路径下。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/interviews/:interviewId/production/readiness` | 是否可生成文本/视频、小节数、可用故事文本任务、TTS 音色提示等 |

**主要字段：** `ready`, `sectionCount`, `usableSectionCount`, `storyTextTasks`, `latestStoryTextTaskId`, `hasStoryText`, `message`, `locale`, `biographyTtsVoice`, `studioHostVoice`, `studioGuestVoice`

---

## 5. 文本生产（`/api/interviews/:interviewId/text/...`）

文本生成在 **HTTP 请求内同步执行**（`runTextPipeline`）。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `.../text/tasks` | 列出文本任务 → `{ tasks: [...] }` |
| `POST` | `.../text/tasks` | 创建并生成；body 可选 `{ mode?: "llm" \| "stub" }` → `201` |
| `GET` | `.../text/tasks/:taskId` | 任务进度详情 |
| `DELETE` | `.../text/tasks/:taskId` | 删除任务 → `204` |
| `GET` | `.../text/tasks/:taskId/article` | 正式故事正文（展示用） |
| `GET` | `.../text/tasks/:taskId/artifacts` | 产物索引 |
| `GET` | `.../text/tasks/:taskId/artifacts/file` | 下载文章 JSON 文件 |

**`POST /text/tasks` 响应：** `taskId`, `status`, `completedSteps`, `articlePath`, `progress`

---

## 6. 视频生产（`/api/interviews/:interviewId/video/...`）

视频生成 **异步**：API 在 `成片/{taskId}/` 创建任务，由 worker 扫描执行。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `.../video/tasks` | 列出视频任务 → `{ tasks: [...] }` |
| `GET` | `.../video/tasks/:taskId` | 任务进度（`meta.json`） |
| `POST` | `.../video/biography` | 创建传记纪录片任务 → `202` |
| `POST` | `.../video/studio` | 创建对话访谈片任务 → `202` |
| `POST` | `.../video/tasks/:taskId/retry` | 重试失败任务 |
| `DELETE` | `.../video/tasks/:taskId` | 标记删除（写 `.deleted`，worker 异步清目录）→ `204` |
| `GET` | `.../video/tasks/:taskId/artifacts` | 产物清单（含 `primaryVideo.available`） |
| `GET` | `.../video/tasks/:taskId/artifacts/file?rel=` | 按相对路径下载单个产物 |
| `GET` | `.../video/tasks/:taskId/video` | 流式播放完整成片（`Content-Disposition: inline`） |
| `GET` | `.../video/tasks/:taskId/cover` | 成片封面图；Bearer 或 `?token=` |

**`POST /video/biography` body（均可选）：**

```json
{
  "styleId": "风格 id",
  "textTaskId": "故事文本任务 uuid",
  "polishMode": "llm",
  "styleConfigPath": "...",
  "throughStep": "...",
  "taskId": "复用已有任务 uuid"
}
```

**`POST /video/studio` body（均可选）：**

```json
{
  "textTaskId": "故事文本任务 uuid",
  "qaGranularity": "hybrid",
  "polishMode": "llm",
  "throughStep": "...",
  "taskId": "..."
}
```

**调度响应（`202`）：** `taskId`, `kind`, `status`

---

## 7. 视频风格配置

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `GET` | `/api/production/video-styles` | Bearer | 传记可用画面风格 → `{ selectedStyleId, styles: [...] }` |

**静态资源（非 JSON）：**

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/static/video-styles/**` | 风格封面等静态文件（`config/video-styles/`） |

---

## 8. 地点图片（`/api/interviews/:interviewId/assets/...`）

接口已实现；Web 产品 UI 当前未接入。详见 `backend/docs/place-images-material-wall.md`。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `.../assets/place-images` | 地点图索引 |
| `POST` | `.../assets/place-images` | 上传 base64 图片 → `201` |
| `DELETE` | `.../assets/place-images/:imageId` | 删除 |
| `GET` | `.../assets/place-images/:imageId/file` | 读取图片二进制 |

**上传 body：**

```json
{
  "placeKey": "地点 key",
  "mimeType": "image/jpeg",
  "dataBase64": "...",
  "originalName": "可选"
}
```

`mimeType` 允许：`image/jpeg` | `image/png` | `image/webp`

---

## 9. 路由挂载顺序

`app.ts` 中生产子路由 **先于** 采访 router 挂载，以便封面接口可用 query `token=` 鉴权，而不被采访 router 的全局 `authMiddleware` 挡住：

```text
/api/health
/api/production/video-styles
/api/auth/*
/api/interviews/:interviewId/*   ← production（text / video / assets / readiness）
/api/interviews/*                ← 采访 CRUD + current + submit + messages
/static/video-styles/*
```

---

## 10. Web 前端封装对照

| 前端模块 | 覆盖接口 |
|----------|----------|
| `frontend/src/api/health.ts` | `GET /api/health` |
| `frontend/src/api/auth.ts` | `/api/auth/*` 全部 5 个 |
| `frontend/src/api/interviews.ts` | 采访 6 个 |
| `frontend/src/api/production.ts` | readiness、text、video、video-styles、封面/成片 blob |

**未在 Web UI 使用：** 地点图片 4 个接口。

---

## 11. 接口统计

| 模块 | 数量 |
|------|------|
| 系统 | 1 |
| 认证 | 5 |
| 采访 | 6 |
| 生产就绪 | 1 |
| 文本 | 7 |
| 视频 | 10 |
| 视频风格 API | 1 |
| 地点图片 | 4 |
| **JSON API 合计** | **35** |
| 静态资源 | `/static/video-styles/**` |

---

## 12. 常见错误码（节选）

| code | 典型 HTTP | 场景 |
|------|-----------|------|
| `UNAUTHORIZED` | 401 | 未登录或 token 失效 |
| `INVALID_PARAMS` | 400 | 请求体校验失败 |
| `INTERVIEW_NOT_FOUND` | 404 | 采访不存在 |
| `QUESTION_ENGINE_*` | 409 | 提交与当前题目进度不一致 |
| `TEXT_PIPELINE_NO_SECTIONS` | 400 | 采访内容不足，无法生成文本 |
| `VIDEO_PIPELINE_NO_STORY_TEXT` | 400 | 无可用故事文本，无法生成视频 |
| `VIDEO_TASK_DELETE_BUSY` | 409 | 视频任务进行中，不可删除 |
| `AI_SERVICE_UNAVAILABLE` | 502 | LLM / 翻译等上游失败 |
| `SMS_RATE_LIMITED` | 429 | 验证码发送过频 |

完整映射见各 `routes/*.ts` 中的 `map*Error` 函数。
