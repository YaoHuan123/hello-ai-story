import type { DedupeDecision } from "./types";

const REASON_MAX_LEN = 60;

/**
 * 解析去重 LLM 输出。
 *
 * @throws DEDUPE_INVALID | DEDUPE_MISSING_INPUT
 */
export function parseDedupe(parsed: unknown, allowedQuestions: readonly string[]): DedupeDecision[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DEDUPE_INVALID: 模型输出不是对象");
  }
  const root = parsed as Record<string, unknown>;
  if ("error" in root) {
    throw new Error(`DEDUPE_MISSING_INPUT: ${JSON.stringify(root)}`);
  }
  const arr = root.decisions;
  if (!Array.isArray(arr)) {
    throw new Error("DEDUPE_INVALID: decisions 须为数组");
  }
  if (arr.length !== allowedQuestions.length) {
    throw new Error(
      `DEDUPE_INVALID: decisions 条数 ${arr.length} 与 questions ${allowedQuestions.length} 不一致`,
    );
  }

  const allowed = new Set(allowedQuestions);
  const seen = new Set<string>();
  const out: DedupeDecision[] = [];

  for (let idx = 0; idx < arr.length; idx++) {
    const item = arr[idx];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("DEDUPE_INVALID: decisions 项须为对象");
    }
    const row = item as Record<string, unknown>;
    // 优先用 i (index)，兼容旧格式 question
    const iRaw = row.i;
    let question: string;
    if (typeof iRaw === "number") {
      if (!Number.isInteger(iRaw) || iRaw < 0 || iRaw >= allowedQuestions.length) {
        throw new Error(`DEDUPE_INVALID: i=${iRaw} 超出范围 (0-${allowedQuestions.length - 1})`);
      }
      question = allowedQuestions[iRaw]!;
    } else {
      // 旧格式兼容
      question = String(row.question ?? row.fieldKey ?? "").trim();
    }
    const skip = row.skip === true;
    const reason = String(row.reason ?? "").trim();

    if (!question || !allowed.has(question)) {
      throw new Error(`DEDUPE_INVALID: 非法 question="${question}"`);
    }
    if (seen.has(question)) {
      throw new Error(`DEDUPE_INVALID: 重复 question="${question}"`);
    }
    seen.add(question);
    if (String(row.questionText ?? "").trim()) {
      throw new Error(`DEDUPE_INVALID: 去重步不得输出 questionText（${question}）`);
    }
    if (reason.length > REASON_MAX_LEN) {
      throw new Error("DEDUPE_INVALID: reason 超过 60 字");
    }
    out.push({ question, skip, ...(reason ? { reason } : {}) });
  }

  for (const q of allowedQuestions) {
    if (!seen.has(q)) {
      throw new Error(`DEDUPE_INVALID: 缺少 question="${q}"`);
    }
  }
  return out;
}
