import { chatJson } from "../topic/llm";
import { loadColloquializePrompt } from "./loadPrompt";
import { systemWithOutputLocale, withOutputLocale } from "../content/interviewOutputLocale";
import { parseColloquialize } from "./parseColloquialize";
import { personCentricPromptFields } from "./personCentricPrompt";
import type {
  ColloquializeItem,
  ColloquializeQuestionsParams,
  ColloquializeQuestionsResult,
} from "./types";
import { isColloquializeNotApplicable, isColloquializeSkipped } from "./types";

function toResult(items: ColloquializeItem[]): ColloquializeQuestionsResult {
  const questionTexts: Record<string, string> = {};
  for (const item of items) {
    questionTexts[item.question] = item.questionText;
  }
  return { questions: items, questionTexts };
}

/**
 * 步骤 2：对去重后仍要问的题做批量口语化（LLM）。
 *
 * @throws COLLOQUIALIZE_INVALID | COLLOQUIALIZE_MISSING_INPUT | COLLOQUIALIZE_NOT_APPLICABLE | COLLOQUIALIZE_SKIPPED
 */
export async function colloquializeQuestions(
  params: ColloquializeQuestionsParams,
): Promise<ColloquializeQuestionsResult> {
  const { questionSet } = params;
  if (isColloquializeNotApplicable(questionSet)) {
    throw new Error(`COLLOQUIALIZE_NOT_APPLICABLE: kind=${questionSet.kind} 不适用口语化`);
  }
  if (isColloquializeSkipped(questionSet)) {
    throw new Error(`COLLOQUIALIZE_SKIPPED: 主题「${questionSet.title}」跳过口语化`);
  }
  if (!params.sections?.length) {
    throw new Error("COLLOQUIALIZE_MISSING_INPUT: sections 为空");
  }

  const questions = params.askQuestions.map((q) => q.trim()).filter(Boolean);
  if (questions.length === 0) {
    return { questions: [], questionTexts: {} };
  }

  const allowed = new Set(questionSet.questions.map((q) => q.trim()).filter(Boolean));
  for (const q of questions) {
    if (!allowed.has(q)) {
      throw new Error(`COLLOQUIALIZE_MISSING_INPUT: askQuestions 含非法项 "${q}"`);
    }
  }

  const promptInput = withOutputLocale({
    title: questionSet.title,
    sections: params.sections,
    questions,
    ...personCentricPromptFields(questionSet.title),
  });

  const { system, userTemplate } = loadColloquializePrompt();
  const userContent = userTemplate.replace("{{INPUT_JSON}}", JSON.stringify(promptInput, null, 2));

  const parsed = await chatJson<unknown>([
    { role: "system", content: systemWithOutputLocale(system) },
    { role: "user", content: userContent },
  ]);

  const items = parseColloquialize(parsed, questions);
  return toResult(items);
}
