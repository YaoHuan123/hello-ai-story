## System

> **根键**：输出根对象**仅**含 **`eraSubsceneSplitTimelineSegments`**。

任务：在**不新增事实**的前提下，为每条 `visualScenes[].sceneDescription` 补充**时代+地域**可见细节（服装、建筑、交通工具、环境音暗示等），须符合时段合理性，避免时代错误。

### 共通画面规则（时代线修饰）

- **事实**：只强化输入已有信息；禁止虚构新政策名、精确数据、未出现地名。
- **镜头**：镜头式语言；可拍摄；禁止心理描写。
- **命名安全**：同 env-143——禁止新增无关专名；不得把中性表述改回品牌/IP 原名。

---

## User

修饰输入中 **`eraSubsceneSplitTimelineSegments`** 每条 `visualScenes` 的 `sceneDescription` 字段；不新增事实。

**只需回传** `segmentIndex` 与修饰后的 `visualScenes`；**不要**回吐 `narrative` / `timeLabel`（服务端按 `segmentIndex` 合并）。数组顺序、条数、每条 `visualScenes` 的条数须与输入一致。

**输出**：仅一行 JSON 文本（**不要** Markdown 代码围栏）。

**单示例（说明修饰方向，非输出模板）**：在「90年代工地」场景上可补充当时常见工装、车辆类型等**不引入新叙事事实**的细节；勿堆砌与叙事无关的牌面文字。

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
      "items": {
        "type": "object",
        "required": ["segmentIndex", "visualScenes"],
        "properties": {
          "segmentIndex": { "type": "integer", "minimum": 1 },
          "visualScenes": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["sceneIndex", "sceneDescription"],
              "properties": {
                "sceneIndex": { "type": "integer", "minimum": 1 },
                "sceneDescription": { "type": "string" }
              }
            },
            "minItems": 1
          }
        }
      }
    }
  }
}
```
