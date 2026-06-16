import { getTopicFieldMeta } from "../topic/catalog";
import { chatJson, type ChatMessage } from "../topic/llm";
import { loadSuggestCurrentPrompt } from "./loadPrompt";
import { systemWithOutputLocale, withOutputLocale } from "../content/interviewOutputLocale";
import { narratorProfileFromSections } from "./narratorProfile";
import {
  hasNonEmptySuggestCandidates,
  parseSuggestCurrent,
  SUGGEST_CURRENT_VALUE_MAX_LEN,
} from "./parseSuggestCurrent";
import type {
  SuggestCurrentQuestionParams,
  SuggestCurrentQuestionResult,
} from "./types";
import { isSuggestCurrentNotApplicable, isSuggestCurrentSkipped } from "./types";

/**
 * 本主题尚无已答时不必调 LLM（无依据可推断，与老项目一致）。
 */
export function shouldSuggestCurrentQuestion(
  answeredInTopic: SuggestCurrentQuestionParams["answeredInTopic"],
): boolean {
  return answeredInTopic.some((row) => String(row.answer ?? "").trim().length > 0);
}

/**
 * 步骤 6：为当前题推测逐题备选（LLM）。
 *
 * @throws SUGGEST_CURRENT_* | SUGGEST_CURRENT_NOT_APPLICABLE | SUGGEST_CURRENT_SKIPPED
 */
export async function suggestCurrentAnswers(
  params: SuggestCurrentQuestionParams,
): Promise<SuggestCurrentQuestionResult> {
  const { questionSet } = params;

  if (isSuggestCurrentNotApplicable(questionSet)) {
    throw new Error(`SUGGEST_CURRENT_NOT_APPLICABLE: kind=${questionSet.kind} 不适用逐题备选`);
  }
  if (isSuggestCurrentSkipped(questionSet)) {
    throw new Error(`SUGGEST_CURRENT_SKIPPED: 主题「${questionSet.title}」跳过逐题备选`);
  }
  if (!params.sections?.length) {
    throw new Error("SUGGEST_CURRENT_MISSING_INPUT: sections 为空");
  }

  const currentQuestion = params.currentQuestion.trim();
  const questionText = params.questionText.trim();
  if (!currentQuestion) {
    throw new Error("SUGGEST_CURRENT_MISSING_INPUT: currentQuestion 为空");
  }
  if (!questionText) {
    throw new Error("SUGGEST_CURRENT_MISSING_INPUT: questionText 为空");
  }

  const allowed = new Set(questionSet.questions.map((q) => q.trim()).filter(Boolean));
  if (!allowed.has(currentQuestion)) {
    throw new Error("SUGGEST_CURRENT_MISSING_INPUT: currentQuestion 不在 questionSet.questions 中");
  }

  for (const row of params.answeredInTopic) {
    if (row.question === currentQuestion) {
      throw new Error("SUGGEST_CURRENT_MISSING_INPUT: answeredInTopic 不得包含 currentQuestion");
    }
    if (!allowed.has(row.question.trim())) {
      throw new Error(`SUGGEST_CURRENT_MISSING_INPUT: answeredInTopic 含非法 question="${row.question}"`);
    }
  }

  if (!shouldSuggestCurrentQuestion(params.answeredInTopic)) {
    return { suggestedAnswers: [] };
  }

  const fieldMeta = getTopicFieldMeta(questionSet.title, currentQuestion);

  const promptInput = withOutputLocale({
    title: questionSet.title,
    narratorProfile: narratorProfileFromSections(params.sections),
    currentQuestion: {
      question: currentQuestion,
      questionText,
      fieldType: fieldMeta?.fieldType ?? "text",
    },
    answeredInTopic: params.answeredInTopic.map((row) => ({
      question: row.question.trim(),
      questionText: String(row.questionText ?? "").trim() || row.question.trim(),
      answer: String(row.answer ?? "").trim(),
    })),
    sections: params.sections,
  });

  const { system, userTemplate } = loadSuggestCurrentPrompt();
  const userContent = userTemplate.replace("{{INPUT_JSON}}", JSON.stringify(promptInput, null, 2));

  const messages: ChatMessage[] = [
    { role: "system", content: systemWithOutputLocale(system) },
    { role: "user", content: userContent },
  ];

  let parsed = await chatJson<unknown>(messages);
  let suggestedAnswers = parseSuggestCurrent(parsed);
  if (suggestedAnswers.length === 0 && hasNonEmptySuggestCandidates(parsed)) {
    parsed = await chatJson<unknown>([
      ...messages,
      {
        role: "user",
        content:
          `Your previous suggestedAnswers were too long. Regenerate JSON only. ` +
          `Each string must be ≤ ${SUGGEST_CURRENT_VALUE_MAX_LEN} characters; omit options that cannot fit.`,
      },
    ]);
    suggestedAnswers = parseSuggestCurrent(parsed);
  }

  return { suggestedAnswers };
}
