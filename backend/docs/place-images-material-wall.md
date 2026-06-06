# 素材墙 · 地点实景图（当前版本不做）

> **状态（2026-06）**：**产品侧暂不开放**。生产页不提供上传/列表/预览 UI；用户正常使用流程不依赖此能力。

## 范围

「地点实景图」指采访级素材墙：用户为传记成片上传与叙事相关的地点照片（如老家村口、母校校门），供流水线 step 220 做风格化。

| 层级 | 当前版本 |
|------|----------|
| **前端生产页** | 不做（已移除「素材墙 · 地点实景图」区块） |
| **HTTP API** | 已实现但不对用户暴露，仅作后续或手工调试 |
| **step 220** | 保留：若磁盘上已有 `采访/{id}/素材/places/` 数据则风格化，**无图则跳过** |
| **step 220→240** | 暂缓，见 [`video-step220-240.md`](./video-step220-240.md) |

## 为何当前版本不做

1. **主路径不阻塞**：无地点图时传记成片可完整跑通至 260。
2. **体验未收口**：上传、预览、placeKey 与叙事匹配、与 240 参考图联动等需一并设计，单独上线素材墙价值有限。
3. **优先保证**：访谈 → 文本 → 成片的核心闭环与账户/生产页其余能力。

## 后端已实现（保留，不删）

便于后续恢复或开发自测：

- 服务：`backend/src/services/interviewPlaceImages.service.ts`
- 路由（挂载于 `/api/interviews/:interviewId`）：
  - `GET /assets/place-images`
  - `POST /assets/place-images`
  - `DELETE /assets/place-images/:imageId`
  - `GET /assets/place-images/:imageId/file`
- 落盘：`采访/{interviewId}/素材/places/` + `place-images-index.json`

前端 API 封装仍在 `frontend/src/api/production.ts`（`listPlaceImages` 等），**无页面调用**。

## 恢复时的建议顺序

1. 生产页恢复上传/列表/缩略图（对接已有 HTTP）。
2. 明确 placeKey 与访谈字段/旁白的匹配规则（文档 + 校验）。
3. 视需求再做 5.3（220 风格化图 → 240 文生图参考）。

## 相关文档

- 成片 step 220/240 暂缓项：[`video-step220-240.md`](./video-step220-240.md)
- 积分 / 钱包（同样当前不做）：[`wallet-credits.md`](./wallet-credits.md)
- 任务队列与生产 HTTP：[`video-worker.md`](./video-worker.md)
- 总览进度：根目录 [`TODOLIST.md`](../../TODOLIST.md) 阶段 5
