# 访谈出题 LLM 耗时 Trace

选主题后首题慢（常见 ~15–20s）时，用 trace 看**哪一步 LLM**占时间。

## 现有能力对比

| 模块 | 逐步耗时 |
|------|----------|
| 成片 video pipeline | 有（`VIDEO_LLM_TRACE` + `VIDEO_PIPELINE_TRACE`，`成片/{taskId}/trace/`）见 [`video-llm-trace.md`](./video-llm-trace.md) |
| **访谈 / 出题** | **本次新增**（`QUESTION_LLM_TRACE`，见下） |

## 开启方式

`backend/.env`（默认 **开启**；生产可关）：

```env
QUESTION_LLM_TRACE=on   # 0 / off / false 关闭
```

重启 backend 后，每次 `GET /api/interviews/:id/current` 会在：

1. **控制台**打印汇总，例如：

```
[question.trace] getCurrentQuestion total=18234ms interview=...
  prep.dedupe                    5123ms ok
  llm.prep.dedupe                5089ms ok
  prep.colloquialize               6012ms ok
  ...
  traceDir: .../采访/{id}/出题/trace/1735-getCurrentQuestion
```

2. **磁盘**写入：
   - `采访/{id}/出题/trace/{timestamp}-getCurrentQuestion/summary.json` — 总耗时 + 各 step 列表
   - 同目录 `manifest.jsonl` — 逐行 span
   - 同目录 `llm-0001-prep.dedupe-input.json` 这类文件 — 每次发给 LLM 的完整请求体（不含 API Key）
   - 同目录 `llm-0001-prep.dedupe-output.json` 这类文件 — 每次 LLM 返回的原始内容、清理后内容与解析结果
   - `采访/{id}/出题/trace/latest-run.json` — 最近一次请求指针

## 选「大学」后第一题为什么会慢？

catalog 主题（如大学）**不走**基本档案的 stub 短路，首次取题会串行跑 **开答前批量编排**（`runTemplatePrep`）：

1. `prep.dedupe` — 去重模板题  
2. `prep.colloquialize` — 口语化问句  
3. `prep.suggestBatch` — 批量生成备选答案  

每一步都是一次 LLM 往返；**第一道题**通常不再跑 refine（需已有作答记录）。

选题列表本身还可能触发 `topic.selectPending`（Tier1 选题 LLM），与「大学第一题」可能是两次不同的 `getCurrentQuestion` 请求。

## 如何读 summary.json

```json
{
  "operation": "getCurrentQuestion",
  "totalMs": 18234,
  "spans": [
    { "step": "engine.runTemplatePrep", "durationMs": 18100, "ok": true },
    { "step": "prep.dedupe", "durationMs": 5200, "ok": true },
    {
      "step": "llm.prep.dedupe",
      "durationMs": 5150,
      "ok": true,
      "inputFile": "llm-0001-prep.dedupe-input.json",
      "outputFile": "llm-0001-prep.dedupe-output.json"
    }
  ]
}
```

- 外层 `traceQuestionStep`（如 `prep.dedupe`）= 整步含解析  
- 内层 `llm.*` = 纯 HTTP 等待模型时间  
- `inputFile` = 当次 LLM 的 `model/messages/temperature/response_format|thinking` 等完整请求内容
- `outputFile` = 当次 LLM 的 `rawContent`、`cleanedContent`、`parsed`；失败时含错误与原始响应

优化时优先看最慢的 `prep.*` / `llm.prep.*` 步。
