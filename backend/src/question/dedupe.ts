import { chatJson } from "../topic/llm";
import { loadDedupePrompt } from "./loadPrompt";
import { parseDedupe } from "./parseDedupe";
import { personCentricPromptFields, filterPersonCentricDedupeDecisions } from "./personCentricPrompt";
import type { DedupeDecision, DedupeQuestionsParams, DedupeQuestionsResult } from "./types";
import { isDedupeNotApplicable, isDedupeSkipped } from "./types";

function toResult(decisions: DedupeDecision[]): DedupeQuestionsResult {
  const skippedQuestions: string[] = [];
  const askQuestions: string[] = [];
  for (const d of decisions) {
    if (d.skip) skippedQuestions.push(d.question);
    else askQuestions.push(d.question);
  }
  return { decisions, skippedQuestions, askQuestions };
}

/**
 * 步骤 1：对 `questionSet.questions` 做覆盖去重（LLM）。
 *
 * @throws DEDUPE_INVALID | DEDUPE_MISSING_INPUT | DEDUPE_NOT_APPLICABLE | DEDUPE_SKIPPED
 */
export async function dedupeQuestions(params: DedupeQuestionsParams): Promise<DedupeQuestionsResult> {
  const { questionSet } = params;
  if (isDedupeNotApplicable(questionSet)) {
    throw new Error(`DEDUPE_NOT_APPLICABLE: kind=${questionSet.kind} 不适用去重`);
  }
  if (isDedupeSkipped(questionSet)) {
    throw new Error(`DEDUPE_SKIPPED: 主题「${questionSet.title}」跳过去重`);
  }
  if (!params.sections?.length) {
    throw new Error("DEDUPE_MISSING_INPUT: sections 为空");
  }

  const questions = questionSet.questions.map((q) => q.trim()).filter(Boolean);
  if (questions.length === 0) {
    throw new Error("DEDUPE_MISSING_INPUT: questionSet.questions 为空");
  }

  const promptInput = {
    title: questionSet.title,
    sections: params.sections,
    questions,
    ...personCentricPromptFields(questionSet.title),
  };

  const { system, userTemplate } = loadDedupePrompt();
  const userContent = userTemplate.replace("{{INPUT_JSON}}", JSON.stringify(promptInput, null, 2));

  const parsed = await chatJson<unknown>([
    { role: "system", content: system },
    { role: "user", content: userContent },
  ]);

  const decisions = filterPersonCentricDedupeDecisions(
    questionSet.title,
    params.sections,
    parseDedupe(parsed, questions),
  );
  return toResult(decisions);
}
