# 积分 · 活动 · 观看答题（quiz-rewards 分支）

> **P1**：钱包 mock 充值、四 Tab。  
> **P2**：活动计划 + 视频发布 + 选题。  
> **P3**：观看 Feed + 播放。  
> **P4**：互动答题 + AI 判分 + 发奖。  
> **计划份执行**：发布不扣款，按年 100 份到日扣款注入奖池。  
> **日任务分发**：份执行成功 / 新建计划 / 日初重发 → 随机分配观看任务；Feed 仅展示当日分配给自己的待办。

## 计划份执行

- **发布**：创建计划时不预扣全年预算；`totalPointsBudget` 表示 **每年** 积分，须能被 **100** 整除。
- **份数**：每年 100 份，每份 `pointsPerYear / 100`；`start_year`～`end_year` 各年各 100 条 `plan_portion_executions`。
- **首次执行**：计划创建成功后立即执行当前年最早一份（忽略 `scheduled_date`），扣款并注入奖池，并触发首次任务分发（`source: initial`）。
- **定时执行**：其余份按自然年内均匀映射到 `scheduled_date`；服务端每小时扫描到期份。
- **扣款**：到期执行时从创作者钱包扣一份积分（`plan_portion`），注入 `reward_pool_balance`；余额不足则标记 `failed`，**次年同日**（`next_attempt_on`）重试。
- **发奖**：观众答对记 **预计积分**（写入 session / assignment），**不即时到账**；每日 **23 点日终**从 `reward_pool_balance` 扣款并写入观众钱包（`quiz_reward`）；奖池不足则按题跳过该题发奖。

## 日任务分发

### N 的计算

```
N = min(100, 可用用户数, floor(reward_pool_balance / maxPerViewer), slotsRequested)
maxPerViewer = quiz_question_count × 2
```

- `slotsRequested`：份执行 / backlog 重发时为 100（或 backlog 剩余数）。
- 若 `N === 0`（用户不足或奖池不够）：份仍标记成功（扣款已完成），记录日志，不写入 assignment。

### 触发点

1. **新建计划** — `createPlan` COMMIT 后执行首份 + `distributeForPortion(..., source: initial)`。
2. **份执行成功** — `tryExecutePortion` COMMIT 后 `distributeForPortion(..., source: portion)`。
3. **日初 0–1 点**（服务器本地）— 读 `watch_task_backlog`，重发未完成槽位（`source: redistribute`）。
4. **日终 23–24 点** — 对当日已完成 assignment **逐题发奖**（扣奖池 → 观众钱包）→ 统计 completed / pending → 更新计划统计 → pending 写入 backlog → **删除当日** `watch_task_assignments`。

防重复：调度器用 `scheduler_runs(run_key, ran_at)` 保证每个窗口每天只跑一次。

### Feed 语义

- `GET /api/watch/feed`：仅返回 **当日** `watch_task_assignments` 中 `viewer_user_id = 当前用户` 且 `status = pending` 的任务。
- 访问详情 / 答题：须存在当日 assignment（`pending` 或 `completed` 均可）。
- 答题会话 `completed` 时：对应 assignment 标为 `completed`。

## P4：观看答题 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/watch/:publishId/quiz/start` | 开始或恢复答题会话 |
| GET | `/api/watch/:publishId/quiz/current` | 当前进度与消息 |
| GET | `/api/watch/:publishId/quiz/messages` | 同 current |
| POST | `/api/watch/:publishId/quiz/submit` | 提交答案 `{ answer }` |

### 判分逻辑

1. **生成题目**（`POST /api/campaigns/quiz-questions/generate`）：LLM 每题输出 `question` + `referenceAnswer`（预期答案），发布时写入 `published_quiz_questions.reference_answer`。
2. **提交答案**（`gradeQuizAnswer`）：将 `{ question, referenceAnswer, userAnswer }` 交给 LLM（提示词 `prompts/watch-quiz/grade-answer.md`），返回 `{ correct, reason }`。
3. **前端展示**：消息流展示 ✓/✗、`reason`、**预计 +N 分（23:00 后到账）**；实际到账以日终结算为准。

### 环境变量

| 变量 | 说明 |
|------|------|
| `WATCH_QUIZ_STUB=1` | 开发/集成测试：不调 LLM，用字符串近似匹配（**不再一律判对**） |
| `WATCH_QUIZ_LIVE=1` | 跑 `test:watch-quiz-llm` 时启用真实 LLM 判分 |

本地验证真实 LLM：

```bash
cd backend
npm run build
# PowerShell
$env:WATCH_QUIZ_LIVE='1'; npm run test:watch-quiz-llm
# 后端 dev 时去掉 .env 中的 WATCH_QUIZ_STUB=1，重启后再答题
```

## P3：观看 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/watch/feed` | **我的今日待观看任务** |
| GET | `/api/watch/:publishId` | 视频详情（须已分配） |
| GET | `/api/watch/:publishId/cover` | 封面 |
| GET | `/api/watch/:publishId/video` | 视频流 |

## 活动 / 钱包 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/campaigns/plans` | 创建计划 `{ endYear, totalPointsBudget, interviewId, taskId, questions[] }` |
| GET | `/api/campaigns/plans/mine` | 我的计划（含 `rewardPoolBalance`、`distributedTotal`、`completedTotal`） |
| POST | `/api/wallet/recharge/mock` | mock 充值 |

## 数据表

- `campaign_plans` — `start_year`, `end_year`, `total_points_budget`（每年）, `reward_pool_balance`, `rewarded_total`, `distributed_total`, `completed_total`
- `plan_portion_executions` — 每份执行记录（`scheduled_date`, `status`, `next_attempt_on`）
- `watch_task_assignments` — 日任务分发表（仅当天有效）
- `watch_task_backlog` — 日终未完成槽位，供日初重发
- `scheduler_runs` — 调度去重
- `published_videos`, `published_quiz_questions`, `watch_quiz_sessions`

流水类型：`mock_recharge` | `plan_portion` | `quiz_reward` | `admin_adjust`（旧计划或有 `plan_escrow`）

## 测试

```bash
cd backend
npm run build && npm run test:campaign
npm run build && npm run test:watch
npm run build && npm run test:watch-quiz
npm run build && npm run test:watch-quiz-grade
npm run build && npm run test:watch-dispatch
# 真实 LLM 判分（需 OPENAI_*，且 WATCH_QUIZ_LIVE=1）
npm run build && npm run test:watch-quiz-llm
```
