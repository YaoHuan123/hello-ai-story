# 选题器模块接口文档

出题（模板去重、口语化、备选、refine、扩展追问）见 **[出题模块规划](question-generation-module.md)**（逐步实现中）。

本文档描述**完整选题器**对外约定：服务层四接口、持久化、数据类型，以及与底层 `topic/` 选题模块的关系。

- **服务层（编排 + 持久化）**：[`backend/src/services/topicSelection.service.ts`](../backend/src/services/topicSelection.service.ts)
- **选题引擎（LLM，无用户状态）**：[`backend/src/topic/`](../backend/src/topic/)，统一入口 `selectTopics`
- **集成测试**：`npm run test:topic:flow`（[`backend/scripts/topic-flow.integration.ts`](../backend/scripts/topic-flow.integration.ts)）

当前**未提供 HTTP 路由**；前端或其它模块直接调用 service 函数。

---

## 1. 阶段（Tier）语义

| Tier | 选题方式 | `TopicPick.kind` | 典型条数 | 用户确认 |
|------|----------|------------------|----------|----------|
| 1 | LLM 从配置模板 catalog **自动**推荐 1 个话题 | `catalog` | 1 | 前端可仅 1 条时自动确认 |
| 2 | LLM 列出 catalog **候选** | `catalog` | 1～6 | 用户点选 |
| 3 | LLM **生成**创意主题（非 catalog） | `generated` | 1～10 | 用户点选；题面写入 pending 行 `questions` |
| 4 | LLM **生活记忆热点**开放问句 | `hot_topic` | 1～6 | 用户点选问句；`title` = 问句全文 |
| 5 | 根据 **`sections`** 做矛盾检测；pending 行写入含节摘录的 `questions` | `material_contradiction` | 0～N | 用户点选 `title`（summary）后开放说明 |
| 6 | 根据 **`sections`** 做缺口审核后列出待补充要点 | `material_gap` | 0～N | 用户点选缺口短句 |
| 7 | 根据 **`sections`** 挖掘转折原因（老项目 tier8 语义） | `material_turn` | 0～N | 用户点选转折短问句 |
| 8 | 根据 **`sections`** 生成内心是/否题（老项目 tier7 语义） | `material_inner` | 0～N | 用户点选是/否问句 |

阶段流转为**循环**：`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 1 → …`（由接口4 推进）。

Tier5～8 使用调用方传入的 **`sections`**。须至少 **5 个有内容的节**；首次会调 LLM 并写入 `选题/tier{N}.json`。Tier5 的涉及节正文在选题时写入 pending 行的 `questions`，不再输出 `contradictionId` / `involvedIds`（见 §11）。

---

## 2. 推荐业务流程

每一档建议按同一顺序处理，**在进入下一档之前**完成本档「确认 + 取题 + 答题落库」：

```
getCurrentStage(userId)           // 可选：展示当前档位
getPendingTopics(userId, sections) // 待确认主题列表
  → 用户确认某一 pick.title
getTopicQuestions(userId, title)   // 本档题目（须在 advance 前）
  → 访谈/表单模块落库答题
advanceStage(userId)               // 进入下一档；下一档 getPendingTopics 会重新选题
```

约定：

- **不会在 advance 之后**再为上一档调用 `getTopicQuestions`；题目由访谈模块持久化，选题器**不**缓存已确认题目。
- **同档重复**打开待选列表时，接口1 复用磁盘上的待选文件，**不重复调 LLM**（见 §4.1）。
- `sections` 不能为空（底层 `TOPIC_MISSING_INPUT`）；测试可用 [`stubSections()`](../backend/test/fixtures/sections.stub.ts)。

---

## 3. 持久化

目录：`{DATA_USERS_ROOT}/{userId}/选题/`

| 文件 | 类型 | 说明 |
|------|------|------|
| `current-stage.json` | `CurrentStage` | 当前 tier；首次访问默认为 tier 1 |
| `tier1.json` … `tier8.json` | `PendingSelection` | 各档**独立**待选；`picks` 为 `PendingPickRow[]`（`pick` + 可选题面） |

`素材/story-entries.json` 仍保留读写工具，**Tier5～8 已不再使用**（仅供测试或后续访谈同步实验）。

写入均为**原子写**（临时文件 + `rename`）。

**不存在** `confirmed-questions.json`：接口2 只读当前 pending，响应 `QuestionSet` 不落盘。

各档 `tier{N}.json` 只在本档 `getPendingTopics` 时写入或复用。`advanceStage` 在 tier 内递进时**保留**其它档文件；**tier8→tier1** 时清空 `tier1.json`…`tier8.json`，新一轮各档会重新选题。若该档尚无文件，下次 `getPendingTopics` 会调用 LLM。

**空列表 `picks: []`（同轮、同档）**：视为该档本轮已定稿——「本档无待选主题」。一旦写入磁盘（含 LLM 无候选、tier5/6 无结果、或门槛类错误被接口1 转成 `[]`），**同档再次调用接口1 不会重试 LLM**，`sections` 参数也会被忽略。调用方通常应 `advanceStage` 进入下一档；仅 **tier8→tier1** 清档后，该档才会在新一轮重新选题。

---

## 4. 服务层对外接口

所有接口第一个参数为 `userId: string`（与 `workspace.service` 用户目录一致）。

### 4.1 接口1 — `getPendingTopics`

```ts
getPendingTopics(userId: string, sections: AnsweredSection[]): Promise<TopicPick[]>
```

**作用**：返回当前阶段待用户确认的**瘦身**主题列表（`TopicPick[]`，不含题面）。

**逻辑**：

1. 读取 `current-stage.json` 得到 `tier`。
2. 读取当前档 `tier{N}.json`（N = 当前 stage）：
   - 若存在且 `pending.tier === tier` → **直接返回** `pending.picks[].pick`（不调 LLM；`sections` 被忽略）。**含 `picks: []`**：同档不会再次选题。
   - 否则调用 `selectTopics`，写入 `PendingPickRow[]` 后返回各行的 `pick`。
3. 若底层抛出 `TOPIC_NO_CANDIDATE` / `MATERIAL_MIN_ENTRIES` / `TOPIC_MISSING_INPUT`（tier5～8 相关）→ 写入 `picks: []` 并返回 `[]`（不向上抛）。该空结果与「有候选但用户未选」一样会固化，**同档不重试**。

**前端提示**：

- Tier1 常只有 1 条，可自动确认。
- Tier4 可能多条，也可按产品规则自动确认单条。
- 返回 `[]` 表示本档无待选，是否 `advanceStage` 由调用方决定（本模块不自动跳档）；不要指望同档再次 `getPendingTopics` 会重新打 LLM。

---

### 4.2 接口2 — `getTopicQuestions`

```ts
getTopicQuestions(userId: string, title: string): QuestionSet
```

**作用**：用户确认某个 `title` 后，获取该主题对应的题目。

**逻辑**：从**当前档** `tier{N}.json` 按 `title` 匹配 `PendingPickRow`，按 `kind` 组装 `QuestionSet`（题面来自 row 或按 kind 现算）。

| `kind` | `questions` | `suggestedAnswers` |
|--------|-------------|-------------------|
| `catalog` | 配置模板 `required` + `optional` 的字段 **key**（[`getTopicFieldKeys`](../backend/src/topic/catalog.ts)） | 无 |
| `generated` | 选题时写入 row 的 `questions` | 无 |
| `hot_topic` | `[title]`（问句本身） | row 的 `suggestedAnswers`（若有） |
| `material_contradiction` | row 的 `questions`（摘要 + 各节【节名】摘录 + 请说明） | row 的 `suggestedAnswers`（消解假设，若有） |
| `material_gap` | `可以补充的细节：${title}` | 无 |
| `material_turn` | `[title]`（转折短问句） | `[pick.reason]`（原因摘要作快捷参考） |
| `material_inner` | `[title]`（完整是/否句） | `["是","否"]` |

**错误**：

- `TOPIC_PICK_NOT_FOUND`：无 pending，或 pending 中无该 `title`。

**须在 `advanceStage` 之前调用**当前档题目；其它档的 `tier{N}.json` 仍保留，但接口2 默认只读**当前 stage** 对应文件。

---

### 4.3 接口3 — `getCurrentStage`

```ts
getCurrentStage(userId: string): CurrentStage
```

**作用**：查询当前处于 tier 1～8。

**逻辑**：读 `current-stage.json`；文件缺失或损坏时初始化为 tier 1 并落盘。

---

### 4.4 接口4 — `advanceStage`

```ts
advanceStage(userId: string): CurrentStage
```

**作用**：进入下一阶段（`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 1` 循环）。

**逻辑**：`next = tier === 8 ? 1 : tier + 1`，写入 `current-stage.json`，返回新 `CurrentStage`。

- tier2～8 递进：保留已有 `tier{N}.json`（便于回到上一档查接口2 题面，须在 advance 前取题）。
- **tier8→tier1**：删除 `tier1.json`…`tier8.json`，开始新一轮；各档下次 `getPendingTopics` 会重新选题。

---

## 5. 辅助导出（服务层）

| 函数 | 说明 |
|------|------|
| `readPendingSelection(userId, tier?)` | 读 `tier{N}.json`；省略 `tier` 时用当前 stage |
| `readCurrentStage(userId)` | 读/初始化 stage |
| `writeCurrentStage(userId, tier)` | 写 stage（测试或管理用） |
| `selectAndPersist(userId, { tier, sections })` | 强制按指定 tier 选题并覆盖 pending（一般通过接口1 间接调用） |

---

## 6. 核心数据类型

定义见 [`backend/src/topic/types.ts`](../backend/src/topic/types.ts)。

### `AnsweredSection`

```ts
{
  name: string;           // 与模板子类名一致，如「基本档案」
  qa: Array<{ q: string; a: string }>;
}
```

### `TopicPick`（接口1 列表项，瘦身）

```ts
{
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  kind: "catalog" | "generated" | "hot_topic" | "material_contradiction" | "material_gap" | "material_turn" | "material_inner";
  title: string;
  reason: string;
}
```

### `PendingPickRow`（`tier{N}.json` 中单条）

```ts
{
  pick: TopicPick;
  questions?: string[];           // tier3 / tier5 等接口2 需要时写入
  suggestedAnswers?: string[];    // tier4 / tier5 等
}
```

读盘兼容旧格式：扁平 `TopicPick` 带可选 `questions`/`suggestedAnswers` 会规范为 `PendingPickRow`。

### `PendingSelection`（磁盘）

```ts
{
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  createdAt: string;      // ISO
  picks: PendingPickRow[];
}
```

### `CurrentStage`（磁盘）

```ts
{ tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; updatedAt: string }
```

### `QuestionSet`（接口2 响应，仅内存）

```ts
{
  title: string;
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  kind: TopicPickKind;
  questions: string[];
  suggestedAnswers?: string[];
}
```

---

## 7. 底层选题模块（可选直接调用）

包入口：[`backend/src/topic/index.ts`](../backend/src/topic/index.ts)

| 导出 | 用途 |
|------|------|
| `selectTopics(params)` | 按 tier 统一选题，返回 `PendingPickRow[]` |
| `recommendTier1` … `recommendTier8` | 各档原始 LLM 封装 |
| `loadTopics` / `getTopicFieldKeys` | 读配置模板 |
| `test/fixtures/` | 测试桩数据（`stubSections`、`luxunSections` 等，不随 `src` 发布） |

`selectTopics` **不读写用户目录**；需要持久化时请用服务层。

环境变量（严格）：`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`。

---

## 8. 错误码摘要

| 消息前缀 | 场景 |
|----------|------|
| `TOPIC_MISSING_INPUT` | `sections` 为空 |
| `TOPIC_NO_CANDIDATE` | 排除后无 catalog 候选（接口1 写入 `picks: []` 并返回，同档不重试） |
| `TOPIC_LLM_INVALID` | 模型输出无法解析 |
| `TOPIC_PICK_NOT_FOUND` | 接口2 无待选轮或无对应 `title` |
| `MATERIAL_MIN_ENTRIES` | tier5～8：`sections` 有内容节不足 5（接口1 写入 `picks: []` 并返回，同档不重试） |
| `CATALOG_TOPIC_NOT_FOUND` | catalog 出题时模板无该话题名 |

---

## 9. 测试

```bash
cd backend
npm run test:topic:flow    # 服务层四接口 + 持久化 + 三种 kind 出题
npm run test:topic:luxun   # 鲁迅生平 sections，tier1→4 一轮真实 LLM（需 OPENAI_API_KEY）
npm run test:topic:luxun:trace  # 鲁迅 tier1→8 全档；接口1/2 与 tier1.json…tier8.json 落盘到 backend/data/trace/luxun-{时间戳}/（需 OPENAI_API_KEY）
npm run test:topic:tier5   # 鲁迅 sections，tier5 矛盾检测（需 OPENAI_API_KEY）
npm run test:topic:tier6   # 鲁迅 sections，tier6 缺口审核（需 OPENAI_API_KEY）
npm run test:topic:tier7   # 鲁迅 sections，tier7 转折（需 OPENAI_API_KEY）
npm run test:topic:tier8   # 鲁迅 sections，tier8 内心是/否（需 OPENAI_API_KEY）
npm run test:topic:select  # 仅底层 selectTopics（需 LLM）
```

鲁迅测试数据见 [`backend/test/fixtures/sections.luxun.ts`](../backend/test/fixtures/sections.luxun.ts)（史料来源见文件头注释）。集成测试脚本在 [`backend/test/integration/topic/`](../backend/test/integration/topic/)。

**`test:topic:luxun:trace` 落盘结构**（目录在 `backend/data/trace/`，已被 `.gitignore` 忽略）：

- `input-sections.json`、`meta.json`
- `tier01/` … `tier08/`：各含 `api1-getPendingTopics.json`、`api2-getTopicQuestions.json`（无候选时 api2 为 `{ skipped: true }`）
- `persistence/tier1.json` … `tier8.json`、`current-stage.json`（从测试用户 `选题/` 目录复制）

`test:topic:flow` 在无 `OPENAI_API_KEY` 时跳过接口1 的 LLM 段，其余用本地 pending 桩数据验证。

---

## 10. 当前未实现 / 后续扩展

- HTTP API 路由
- catalog 字段 key 的 LLM 自然化问句（现为模板 key 直出）
- 接口1 **强制刷新** pending（同 tier 重新选题）
- 真实 `sections` 数据源（由访谈模块注入，替代 `stubSections`）
- `sections` 持久化；`tier1.json` … `tier8.json` 随 sections 变更的失效策略（输入 hash）

---

## 11. Tier5 矛盾确认（摘录入题）

已采用：**不再**对外暴露 `contradictionId`、`involvedIds`。

| 字段 | 含义 |
|------|------|
| `title` | LLM `summary`，待选列表主文案；接口2 按 `title` 定位 pick |
| `questions`（pending 行） | 选题时生成的一道完整开放题：矛盾说明 + 各涉及节 `【节名】` 正文摘录 + 「请简要说明…」 |
| `reason`（`pick`） | 简短说明，如「涉及 N 个已填节，待您说明」 |
| `suggestedAnswers`（pending 行） | 可选，LLM `reconciliationHypotheses`（消解假设快捷回复） |

LLM 解析层仍使用 `involvedIds`（节名），仅用于 [`buildContradictionQuestion`](../backend/src/topic/contradictionQuestion.ts)，不写入 `tier5.json` 的 pick。

**代码位置**：[`recommendTier5.ts`](../backend/src/topic/recommendTier5.ts)、[`contradictionQuestion.ts`](../backend/src/topic/contradictionQuestion.ts)。

---

## 12. Tier6 缺口补充

已采用：**不对外暴露** `gapIndex`（及 `prep_gap_*`）。

| 字段 | 含义 |
|------|------|
| `title` | LLM `missingPoints` 一项（缺口短句）；待选列表与接口2 均按 `title` 定位 |
| `reason` | 简短说明，如「素材缺口，建议补充关键时间或地点等信息」 |

接口2 出题：`可以补充的细节：${title}`。

### 后续可选（未做）

- 稳定 id、已答过滤、确认后落库。

**代码位置**：[`recommendTier6.ts`](../backend/src/topic/recommendTier6.ts)、[`parseGap.ts`](../backend/src/topic/parseGap.ts)。

---

## 13. Tier7 / Tier8（转折与内心）

档位与老项目对调：**tier7** = 转折（`material_turn`），**tier8** = 内心是/否（`material_inner`）。

已采用：**不对外暴露** `turnOrder`、`presentScore`、`segmentIndex`（及 `prep_turn_*` / `prep_inner_*`）。

| tier | `title` | `reason` | 接口2 |
|------|---------|----------|--------|
| 7 | LLM 转折短问句 `question` | 原因摘要 `reason` | `questions: [title]`，`suggestedAnswers: [reason]` |
| 8 | 完整是/否问句 `question` | 固定说明文案 | `questions: [title]`，`suggestedAnswers: ["是","否"]` |

列表与取题均按 **`pick.title`** 定位。`presentScore` 等仅在 [`parseTurn.ts`](../backend/src/topic/parseTurn.ts) / [`parseInner.ts`](../backend/src/topic/parseInner.ts) 解析 LLM 时使用，不写入 `tier7.json` / `tier8.json`。

### 后续可选（未做）

- 按 `presentScore` 截断条数、稳定 id、已答过滤、确认后落库。

**代码位置**：[`recommendTier7.ts`](../backend/src/topic/recommendTier7.ts)、[`recommendTier8.ts`](../backend/src/topic/recommendTier8.ts)。
