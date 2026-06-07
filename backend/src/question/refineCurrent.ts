import { QUESTION_TEXT_MAX_CHARS } from "../content/displayLocale";
import { chatJson, type ChatMessage } from "../topic/llm";
import { loadRefinePrompt } from "./loadPrompt";
import { narratorProfileFromSections } from "./narratorProfile";
import { parseRefine } from "./parseRefine";
import type { RefineCurrentQuestionParams, RefineCurrentQuestionResult } from "./types";
import { isRefineNotApplicable, isRefineSkipped } from "./types";

function isRefineQuestionTooLongError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.includes("REFINE_INVALID") &&
    err.message.includes("questionText 超过")
  );
}

async function callRefineLlm(messages: ChatMessage[]): Promise<unknown> {
  return chatJson<unknown>(messages);
}

/**
 * 是否应对当前题调用 refine LLM。
 * 本子类尚无已答 → false（第 1 题用 `batchQuestionText` 即可，与老项目 `countAnswered > 0` 一致）。
 */
export function shouldRefineCurrentQuestion(
  answeredInTopic: RefineCurrentQuestionParams["answeredInTopic"],
): boolean {
  return answeredInTopic.some((row) => String(row.answer ?? "").trim().length > 0);
}

/**
 * 步骤 5：逐题优化当前问句（LLM）。从第 2 题起由调用方在 `shouldRefineCurrentQuestion` 为 true 时调用。
 *
 * @throws REFINE_INVALID | REFINE_MISSING_INPUT | REFINE_NOT_APPLICABLE | REFINE_SKIPPED
 */
export async function refineCurrentQuestion(
  params: RefineCurrentQuestionParams,
): Promise<RefineCurrentQuestionResult> {
  const { questionSet } = params;

  // 守卫：kind / title（见 types.ts `isRefine*`）
  if (isRefineNotApplicable(questionSet)) {
    throw new Error(`REFINE_NOT_APPLICABLE: kind=${questionSet.kind} 不适用逐题优化`);
  }
  if (isRefineSkipped(questionSet)) {
    throw new Error(`REFINE_SKIPPED: 主题「${questionSet.title}」跳过逐题优化`);
  }
  if (!params.sections?.length) {
    throw new Error("REFINE_MISSING_INPUT: sections 为空");
  }

  const currentQuestion = params.currentQuestion.trim();
  const batchQuestionText = params.batchQuestionText.trim();
  if (!currentQuestion) {
    throw new Error("REFINE_MISSING_INPUT: currentQuestion 为空");
  }
  if (!batchQuestionText) {
    throw new Error("REFINE_MISSING_INPUT: batchQuestionText 为空");
  }

  // questionSet.questions 仅作 key 白名单，不写入 prompt 整表
  const allowed = new Set(questionSet.questions.map((q) => q.trim()).filter(Boolean));
  if (!allowed.has(currentQuestion)) {
    throw new Error(`REFINE_MISSING_INPUT: currentQuestion 不在 questionSet.questions 中`);
  }

  for (const row of params.answeredInTopic) {
    if (row.question === currentQuestion) {
      throw new Error("REFINE_MISSING_INPUT: answeredInTopic 不得包含 currentQuestion");
    }
    if (!allowed.has(row.question.trim())) {
      throw new Error(`REFINE_MISSING_INPUT: answeredInTopic 含非法 question="${row.question}"`);
    }
  }

  // 第 1 题：直通批量口语化，不调 LLM
  if (!shouldRefineCurrentQuestion(params.answeredInTopic)) {
    return {
      mode: "open",
      questionText: batchQuestionText,
      reason: "first-question-use-batch",
    };
  }

  const promptInput = {
    title: questionSet.title, // 本轮主题名，如「小学」
    narratorProfile: narratorProfileFromSections(params.sections),
    currentQuestion: {
      question: currentQuestion,
      batchQuestionText,
    },
    answeredInTopic: params.answeredInTopic.map((row) => ({
      question: row.question.trim(),
      questionText: String(row.questionText ?? "").trim() || row.question.trim(),
      answer: String(row.answer ?? "").trim(),
    })),
    sections: params.sections,
  };

  const { system, userTemplate } = loadRefinePrompt();
  const userContent = userTemplate.replace("{{INPUT_JSON}}", JSON.stringify(promptInput, null, 2));
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userContent },
  ];

  let parsed = await callRefineLlm(messages);
  try {
    return parseRefine(parsed);
  } catch (err) {
    if (!isRefineQuestionTooLongError(err)) throw err;
    parsed = await callRefineLlm([
      ...messages,
      {
        role: "user",
        content:
          `Your previous JSON violated the length limit. Regenerate JSON only. ` +
          `questionText must be ≤ ${QUESTION_TEXT_MAX_CHARS} characters. Shorten wording.`,
      },
    ]);
    return parseRefine(parsed);
  }
}
