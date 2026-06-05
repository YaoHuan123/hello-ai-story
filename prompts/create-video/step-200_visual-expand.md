本步骤不调用 LLM，仅做字符串替换与落盘。

## 输入

- `pipeline/audio-110_包含旁白的场景包.json`：读取 `mergedNarrativeSegments`
- `pipeline/visual-190_人物阶段的视觉效果.json`：读取 `visualEntries`

## 处理规则

- 在 `mergedNarrativeSegments` 的字符串字段中，将命中的 `label`（如 `张三[青年]`）替换为：
  - `张三["<description>"]`
- `name` 部分取 `label` 中 `[` 之前的文本。
- `description` 内的反斜杠和双引号会做转义，避免破坏 JSON 文本。
- `visualEntries` 为空或缺失时，不替换，仅对 `mergedNarrativeSegments` 做浅拷贝输出。

## 输出

- 写入 `pipeline/visual-200_包含人物视觉效果的场景包.json`
- 根字段：
  - `savedAt`
  - `inputSceneFile`
  - `inputVisualFile`
  - `skippedReplace`
  - `visualCount`
  - `mergedCount`
  - `mergedNarrativeSegments`
