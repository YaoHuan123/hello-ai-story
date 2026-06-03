import { mergeSuggestedAnswersForDisplay } from "./mergeSuggestedAnswers";
import { refineCurrentQuestion } from "./refineCurrent";
import { suggestCurrentAnswers } from "./suggestCurrent";
import type {
  RefineAndSuggestCurrentParams,
  RefineAndSuggestCurrentResult,
} from "./types";
import { isRefineNotApplicable, isRefineSkipped } from "./types";

/**
 * 步骤 7：逐题 refine + 逐题备选，并合并展示用 chip 列表。
 *
 * @throws 同步骤 5/6（REFINE_* / SUGGEST_CURRENT_*）
 */
export async function refineAndSuggestCurrent(
  params: RefineAndSuggestCurrentParams,
): Promise<RefineAndSuggestCurrentResult> {
  const { questionSet } = params;
  if (isRefineNotApplicable(questionSet)) {
    throw new Error(`REFINE_NOT_APPLICABLE: kind=${questionSet.kind} 不适用逐题 refine+备选`);
  }
  if (isRefineSkipped(questionSet)) {
    throw new Error(`REFINE_SKIPPED: 主题「${questionSet.title}」跳过逐题 refine+备选`);
  }

  const refine = await refineCurrentQuestion({
    sections: params.sections,
    questionSet,
    currentQuestion: params.currentQuestion,
    batchQuestionText: params.batchQuestionText,
    answeredInTopic: params.answeredInTopic,
  });

  const suggest = await suggestCurrentAnswers({
    sections: params.sections,
    questionSet,
    currentQuestion: params.currentQuestion,
    questionText: refine.questionText,
    answeredInTopic: params.answeredInTopic,
  });

  const batchSuggested = (params.batchSuggestedAnswers ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean);

  return {
    questionText: refine.questionText,
    refineReason: refine.reason,
    suggestedAnswers: mergeSuggestedAnswersForDisplay(suggest.suggestedAnswers, batchSuggested),
  };
}
