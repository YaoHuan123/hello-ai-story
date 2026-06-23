# 成片 Video LLM / Pipeline Trace

排查成片失败（如 `ENV_SCENE_EMBELLISH_120_INVALID`、`TOTAL_PACK_VOICEOVER_160_INVALID`、TTS 网络错误）时，优先看任务目录下的 trace。

## 目录

```
采访/{id}/成片/{taskId}/
  meta.json                 # status、lastError、completedSteps
  trace/
    run-summary.json        # 步骤耗时与失败摘要（本次新增）
    llm/
      manifest.jsonl        # 每次 LLM 调用索引
      00001-scene_embellish_120-input.json
      00001-scene_embellish_120-output.json
      00001-scene_embellish_120-parse-error.json   # JSON 解析失败时
  pipeline/                 # 各步成功落盘产物
```

## 开关

`backend/.env`（默认 **开启**；与 `VIDEO_LLM_TRACE` 共用关闭语义）：

```env
VIDEO_LLM_TRACE=on          # LLM 请求/响应落盘
VIDEO_PIPELINE_TRACE=on     # 省略时跟随 VIDEO_LLM_TRACE
# 0 / off / false 关闭
```

重启 `hello-story-video-worker` 后生效。

## 1. `trace/run-summary.json` — 先看这个

记录 pipeline 每一步的 **stepId、耗时、是否跳过、产物路径**。失败时额外包含：

| 字段 | 含义 |
|------|------|
| `failedStepId` | 失败步骤（如 `120`、`180`） |
| `lastError` | 与 `meta.json` 中 `lastError` 一致 |
| `lastLlmTrace` | 指向 `trace/llm/` 最后一次 LLM 调用的 input/output/parse-error 文件名 |

示例：

```json
{
  "taskId": "5702db2b-…",
  "status": "failed",
  "totalMs": 312000,
  "failedStepId": "120",
  "lastError": "ENV_SCENE_EMBELLISH_120_INVALID: …无法解析为 JSON…",
  "lastLlmTrace": {
    "debugStepId": "scene_embellish_120",
    "inputFile": "00003-scene_embellish_120-input.json",
    "parseErrorFile": "00003-scene_embellish_120-parse-error.json"
  },
  "steps": [
    { "stepId": "10", "durationMs": 4200, "ok": true },
    { "stepId": "120", "durationMs": 8900, "ok": false }
  ]
}
```

worker 控制台失败时会打印：

```
[video.trace] task=… failed at step=120 (312000ms) → trace/run-summary.json
```

## 2. `trace/llm/` — LLM 原始 I/O

每次 `chatJson` 调用写一对 `*-input.json` / `*-output.json`；解析失败另写 `*-parse-error.json`（含 `rawPreview`，最多约 4000 字符）。

`manifest.jsonl` 每行一条索引，按 `seq` 排序。重试/repair 会用不同 `debugStepId` 后缀（如 `scene_embellish_120_retry`）。

## 3. 非 LLM 失败（TTS / ffmpeg）

TTS、ffmpeg 等 **不会** 出现在 `trace/llm/`。此时：

- `run-summary.json` 的 `failedStepId` 仍指向失败步（如 `180`）
- 细节在 `lastError` 与 **worker 日志**（`pm2 logs hello-story-video-worker`）

## 如何定位一次失败

1. SSH 到服务器，找到 `DATA_USERS_ROOT` 下对应 `成片/{taskId}/`
2. 打开 `trace/run-summary.json` → 看 `failedStepId` 与 `lastLlmTrace`
3. 若是 LLM/JSON 问题 → 打开 `trace/llm/` 下 `parse-error` 或 `output` 文件
4. 对照 `pipeline/` 里上一步产物，必要时从 `fromStep` 重跑

本地调试：

```bash
cd backend
npm run build && npm run test:video:step80   # prep + trace/llm
# 或
npm run test:video:trace                    # trace 落盘 smoke
npm run test:video:pipeline-trace           # run-summary smoke
```

## 与访谈 trace 对比

| 模块 | 步骤耗时 | LLM I/O |
|------|----------|---------|
| 访谈出题 | `QUESTION_LLM_TRACE` → `采访/…/出题/trace/` | 有 |
| **成片 pipeline** | **`trace/run-summary.json`** | **`trace/llm/`** |

详见 [`question-trace.md`](./question-trace.md)。
