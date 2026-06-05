# 成片 Video Worker

HTTP 入队（`POST /video/biography|studio`）后，实际 LLM + TTS + 渲染由 **独立 worker 进程**消费，不阻塞 API。

## 单实例、串行执行（设计如此）

当前队列实现为采访目录下的 **磁盘 JSON 文件**（`采访/{id}/worker-queue/`），**没有** Redis / DB 级分布式锁。

因此：

| 约束 | 说明 |
|------|------|
| **只跑 1 个 worker 进程** | PM2 / systemd 里 `hello-story-video-worker` 的 `instances` 必须为 **1**；不要水平扩容多个 worker 抢同一 `DATA_USERS_ROOT` |
| **一次只跑一条流水线** | `runVideoWorkerOnce()` 认领一条任务 → 跑完传记/演播室全流程 → 再处理下一条；**这是预期行为，不是缺陷** |
| **排队可接受** | 多条任务按 `createdAt` FIFO 等待；传记全程可能 30 分钟级，后续任务在 `queued` 状态排队即可 |

前端/API 通过 `GET /video/tasks/:taskId` 看 `status` 与 `queue` 快照；用户可在生产页看到「排队中 / 生成中」。

## 与 API 的关系

```
浏览器 → HTTP API（入队、查进度、下产物）
              ↓ 写 worker-queue/*.json
         video-worker（单进程轮询、认领、执行 pipeline）
              ↓ 写 成片/{taskId}/pipeline、媒体、成品
         HTTP API（artifacts / video 下载）
```

- API 与 worker **必须共用** 同一份 `backend/.env`，尤其是 `DATA_USERS_ROOT`
- 只开 API、不开 worker → 任务永远停在 `queued`

## 启动方式

| 环境 | 命令 |
|------|------|
| 开发 | `npm run dev:worker`（ts-node） |
| 生产 | `npm run build && npm run start:worker`（`dist/video/worker/cli.js`） |
| PM2 | `npm run pm2:start`（见 `ecosystem.config.cjs`） |
| systemd | `backend/deploy/systemd/hello-story-video-worker.service` |

调试处理一条：`npm run start:worker:once`

## 失败与重试

- 流水线失败 → 队列与 meta 为 `failed`，错误在 `lastError` / `queue.error`
- HTTP `POST /video/tasks/:taskId/retry` 仅对 **failed** 有效，重新标为 `queued`
- worker 崩溃且心跳超时（默认 120s，`VIDEO_QUEUE_HEARTBEAT_TIMEOUT_SEC`）后，僵死 `running` 任务可被重新认领

## 相关环境变量

| 变量 | 默认 | 含义 |
|------|------|------|
| `VIDEO_WORKER_POLL_MS` | 3000 | 无任务时轮询间隔 |
| `VIDEO_WORKER_HEARTBEAT_MS` | 15000 | 执行中写心跳间隔 |
| `VIDEO_QUEUE_HEARTBEAT_TIMEOUT_SEC` | 120 | 超时后可 reclaim `running` 任务 |

长步骤（TTS、文生图）可把 timeout 调到 **300+**，避免误判僵死。

## 何时需要改架构

若以后要 **多 worker 并行** 或 **缩短排队**，需先做：

- 外部队列（Redis / DB）+ 单任务认领锁
- 再考虑 PM2 `instances > 1` 或多机 worker

在改之前，**维持单 worker、串行跑 pipeline 即可满足生产**。
