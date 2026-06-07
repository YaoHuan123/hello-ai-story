import { QUESTION_TEXT_MAX_CHARS } from "../content/displayLocale";
import type { RefineCurrentQuestionResult } from "./types";
const REASON_MAX_LEN = 60;

/**
 * 解析逐题 refine LLM 输出。
 *
 * @throws REFINE_INVALID | REFINE_MISSING_INPUT
 */
export function parseRefine(parsed: unknown): RefineCurrentQuestionResult {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("REFINE_INVALID: 模型输出不是对象");
  }
  const root = parsed as Record<string, unknown>;
  if ("error" in root) {
    throw new Error(`REFINE_MISSING_INPUT: ${JSON.stringify(root)}`);
  }

  const mode = root.mode;
  if (mode === "judgment") {
    throw new Error("REFINE_INVALID: 不再支持 judgment 模式");
  }
  if (mode !== "open") {
    throw new Error("REFINE_INVALID: mode 须为 open");
  }

  const questionText = String(root.questionText ?? "").trim();
  const reason = String(root.reason ?? "").trim();

  if (!questionText) {
    throw new Error("REFINE_INVALID: questionText 缺失");
  }
  const maxLen = QUESTION_TEXT_MAX_CHARS;
  if (questionText.length > maxLen) {
    throw new Error(`REFINE_INVALID: questionText 超过 ${maxLen} 字`);
  }
  if (/请填写|^\[|fieldKey|please fill|fill in\b|enter your/i.test(questionText)) {
    throw new Error("REFINE_INVALID: questionText 不得为填表指令或字段名复述");
  }
  if (/\b(right|correct)\?\s*$|isn't it\?\s*$|i guess\b/i.test(questionText)) {
    throw new Error("REFINE_INVALID: questionText 不得为判断句结尾");
  }
  if (reason.length > REASON_MAX_LEN) {
    throw new Error("REFINE_INVALID: reason 超过 60 字");
  }

  return { mode: "open", questionText, ...(reason ? { reason } : {}) };
}
