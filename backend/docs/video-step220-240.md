# 传记成片：step 220 与 step 240（暂缓项）

> **状态（2026-06）**：**暂不实现**「220 风格化结果并入 240 文生图参考」。  
> 当前流水线可正常跑通至 260；用户地点图在 220 会风格化并落盘，但不影响 240 成图。

## 背景

传记成片视觉链（节选）：

```
… → 210 风格前缀 → 220 用户地点图风格化 → 230 地理标识 → 240 文生图 → 250 片段 → 260 合并
```

| 步骤 | 当前行为 |
|------|----------|
| **220** | 读 `采访/{id}/素材/places/`（**产品侧上传 UI 当前不做**，见 [`place-images-material-wall.md`](./place-images-material-wall.md)）；有图则按所选视频风格图生图，写入 `pipeline/styled-place-images/` 与 `experiment-place-styled-images.json`；无图则跳过 |
| **230** | 从场景包抽路名/地标，**以文字**并入 240 的 prompt |
| **240** | 对每个 `visualScenes` **纯文生图**（场景描述 + 230 文字参考），**不读取** 220 产物 |

相关代码：

- 220：`backend/src/video/biography/render/step220StyleUserPlaceImages.ts`
- 240：`backend/src/video/biography/render/step240TextToImage.ts`（`generateImagePng`，无 `imageRef`）

## 暂缓项：5.3 是什么意思

**目标**：当某段叙事与用户上传的 `placeKey` 能匹配时，240 生成该段场景图时带上 220 的风格化 PNG 作为**图生图参考**（`imageRef`），使画面更接近用户真实地点，同时保持传记视频画风。

**预期逻辑（未实现，仅作后续参考）**：

1. 读 `experiment-place-styled-images.json`，得到 `placeKey → styledRelativePath`。
2. 按 segment 旁白/叙事文本匹配 `placeKey`（可参考老项目 `buildTailUserImagesMap` 的**匹配意图**，勿搬代码）。
3. 命中时调用 `generateImagePngWithOptionalReference({ prompt, imageRef })`；未命中仍纯文生图。

与 **230** 的分工：

- 230：可读标识类**文字**（路牌、店招）写进 prompt。
- 220→240：用户实拍经风格化后的**图像**作参考，管构图与地点气质。

## 为何先不做

- 220 落盘已满足「上传 + 风格化可追溯」；不接 240 不影响 E2E 与完整成片。
- 匹配规则（`placeKey` 与叙事对齐）、每段用哪张图、多图优先级等需产品约定，不宜先硬编码。
- 老项目将用户图用于 **250 段尾插图**（`tailUserImagesBySegment`），与本项「240 文生图参考」路径不同；若将来要做，需先定 UX（参考图 vs 段尾实拍）。

## 老项目参考（意图 only）

老项目 `E:\hello story` 中：

- `buildTailUserImagesMap`：按 `placeKey` 在 segment 文本中命中，挂到 `segmentIndex`。
- 用于 **视频片段合成（约 step 250）** 段尾追加用户图，而非 230/240 文生图 reference。

/hello story2 禁止照搬老项目源码；上表仅说明业务意图。

## 启用条件（将来若做）

- [ ] 产品确认：240 参考图 vs 250 段尾图，或两者都要。
- [ ] 约定 `placeKey` 命名与匹配规则（含多图、无命中兜底）。
- [ ] 评估文生图 API 成本（带 `image` 的调用通常更贵、更慢）。
- [ ] 补集成测试：有地点图 seed + 断言 240 request 含 reference 或产物差异。

## 相关

- 素材墙 HTTP：`GET|POST|DELETE /api/interviews/:id/assets/place-images`
- Worker 与队列：`backend/docs/video-worker.md`
- E2E：`npm run test:e2e:acceptance`（`E2E_VIDEO_RENDER=1`）
