# 积分 / 钱包（当前版本不做）

> **状态（2026-06）**：**产品侧暂不实现**。无余额展示、充值、扣费、流水；LLM / TTS / 文生图等调用不按积分计费或预扣。

## 范围

老项目 `E:\hello story` 有钱包域（`wallets`、`wallet_holds`、`wallet_transactions` + `/api/wallet/*` + 与 `billing.service` 联动成片任务预扣/结算）。

| 层级 | 当前版本（hello story2） |
|------|--------------------------|
| **数据库表** | 不迁移 `wallets` / `wallet_*` |
| **HTTP API** | 无 `/api/wallet` |
| **前端** | 无余额、积分、充值、流水 UI |
| **成片 / 文本生产** | 入队即跑，无 hold/settle 计费环节 |

## 为何当前版本不做

1. **核心闭环优先**：访谈 → 文本 → 成片 + 账户（登录/换绑/删号）已可验收，积分体系会牵动计费规则、失败退款、展示与合规。
2. **避免半套移植**：老项目 `billing.service` 与任务队列、多产物类型耦合；未设计清规则前不引入表与 API。
3. **与产品策略一致**：首版聚焦内容生产体验，不接入积分资产、充值或任务激励类能力。

## 老项目参考（仅供后续设计，禁止照搬代码）

- 表：`backend/src/db/init.ts`（`wallets`、`wallet_holds`、`wallet_transactions`）
- 服务：`billing.service.ts`（余额、预扣 hold、结算 settle、释放 release）
- 路由：`wallet.routes.ts`（`GET /balance`、`GET /transactions` 等）
- 前端：`/api/wallet` 对接与余额展示

重写时应单独定：计价单位（积分 vs 分）、哪些步骤扣费、失败是否退还、是否与 `materialId` 解耦（本项目用 `interviewId`）。

## 恢复时的建议顺序

1. 定产品与计费规则文档（哪些 API 扣多少、stub 模式是否免费）。
2. 最小表结构 + `GET /api/wallet/balance`（只读展示也可先做）。
3. 成片入队前 `hold`、成功 `settle`、失败 `release`（对接 worker 生命周期）。
4. 前端账户页或顶栏余额；再考虑充值/流水详情。

## 相关文档

- 用户域范围：根目录 [`TODOLIST.md`](../../TODOLIST.md) §2、阶段 5「全站壳」
- 地点素材墙（同样当前不做）：[`place-images-material-wall.md`](./place-images-material-wall.md)
- 生产任务队列：[`video-worker.md`](./video-worker.md)
