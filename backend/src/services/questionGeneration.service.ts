/**
 * 出题服务层（步骤 9）：薄封装 [`question/`](../question/)，供路由与编排调用。
 *
 * 本期无用户目录持久化（对比 `topicSelection.service`）；`sections` 与 `QuestionSet` 由调用方传入。
 */
export {
  runTemplatePrep,
  refineAndSuggestCurrent,
  extendSubCategoryQuestions,
  dedupeQuestions,
  colloquializeQuestions,
  suggestBatchAnswers,
  mergeSuggestedAnswersForDisplay,
  isTemplatePrepNotApplicable,
  isTemplatePrepSkipped,
  isCatalogPrepNotApplicable,
  isCatalogPrepSkipped,
  isRefineNotApplicable,
  isRefineSkipped,
  isExtendNotApplicable,
  isExtendSkipped,
} from "../question/index";

export type {
  AnsweredSection,
  QuestionSet,
  AnsweredInTopicItem,
  TemplatePrepParams,
  TemplatePrepResult,
  RefineAndSuggestCurrentParams,
  RefineAndSuggestCurrentResult,
  ExtendSubCategoryParams,
  ExtendSubCategoryResult,
  ExtendQuestionItem,
} from "../question/index";
