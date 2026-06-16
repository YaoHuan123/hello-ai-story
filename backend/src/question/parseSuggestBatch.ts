import type { SuggestBatchItem } from "./types";

export const MAX_SUGGESTIONS_PER_QUESTION = 4;
export const SUGGESTION_MAX_LEN = 80;

/**
 * 解析批量备选 LLM 输出。
 *
 * @throws SUGGEST_BATCH_INVALID | SUGGEST_BATCH_MISSING_INPUT
 */
export function parseSuggestBatch(parsed: unknown, allowedQuestions: readonly string[]): SuggestBatchItem[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SUGGEST_BATCH_INVALID: 模型输出不是对象");
  }
  const root = parsed as Record<string, unknown>;
  if ("error" in root) {
    throw new Error(`SUGGEST_BATCH_MISSING_INPUT: ${JSON.stringify(root)}`);
  }
  const arr = root.suggestions;
  if (!Array.isArray(arr)) {
    throw new Error("SUGGEST_BATCH_INVALID: suggestions 须为数组");
  }
  if (arr.length !== allowedQuestions.length) {
    throw new Error(
      `SUGGEST_BATCH_INVALID: suggestions 条数 ${arr.length} 与 questions ${allowedQuestions.length} 不一致`,
    );
  }

  const allowed = new Set(allowedQuestions);
  const seen = new Set<string>();
  const out: SuggestBatchItem[] = [];

  for (let idx = 0; idx < arr.length; idx++) {
    const item = arr[idx];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("SUGGEST_BATCH_INVALID: suggestions 项须为对象");
    }
    const row = item as Record<string, unknown>;
    // 优先用 i (index)，兼容旧格式 question
    const iRaw = row.i;
    let question: string;
    if (typeof iRaw === "number") {
      if (!Number.isInteger(iRaw) || iRaw < 0 || iRaw >= allowedQuestions.length) {
        throw new Error(`SUGGEST_BATCH_INVALID: i=${iRaw} 超出范围 (0-${allowedQuestions.length - 1})`);
      }
      question = allowedQuestions[iRaw]!;
    } else {
      // 旧格式兼容
      question = String(row.question ?? row.fieldKey ?? "").trim();
    }
    if (!question || !allowed.has(question)) {
      throw new Error(`SUGGEST_BATCH_INVALID: 非法 question="${question}"`);
    }
    if (seen.has(question)) {
      throw new Error(`SUGGEST_BATCH_INVALID: 重复 question="${question}"`);
    }
    seen.add(question);

    const rawArr = row.suggestedAnswers;
    if (!Array.isArray(rawArr)) {
      throw new Error(`SUGGEST_BATCH_INVALID: suggestedAnswers 须为数组（${question}）`);
    }
    if (rawArr.length > MAX_SUGGESTIONS_PER_QUESTION) {
      throw new Error(
        `SUGGEST_BATCH_INVALID: suggestedAnswers 超过 ${MAX_SUGGESTIONS_PER_QUESTION} 条（${question}）`,
      );
    }

    const suggestedAnswers: string[] = [];
    for (let i = 0; i < rawArr.length; i++) {
      const s = String(rawArr[i] ?? "").trim();
      if (!s) continue;
      if (s.length > SUGGESTION_MAX_LEN) {
        throw new Error(
          `SUGGEST_BATCH_INVALID: suggestedAnswers[${i}] 超过 ${SUGGESTION_MAX_LEN} 字（${question}）`,
        );
      }
      suggestedAnswers.push(s);
    }
    out.push({ question, suggestedAnswers });
  }

  for (const q of allowedQuestions) {
    if (!seen.has(q)) {
      throw new Error(`SUGGEST_BATCH_INVALID: 缺少 question="${q}"`);
    }
  }
  return out;
}
