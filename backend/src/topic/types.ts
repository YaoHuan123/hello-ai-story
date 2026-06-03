/** 用户已填写的一节问答（用于让 LLM 判断哪些话题值得追问）。 */
export type AnsweredSection = {
  /** 该节话题名（如「基本档案」「小学」），与配置模板子类名一致 */
  name: string;
  /** 已回答的问答对，问句用完整中文 */
  qa: Array<{ q: string; a: string }>;
};

/** 模型对某条话题推荐的置信度。 */
export type GatingConfidence = "high" | "medium" | "low";

/** 单条选题结果：已与配置模板对齐。 */
export type TopicRecommendation = {
  /** 话题名（全局唯一，LLM 按此名作答） */
  name: string;
  confidence: GatingConfidence;
  /** 推荐理由（≤60 字，来自模型） */
  reason: string;
};

/** Tier1 / Tier2 共用的选题入参（配置模板 catalog 话题）。 */
export type RecommendTierParams = {
  sections: AnsweredSection[];
};

/** Tier3：AI 生成的创意主题（非配置模板 catalog）。 */
export type GeneratedTopicPick = {
  /** 主题名（简短，供用户点选） */
  title: string;
  /** 推荐理由（1～2 句） */
  reason: string;
  /** 用户选中后附带的开放问句，1～3 条完整中文 */
  questions: string[];
};

/** Tier3 选题入参：仅依赖已填 sections，不读配置模板候选。 */
export type RecommendTier3Params = {
  sections: AnsweredSection[];
  /** 最多返回条数，默认 10，范围 1～10 */
  maxPicks?: number;
};

/** Tier4：生活记忆热点问句（用户点选的是问句本身）。 */
export type HotTopicPick = {
  domainId: string;
  domainName: string;
  /** 完整开放问句（列表主文案，与统一层 {@link TopicPick.title} 一致） */
  q: string;
  /** 可选快捷回复，0～4 条 */
  suggestedAnswers: string[];
};

/** Tier4 选题入参。 */
export type RecommendTier4Params = {
  sections: AnsweredSection[];
  /** 最多返回条数，默认 6，范围 1～6 */
  maxPicks?: number;
};

/** 话题来源。 */
export type TopicPickKind =
  | "catalog"
  | "generated"
  | "hot_topic"
  | "material_contradiction"
  | "material_gap"
  | "material_turn"
  | "material_inner";

/**
 * 接口1 列表 / 点选：不含题面与备选答案。
 *
 * - `material_contradiction`（Tier5）：`title` = summary
 * - `material_turn`（Tier7）：`title` = 转折短问句；`reason` = 原因摘要
 * - `material_inner`（Tier8）：`title` = 是/否问句全文
 */
export type TopicPick = {
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  kind: TopicPickKind;
  title: string;
  reason: string;
};

/** `tier{N}.json` 中单条待选：选题元信息 + 接口2 题面（可扩展）。 */
export type PendingPickRow = {
  pick: TopicPick;
  questions?: string[];
  suggestedAnswers?: string[];
};

export type PendingSelection = {
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  createdAt: string;
  picks: PendingPickRow[];
};

/** 选题器当前所处阶段（tier1～8，8 之后回到 1）。 */
export type CurrentStage = {
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  updatedAt: string;
};

export type QuestionSet = {
  title: string;
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  kind: TopicPickKind;
  questions: string[];
  suggestedAnswers?: string[];
};
