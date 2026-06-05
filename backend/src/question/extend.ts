import { chatJson } from "../topic/llm";
import { loadExtendPrompt } from "./loadPrompt";
import { narratorProfileFromSections } from "./narratorProfile";
import { parseExtend } from "./parseExtend";
import { traceQuestionStep, runWithLlmTraceLabel } from "./questionTrace";
import type { ExtendSubCategoryParams, ExtendSubCategoryResult } from "./types";
import { isExtendNotApplicable, isExtendSkipped } from "./types";

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
  const promptInput = {
    title: questionSet.title,
    narratorProfile: narratorProfileFromSections(params.sections),
    templateAnswered,
    sections: params.sections,
  };

  const { system, userTemplate } = loadExtendPrompt();
  const userContent = userTemplate.replace("{{INPUT_JSON}}", JSON.stringify(promptInput, null, 2));

  const parsed = await traceQuestionStep("extend.subCategory", () =>
    runWithLlmTraceLabel("extend.subCategory", () =>
      chatJson<unknown>([
        { role: "system", content: system },
        { role: "user", content: userContent },
      ]),
    ),
  );

  const questions = parseExtend(parsed);
  return { questions };
}
