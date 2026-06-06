/**
 * 出题模块：只消费选题器接口 2 的 `QuestionSet`，不读 template-config。
 *
 * 逐步实现见 `docs/question-generation-module.md` §8。
 */
export {
  QUESTION_PROMPT_FILES,
  loadQuestionPrompt,
  loadDedupePrompt,
  loadColloquializePrompt,
  loadSuggestBatchPrompt,
  loadRefinePrompt,
  loadSuggestCurrentPrompt,
  loadExtendPrompt,
} from "./loadPrompt";
export type { QuestionPromptId } from "./loadPrompt";

export { dedupeQuestions } from "./dedupe";
export { parseDedupe } from "./parseDedupe";
export { colloquializeQuestions } from "./colloquialize";
export { parseColloquialize } from "./parseColloquialize";
export { suggestBatchAnswers } from "./suggestBatch";
export { parseSuggestBatch, MAX_SUGGESTIONS_PER_QUESTION, SUGGESTION_MAX_LEN } from "./parseSuggestBatch";
export { narratorProfileFromSections } from "./narratorProfile";
export { runTemplatePrep } from "./runTemplatePrep";
export { refineCurrentQuestion, shouldRefineCurrentQuestion } from "./refineCurrent";
export { parseRefine } from "./parseRefine";
export { suggestCurrentAnswers, shouldSuggestCurrentQuestion } from "./suggestCurrent";
export {
  parseSuggestCurrent,
  MAX_SUGGEST_CURRENT,
} from "./parseSuggestCurrent";
export { refineAndSuggestCurrent } from "./refineAndSuggestCurrent";
export { mergeSuggestedAnswersForDisplay, MAX_DISPLAY_SUGGESTIONS } from "./mergeSuggestedAnswers";
export { extendSubCategoryQuestions } from "./extend";
export { INTERVIEW_SKIP_LABEL, isQuestionSkippable } from "./skip";
export { parseExtend, MAX_EXTEND_QUESTIONS, EXTEND_QUESTION_MAX_LEN } from "./parseExtend";

export type {
  AnsweredSection,
  QuestionSet,
  DedupeDecision,
  DedupeQuestionsParams,
  DedupeQuestionsResult,
  ColloquializeItem,
  ColloquializeQuestionsParams,
  ColloquializeQuestionsResult,
  SuggestBatchItem,
  SuggestBatchQuestionsParams,
  SuggestBatchQuestionsResult,
  TemplatePrepParams,
  TemplatePrepResult,
  AnsweredInTopicItem,
  RefineCurrentQuestionParams,
  RefineCurrentQuestionResult,
  SuggestCurrentQuestionParams,
  SuggestCurrentQuestionResult,
  RefineAndSuggestCurrentParams,
  RefineAndSuggestCurrentResult,
  ExtendQuestionItem,
  ExtendSubCategoryParams,
  ExtendSubCategoryResult,
} from "./types";
export {
  isDedupeNotApplicable,
  isDedupeSkipped,
  isColloquializeNotApplicable,
  isColloquializeSkipped,
  isSuggestBatchNotApplicable,
  isSuggestBatchSkipped,
  isTemplatePrepSkipped,
  isTemplatePrepNotApplicable,
  isCatalogPrepSkipped,
  isCatalogPrepNotApplicable,
  isRefineNotApplicable,
  isRefineSkipped,
  isSuggestCurrentNotApplicable,
  isSuggestCurrentSkipped,
  isExtendNotApplicable,
  isExtendSkipped,
} from "./types";
