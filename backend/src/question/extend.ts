import { EXTEND_QUESTION_MAX_CHARS } from "../content/displayLocale";
import { systemWithOutputLocale, withOutputLocale } from "../content/interviewOutputLocale";
import { chatJson, type ChatMessage } from "../topic/llm";
import { loadExtendPrompt } from "./loadPrompt";
import { narratorProfileFromSections } from "./narratorProfile";
import { parseExtend } from "./parseExtend";
import { traceQuestionStep, runWithLlmTraceLabel } from "./questionTrace";
import type { ExtendSubCategoryParams, ExtendSubCategoryResult } from "./types";
import { isExtendNotApplicable, isExtendSkipped } from "./types";

function isExtendQuestionTooLongError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("EXTEND_INVALID") && err.message.includes(".q 超过");
}

async function callExtendLlm(messages: ChatMessage[]): Promise<unknown> {
  return traceQuestionStep("extend.subCategory", () =>
    runWithLlmTraceLabel("extend.subCategory", () => chatJson<unknown>(messages)),
  );
}

function filterAnsweredRecord(raw: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw)
      .map(([k, v]) => [String(k).trim(), String(v ?? "").trim()] as const)
      .filter(([k, v]) => k.length > 0 && v.length > 0),
  );
}

/**
 * 步骤 8：模板必填答完后的扩展追问（0～3 条，LLM）。
 *
 * @throws EXTEND_INVALID | EXTEND_MISSING_INPUT | EXTEND_NOT_APPLICABLE | EXTEND_SKIPPED
 */
export async function extendSubCategoryQuestions(
  params: ExtendSubCategoryParams,
): Promise<ExtendSubCategoryResult> {
  const { questionSet } = params;

  if (isExtendNotApplicable(questionSet)) {
    throw new Error(`EXTEND_NOT_APPLICABLE: kind=${questionSet.kind} 不适用扩展追问`);
  }
  if (isExtendSkipped(questionSet)) {
    throw new Error(`EXTEND_SKIPPED: 主题「${questionSet.title}」跳过扩展追问`);
  }
  if (!params.sections?.length) {
    throw new Error("EXTEND_MISSING_INPUT: sections 为空");
  }

  const templateAnswered = filterAnsweredRecord(params.templateAnswered ?? {});
  if (Object.keys(templateAnswered).length === 0) {
    throw new Error("EXTEND_MISSING_INPUT: templateAnswered 不能为空");
  }
  const promptInput = withOutputLocale({
    title: questionSet.title,
    narratorProfile: narratorProfileFromSections(params.sections),
    templateAnswered,
    sections: params.sections,
  });

  const { system, userTemplate } = loadExtendPrompt();
  const userContent = userTemplate.replace("{{INPUT_JSON}}", JSON.stringify(promptInput, null, 2));
  const messages: ChatMessage[] = [
    { role: "system", content: systemWithOutputLocale(system) },
    { role: "user", content: userContent },
  ];

  let parsed = await callExtendLlm(messages);
  try {
    return { questions: parseExtend(parsed) };
  } catch (err) {
    if (!isExtendQuestionTooLongError(err)) throw err;
    parsed = await callExtendLlm([
      ...messages,
      {
        role: "user",
        content:
          `Your previous JSON violated the length limit. Regenerate JSON only. ` +
          `Each questions[].q must be ≤ ${EXTEND_QUESTION_MAX_CHARS} characters. ` +
          `Shorten wording; keep one focus per question.`,
      },
    ]);
    return { questions: parseExtend(parsed) };
  }
}
