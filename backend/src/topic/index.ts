/**
 * 话题选题模块对外入口。
 *
 * 推荐用统一入口 {@link selectTopics}，各档输出 {@link PendingPickRow}（服务层落盘并对外返回瘦身 {@link TopicPick}）：
 * - tier 1～8：由服务层写入 `选题/pending.json`
 *
 * 也可直接调用底层 recommendTier1～8。
 */
export { selectTopics } from "./selectTopics";
export type { SelectTopicsParams } from "./selectTopics";
export { recommendTier1 } from "./recommendTier1";
export { recommendTier2 } from "./recommendTier2";
export { recommendTier3 } from "./recommendTier3";
export { recommendTier4 } from "./recommendTier4";
export { recommendTier5 } from "./recommendTier5";
export { recommendTier6 } from "./recommendTier6";
export { recommendTier7 } from "./recommendTier7";
export { recommendTier8 } from "./recommendTier8";
export type { RecommendTier5Params } from "./recommendTier5";
export type { RecommendTier6Params } from "./recommendTier6";
export type { RecommendTier7Params } from "./recommendTier7";
export type { RecommendTier8Params } from "./recommendTier8";
export { hotTopicMapForPrompt } from "./hotTopicMap";
export type {
  AnsweredSection,
  TopicRecommendation,
  GeneratedTopicPick,
  HotTopicPick,
  TopicPick,
  TopicPickKind,
  PendingPickRow,
  PendingSelection,
  CurrentStage,
  QuestionSet,
  GatingConfidence,
  RecommendTierParams,
  RecommendTier3Params,
  RecommendTier4Params,
} from "./types";
export type { RecommendTier2Params } from "./recommendTier2";
export { loadTopics, getTopicFieldKeys } from "./catalog";
export type { Topic } from "./catalog";
export {
  MIN_TIER5_SECTIONS,
  sectionsToPolishedEventSummaries,
  sectionsWithAnswers,
} from "./sectionsInput";
export { readPending, pendingPath, writePending, deletePending } from "./tierPending";
export type { TierFileTier } from "./tierPending";
