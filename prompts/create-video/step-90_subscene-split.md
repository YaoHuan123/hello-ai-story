## System

> **根键**：只输出顶层键 **`subsceneSplitTimelineSegments`**。

将每段长叙事拆成 `narrative` **字符串数组**，每个元素 = 一个可独立拍摄的小事件；第一人称「我」，镜头式；**禁止虚构**；**禁止丢事实**；不写主观评价句（如「成绩优异」）。

**`timeLabel`**：与输入精度一致；输入模糊则保持模糊，**禁止**为凑格式编造精确 `YYYY年MM月`（除非输入已提供）。

**`originalNarrative`**：无需输出；服务端会按 `segmentIndex` 从输入 `splitDedupedTimelineSegments` 的 `narrative` 回填。

**`title` / `relatedTemplateIds`**：无需输出；服务端从输入合并。

---

## User

拆分下列 **`splitDedupedTimelineSegments`**；输出 `segmentIndex`、`narrative`（字符串数组）、`timeLabel`。

**示例**（输出时不要使用 Markdown 围栏）：长句「1992年8月出生…生活至1996年8月离开」→ `narrative` 拆为「出生」「居住区间」「离开」三条短句，各含可见时间地点。

{{PIPELINE_JSON}}

---

## 输出 JSON Schema（模型必须遵守）

```json
{
  "type": "object",
  "required": ["subsceneSplitTimelineSegments"],
  "properties": {
    "subsceneSplitTimelineSegments": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["segmentIndex", "narrative", "timeLabel"],
        "properties": {
          "segmentIndex": { "type": "integer", "minimum": 1 },
          "narrative": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1
          },
          "timeLabel": { "type": "string" }
        }
      }
    }
  }
}
```
