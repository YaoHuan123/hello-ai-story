import { getDisplayLocale } from "../content/displayLocale";
import { toDisplayCatalogFieldText } from "../content/translate/display";
import { getCatalogFieldDisplayText, isBasicProfileTopicName } from "../topic/catalog";
import { colloquializeQuestions } from "./colloquialize";
import { dedupeQuestions } from "./dedupe";
import { suggestBatchAnswers } from "./suggestBatch";
import type { TemplatePrepParams, TemplatePrepResult } from "./types";
import { isCatalogPrepNotApplicable, isCatalogPrepSkipped } from "./types";
import { traceQuestionStep, runWithLlmTraceLabel } from "./questionTrace";

function passthroughQuestionTexts(questions: string[], title: string): Record<string, string> {
  const locale = getDisplayLocale();
  const questionTexts: Record<string, string> = {};
  for (const q of questions) {
    if (isBasicProfileTopicName(title)) {
      questionTexts[q] = toDisplayCatalogFieldText(title, q, locale);
    } else {
      questionTexts[q] = getCatalogFieldDisplayText(title, q);
    }
  }
  return questionTexts;
}

/**
 * 步骤 4：开答前批量编排 = 去重 → 口语化 → 批量备选。
 *
 * 基本档案 / gen_* / 非 catalog 不走 LLM，返回 `skipped: true` 与模板原文案。
 *
 * @throws TEMPLATE_PREP_NOT_APPLICABLE | TEMPLATE_PREP_MISSING_INPUT
 */
export async function runTemplatePrep(params: TemplatePrepParams): Promise<TemplatePrepResult> {
  const { questionSet, sections } = params;

  if (isCatalogPrepNotApplicable(questionSet)) {
    throw new Error(`TEMPLATE_PREP_NOT_APPLICABLE: kind=${questionSet.kind} 不适用批量编排`);
  }

  const allQuestions = questionSet.questions.map((q) => q.trim()).filter(Boolean);

  if (isCatalogPrepSkipped(questionSet)) {
    return {
      skipped: true,
      askQuestions: allQuestions,
      skippedQuestions: [],
      questionTexts: passthroughQuestionTexts(allQuestions, questionSet.title),
      answerSuggestions: {},
    };
  }

  if (!sections?.length) {
    throw new Error("TEMPLATE_PREP_MISSING_INPUT: sections 为空");
  }

  const dedupe = await traceQuestionStep("prep.dedupe", () =>
    runWithLlmTraceLabel("prep.dedupe", () => dedupeQuestions({ sections, questionSet })),
  );
  const { askQuestions, skippedQuestions } = dedupe;

  if (askQuestions.length === 0) {
    return {
      skipped: false,
      askQuestions: [],
      skippedQuestions,
      questionTexts: {},
      answerSuggestions: {},
    };
  }

  const colloquialize = await traceQuestionStep("prep.colloquialize", () =>
    runWithLlmTraceLabel("prep.colloquialize", () =>
      colloquializeQuestions({ sections, questionSet, askQuestions }),
    ),
  );

  const suggest = await traceQuestionStep("prep.suggestBatch", () =>
    runWithLlmTraceLabel("prep.suggestBatch", () =>
      suggestBatchAnswers({
        sections,
        questionSet,
        askQuestions,
        questionTexts: colloquialize.questionTexts,
      }),
    ),
  );

  return {
    skipped: false,
    askQuestions,
    skippedQuestions,
    questionTexts: colloquialize.questionTexts,
    answerSuggestions: suggest.answerSuggestions,
  };
}
