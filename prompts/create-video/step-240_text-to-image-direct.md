本步骤不调用 LLM 进行二次改写，直接使用 `mergedNarrativeSegments[].visualScenes[].sceneDescription` 生成图片提示词。

## 输入

- `pipeline/visual-220_包含视频风格的展开后的场景包.json`
- 字段：`mergedNarrativeSegments`（数组）；每条内的 `visualScenes[].sceneDescription` 作为单帧描述来源（与 `textToImage230.service` 一致）。

若同目录存在 **`pipeline/visual-225_实景路名与地标参考.json`**（步骤 **225** 产出），则对每个 `segmentIndex` + `sceneIndex` 将其中对应条目的实景文字参考**追加**到文生图 API 的 `prompt` 末尾（固定前缀「实景文字参考…」），不另调 LLM。

## Prompt 组装规则（直模板）

将每条 `sceneDescription` 作为主描述，并在前后拼接固定约束：

1. 保留画面主体、时间、地点、动作信息，不引入新事实；
2. 强化“单帧可视化”表达，避免抽象概念；
3. 增加基础画质描述：电影感、细节清晰、自然光影；
4. 地域信息优先通过**可读中文文字**展示（如路牌、站牌、店招、门牌、地名指示牌），并与输入场景线索一致；
5. 文字必须清晰、无乱码、字数适中；若地域线索不足，可使用中性通用标识（如“XX路”“XX站”），不得编造与剧情冲突的具体事实；
6. 负向约束：避免 logo、水印、畸形肢体、低清模糊。

## 可配置项

- `TEXT2IMG_SIZE`：文生图 API 请求体中的 `size` 字段，**不在本步骤自然语言 prompt 中写像素**，避免与接口参数冲突。
  - 未设置时默认 **`2848x1600`**（宽`x`高，须小写 `x`；火山/豆包要求 `size` 为 `WIDTHxHEIGHT` 或 `2k` / `3k`，不能用 `*`）；
  - 可在 `backend/.env` 中设置以覆盖，例如 `2k`、`3k` 或厂商支持的其他 `宽x高`。

- `TEXT2IMG_REGION_TEXT_MODE=on|off`
  - `on`（默认）：强化地域文字展示；
  - `off`：回退为不强制地域文字展示。

## 输出

- 图片文件：`图片文件夹/segment-xxxx.png`
- 索引文件：`pipeline/visual-230_包含图片位置的场景包.json`
- 索引字段：
  - `segmentIndex`
  - `relativePath`
  - `prompt`
