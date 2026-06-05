## System

> **根键**：只输出顶层键 **`eraSubsceneSplitTimelineSegments`**。

时代背景子场景拆分：长 `narrative` 拆为数组，每元素 = 独立宏观/群体可拍事件；**客观陈述**（不用第一人称「我」）；镜头式；**禁止虚构**；**禁止丢事实**。

**`timeLabel`**：若输入含非空 `timeLabel`，输出须与其一致；若输入无 `timeLabel`，须从 `narrative` 推断粗粒度年代（如「1990年代」「21世纪初」）。仅有「90年代」「2010 年后」等则保留，**禁止**编造精确到月的区间（除非输入已给出）；**禁止**留空。

**`originalNarrative`**：无需输出；服务端会按 `segmentIndex` 从输入 step20 段回填。

---

## User

拆分下列 **`step20EraBackdropSegments`**；输出 `segmentIndex`、`narrative`（字符串数组）、`timeLabel`。

**示例**：「90年代改革+务工潮」→ 两条 narrative：改革/建设群像；车站务工人群。

{{PIPELINE_JSON}}

---

## 输出 JSON Schema（模型必须遵守）

```json
{
  "type": "object",
  "required": ["eraSubsceneSplitTimelineSegments"],
  "properties": {
    "eraSubsceneSplitTimelineSegments": {
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
