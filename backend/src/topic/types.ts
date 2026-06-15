/**
 * 选题模块类型：tier1～8 推荐、待选落盘、接口 1/2 题面。
 *
 * - **接口 1**：`TopicPick` / `PendingSelection` — 列表点选，无完整填表题面
 * - **接口 2**：`QuestionSet` — 用户确认话题后给出 `questions[]`，供 [`question/`](../question/) 管道消费
 *
 * 详见 `docs/topic-selection-module.md`。
 */

// ─── 全量已答（选题 / 出题共用）──────────────────────────────

/**
 * 用户已填写的一节问答。
 * 选题 LLM 用来判断哪些子类值得追问；出题 LLM 用来去重、推断备选等。
 */
export type AnsweredSection = {
  /** 节名 = 配置模板子类名（如「基本档案」「小学」），全局唯一 */
  name: string;
  /** 本节已提交的问答列表（按答题顺序） */
  qa: Array<{
    /** 用户当时看到的展示问句（口语化 / refine 后文案） */
    q: string;
    /** 用户提交的答案 */
    a: string;
  }>;
  /** 选题档位（commit 时写入；旧数据可能缺失） */
  tier?: TopicPick["tier"];
  /** 话题来源（commit 时写入；旧数据可能缺失） */
  kind?: TopicPickKind;
};

// ─── Tier1 / Tier2：catalog 模板话题推荐 ─────────────────────

/** 模型对单条 catalog 话题推荐的置信度。 */
export type GatingConfidence = "high" | "medium" | "low";

/** Tier1、Tier2 单条推荐结果（子类名须与 template-config 一致）。 */
export type TopicRecommendation = {
  /** 子类显示名，全局唯一；LLM 必须按此名输出 */
  name: string;
  /** 模型自评置信度 */
  confidence: GatingConfidence;
  /** 推荐理由，≤60 字 */
  reason: string;
};

/** Tier1 / Tier2 选题入参：从配置模板 catalog 中推荐待聊子类。 */
export type RecommendTierParams = {
  /** 用户已 commit 的全量小节（含基本档案等） */
  sections: AnsweredSection[];
};

// ─── Tier3：AI 生成创意主题 ───────────────────────────────────

/** Tier3 候选：非 catalog，用户点选的是「主题」而非配置子类。 */
export type GeneratedTopicPick = {
  /** 生成主题标题（写入接口 1/2 的 `title`） */
  title: string;
  /** 推荐理由，≤60 字 */
  reason: string;
  /** 用户确认该主题后附带的 1～3 条开放问句（写入接口 2 的 `questions`） */
  questions: string[];
};

export type RecommendTier3Params = {
  /** 全量已答小节，供模型判断哪些方向值得生成 */
  sections: AnsweredSection[];
  /** 最多返回条数，默认 6，合法范围 1～6 */
  maxPicks?: number;
};

// ─── Tier4：生活记忆热点 ─────────────────────────────────────

/** Tier4 候选：用户点选的是完整问句 `q`（= 接口 1 的 `TopicPick.title`）。 */
export type HotTopicPick = {
  /** 生活记忆域 ID（配置内稳定标识） */
  domainId: string;
  /** 生活记忆域显示名（如「温暖」「成长」） */
  domainName: string;
  /** 完整热点问句，≤80 字；同时作为 `TopicPick.title` */
  q: string;
  /** 可选快捷回复，0～4 条；可带入接口 2 的 `suggestedAnswers` */
  suggestedAnswers: string[];
};

export type RecommendTier4Params = {
  /** 全量已答小节 */
  sections: AnsweredSection[];
  /** 最多返回条数，默认 6，合法范围 1～6 */
  maxPicks?: number;
};

// ─── 统一选题模型（接口 1 + 接口 2 桥梁）────────────────────

/**
 * 话题来源 / 管道类型。
 *
 * - `catalog`：配置模板子类 → 出题走 dedupe / 口语化 / 批量备选
 * - `generated`：Tier3 生成主题 → 出题一般不走 catalog 批量三步
 * - `hot_topic`：Tier4 热点问句
 * - `material_*`：Tier5～8 素材分析衍生题
 */
export type TopicPickKind =
  | "catalog"
  | "generated"
  | "hot_topic"
  | "material_contradiction"
  | "material_gap"
  | "material_turn"
  | "material_inner";

/**
 * 接口 1：待用户点选的一条话题（**不含**填表题面与备选）。
 *
 * 各 tier 对字段的用法：
 * - Tier1～2 catalog：`title` = 子类名（如「小学」）
 * - Tier3 generated：`title` = 生成主题名
 * - Tier4 hot_topic：`title` = 完整问句（同 `HotTopicPick.q`）
 * - Tier5 contradiction：`title` = 矛盾摘要
 * - Tier7 turn：`title` = 转折短问句；`reason` = 原因摘要
 * - Tier8 inner：`title` = 是/否问句全文
 */
export type TopicPick = {
  /** 所属选题档位 1～8 */
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** 话题来源，决定接口 2 题面形态与出题管道 */
  kind: TopicPickKind;
  /**
   * 列表展示主文案（子类名 / 主题名 / 问句 / 素材摘要等，见类型上方说明）
   */
  title: string;
  /** 辅助说明：推荐理由、矛盾原因、转折原因等，≤60 字 */
  reason: string;
};

// ─── 落盘：待选列表与阶段 ─────────────────────────────────────

/**
 * 单条待选行：`pending.json` 中的一项。
 * 选题 LLM 产出后可预填 `questions` / `suggestedAnswers`，供接口 2 或前端展示。
 */
export type PendingPickRow = {
  /** 接口 1 瘦身条目（点选时只需 `pick`） */
  pick: TopicPick;
  /** 接口 2 题面（catalog 时为模板 field key 列表，口语化在出题 prep；Tier3 等为生成问句） */
  questions?: string[];
  /** 预置点选备选（如 Tier4 热点快捷回复） */
  suggestedAnswers?: string[];
};

/** 当前档待选批次（用户工作区 `选题/pending.json`）。 */
export type PendingSelection = {
  /** 本文件对应的选题档位 */
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** 本批待选写入时间，ISO 8601 */
  createdAt: string;
  /** 待用户点选的条目列表 */
  picks: PendingPickRow[];
};

/**
 * 选题器当前阶段（`选题/current-stage.json`）。
 * 完成 tier8 后循环回 tier1。
 */
export type CurrentStage = {
  /** 当前应执行的选题档位 1～8 */
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** 最近一次阶段变更时间，ISO 8601 */
  updatedAt: string;
};

// ─── 接口 2：确认话题后的题面 ─────────────────────────────────

/**
 * 接口 2：`getTopicQuestions` 等对外的题集。
 *
 * 出题模块 [`question/`](../question/) **只消费本类型**（不读 template-config）：
 * - `title`：本轮主题（catalog 时通常 = 子类名）
 * - `questions`：待处理题列表（catalog 时为 template-config **field key** 表头，非口语问句；见 [`runTemplatePrep`](../question/runTemplatePrep.ts)）
 * - `suggestedAnswers`：可选，Tier4 等可预置快捷回复
 *
 * `tier` / `kind` 供出题侧守卫（如 `kind !== "catalog"` 不适用批量 prep）。
 */
export type QuestionSet = {
  /** 与 `TopicPick.title` 一致；catalog 时通常为子类名 */
  title: string;
  /** 来源档位，与待选轮 `PendingSelection.tier` 一致 */
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** 题面类型，决定出题管道是否适用 catalog 批量三步 */
  kind: TopicPickKind;
  /**
   * 本轮待答题列表。
   * catalog：template-config field key（如 `学校名称（必填）`），与 dedupe/colloquialize 输入对齐；
   * generated / hot_topic / material_*：开放问句或衍生问句（已是展示级文案）
   */
  questions: string[];
  /** 可选预置点选备选（整集级；单题备选由出题 `runTemplatePrep` 等产生） */
  suggestedAnswers?: string[];
};
