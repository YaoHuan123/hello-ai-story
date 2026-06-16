import { chatJson } from "../topic/llm";
import { loadSuggestBatchPrompt } from "./loadPrompt";
import { systemWithOutputLocale, withOutputLocale } from "../content/interviewOutputLocale";
import { narratorProfileFromSections } from "./narratorProfile";
import { parseSuggestBatch } from "./parseSuggestBatch";
import type {
  SuggestBatchItem,
  SuggestBatchQuestionsParams,
  SuggestBatchQuestionsResult,
} from "./types";
import { isSuggestBatchNotApplicable, isSuggestBatchSkipped } from "./types";

function toResult(items: SuggestBatchItem[]): SuggestBatchQuestionsResult {
  const answerSuggestions: Record<string, string[]> = {};
  for (const item of items) {
    answerSuggestions[item.question] = item.suggestedAnswers;
  }
  return { suggestions: items, answerSuggestions };
}

/**
 * 步骤 3：对口语化后的题批量推测备选（LLM）。
 *
 * @throws SUGGEST_BATCH_* | SUGGEST_BATCH_NOT_APPLICABLE | SUGGEST_BATCH_SKIPPED
 */
export async function suggestBatchAnswers(
  params: SuggestBatchQuestionsParams,
): Promise<SuggestBatchQuestionsResult> {
  const { questionSet } = params;
  if (isSuggestBatchNotApplicable(questionSet)) {
    throw new Error(`SUGGEST_BATCH_NOT_APPLICABLE: kind=${questionSet.kind} 不适用批量备选`);
  }
  if (isSuggestBatchSkipped(questionSet)) {
    throw new Error(`SUGGEST_BATCH_SKIPPED: 主题「${questionSet.title}」跳过批量备选`);
  }
  if (!params.sections?.length) {
    throw new Error("SUGGEST_BATCH_MISSING_INPUT: sections 为空");
  }

  const questions = params.askQuestions.map((q) => q.trim()).filter(Boolean);
  if (questions.length === 0) {
    return { suggestions: [], answerSuggestions: {} };
  }

  const allowed = new Set(questionSet.questions.map((q) => q.trim()).filter(Boolean));
  for (const q of questions) {
    if (!allowed.has(q)) {
      throw new Error(`SUGGEST_BATCH_MISSING_INPUT: askQuestions 含非法项 "${q}"`);
    }
    if (!String(params.questionTexts[q] ?? "").trim()) {
      throw new Error(`SUGGEST_BATCH_MISSING_INPUT: questionTexts 缺少「${q}」`);
    }
  }

  const narratorProfile = narratorProfileFromSections(params.sections);
  const promptInput = withOutputLocale({
    narratorProfile,
    currentDate: new Date().toISOString().slice(0, 10),
    title: questionSet.title,
    sections: params.sections,
    questions: questions.map((question) => ({
      question,
      questionText: params.questionTexts[question]!.trim(),
    })),
  });

  const { system, userTemplate } = loadSuggestBatchPrompt();
  const userContent = userTemplate.replace("{{INPUT_JSON}}", JSON.stringify(promptInput, null, 2));

  const parsed = await chatJson<unknown>([
    { role: "system", content: systemWithOutputLocale(system) },
    { role: "user", content: userContent },
  ]);

  const items = parseSuggestBatch(parsed, questions);
  return toResult(items);
}
