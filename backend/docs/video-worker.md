# 成片 Video Worker

HTTP 创建任务（`POST /video/biography|studio`）后，实际 LLM + TTS + 渲染由 **独立 worker 进程**消费，不阻塞 API。

## 单实例、串行执行（设计如此）

任务状态保存在 **`成片/{taskId}/meta.json`**（及 `request.json` 调度快照），**没有** Redis / 外部队列。

因此：

| 约束 | 说明 |
|------|------|
| **只跑 1 个 worker 进程** | PM2 / systemd 里 `hello-story-video-worker` 的 `instances` 必须为 **1** |
| **一次只跑一条流水线** | worker 认领一条 `queued` 任务 → 跑完全流程 → 再处理下一条 |
| **排队可接受** | 多条任务按 `meta.createdAt` FIFO 等待 |

前端/API 通过 `GET /video/tasks/:taskId` 看 `status` 与 `completedSteps`。

## 目录结构

```
采访/{id}/成片/{taskId}/
  meta.json       # 状态机：queued / running / success / failed
  request.json    # 调度参数快照（TTS、textTaskId、styleId…）
  .deleted        # 删除标记（API 写入，worker 异步清目录）
  输入/
  pipeline/
```

## 与 API 的关系

```
浏览器 → HTTP API（创建任务、查进度、下产物）
              ↓ 写 成片/{taskId}/meta.json + request.json
         video-worker（扫描 成片/、认领、执行 pipeline）
              ↓ 写 pipeline、媒体、成品
         HTTP API（artifacts / video 下载）
```

- API 与 worker **必须共用** 同一份 `backend/.env`，尤其是 `DATA_USERS_ROOT`
- 只开 API、不开 worker → 任务永远停在 `queued`

## 删除

- `DELETE /video/tasks/:taskId` 写入 `.deleted` 并更新 `meta.deletedAt`
- **生成中也可删**：worker 心跳检测到标记后中止，下一轮轮询物理删除目录
- 删除后 `GET` 进度返回 404；列表接口不展示已删任务

## 启动方式

| 环境 | 命令 |
|------|------|
| 开发 | `npm run dev:worker`（ts-node） |
| 生产 | `npm run build && npm run start:worker`（`dist/video/worker/cli.js`） |
| PM2 | `npm run pm2:start`（见 `ecosystem.config.cjs`） |
| systemd | `backend/deploy/systemd/hello-story-video-worker.service` |

调试处理一条：`npm run start:worker:once`

## 失败与重试

- 流水线失败 → `meta.status = failed`，错误在 `lastError`
- HTTP `POST /video/tasks/:taskId/retry` 仅对 **failed** 有效，重新标为 `queued`（沿用 `request.json`）
- worker 崩溃且心跳超时（默认 120s）后，僵死 `running` 可被重新认领

## 相关环境变量

| 变量 | 默认 | 含义 |
|------|------|------|
| `VIDEO_WORKER_POLL_MS` | 3000 | 无任务时轮询间隔 |
| `VIDEO_WORKER_HEARTBEAT_MS` | 15000 | 执行中写心跳间隔 |
| `VIDEO_TASK_HEARTBEAT_TIMEOUT_SEC` | 120 | 超时后可 reclaim `running` 任务 |

长步骤（TTS、文生图）可把 timeout 调到 **300+**，避免误判僵死。

## 何时需要改架构

若以后要 **多 worker 并行** 或 **缩短排队**，需外部队列 + 认领锁。在改之前，**维持单 worker、串行跑 pipeline 即可满足生产**。
