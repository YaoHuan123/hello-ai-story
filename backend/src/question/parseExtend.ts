import type { ExtendQuestionItem } from "./types";

export const MAX_EXTEND_QUESTIONS = 3;
export const EXTEND_QUESTION_MAX_LEN = 30;
export const EXTEND_SUGGESTION_MAX_LEN = 40;
export const MAX_EXTEND_SUGGESTIONS_PER_QUESTION = 4;

/**
 * 解析扩展追问 LLM 输出。
 *
 * @throws EXTEND_INVALID | EXTEND_MISSING_INPUT
 */
export function parseExtend(parsed: unknown): ExtendQuestionItem[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("EXTEND_INVALID: 模型输出不是对象");
  }
  const root = parsed as Record<string, unknown>;
  if ("error" in root) {
    throw new Error(`EXTEND_MISSING_INPUT: ${JSON.stringify(root)}`);
  }

  const arr = root.questions;
  if (!Array.isArray(arr)) {
    throw new Error("EXTEND_INVALID: questions 须为数组");
  }
  if (arr.length > MAX_EXTEND_QUESTIONS) {
    throw new Error(`EXTEND_INVALID: questions 超过 ${MAX_EXTEND_QUESTIONS} 条`);
  }

  const out: ExtendQuestionItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`EXTEND_INVALID: questions[${i}] 须为对象`);
    }
    const row = item as Record<string, unknown>;
    const q = String(row.q ?? "").trim();
    if (!q) {
      throw new Error(`EXTEND_INVALID: questions[${i}].q 缺失`);
    }
    if (q.length > EXTEND_QUESTION_MAX_LEN) {
      throw new Error(`EXTEND_INVALID: questions[${i}].q 超过 ${EXTEND_QUESTION_MAX_LEN} 字`);
    }

    const suggestedAnswers: string[] = [];
    const rawSug = row.suggestedAnswers;
    if (rawSug !== undefined) {
      if (!Array.isArray(rawSug)) {
        throw new Error(`EXTEND_INVALID: questions[${i}].suggestedAnswers 须为数组`);
      }
      if (rawSug.length > MAX_EXTEND_SUGGESTIONS_PER_QUESTION) {
        throw new Error(
          `EXTEND_INVALID: questions[${i}].suggestedAnswers 超过 ${MAX_EXTEND_SUGGESTIONS_PER_QUESTION} 条`,
        );
      }
      for (let j = 0; j < rawSug.length; j++) {
        const s = String(rawSug[j] ?? "").trim();
        if (!s) continue;
        if (s.length > EXTEND_SUGGESTION_MAX_LEN) {
          throw new Error(
            `EXTEND_INVALID: questions[${i}].suggestedAnswers[${j}] 超过 ${EXTEND_SUGGESTION_MAX_LEN} 字`,
          );
        }
        if (!suggestedAnswers.includes(s)) suggestedAnswers.push(s);
      }
    }
    out.push({ q, suggestedAnswers });
  }
  return out;
}
