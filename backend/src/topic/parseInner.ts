export type EmotionalInnerQuestionRow = {
  segmentIndex: number;
  question: string;
  presentScore: number;
};

/** Tier8：解析 `emotionalInnerQuestions`。 */
export function parseEmotionalInnerQuestions(parsed: unknown): EmotionalInnerQuestionRow[] {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("INNER_INVALID: 模型输出不是对象");
  }
  const arr = (parsed as Record<string, unknown>).emotionalInnerQuestions;
  if (!Array.isArray(arr)) {
    throw new Error("INNER_INVALID: 缺少 emotionalInnerQuestions 数组");
  }
  const out: EmotionalInnerQuestionRow[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("INNER_INVALID: emotionalInnerQuestions 项须为对象");
    }
    const o = item as Record<string, unknown>;
    const seg =
      typeof o.segmentIndex === "number" && Number.isInteger(o.segmentIndex) && o.segmentIndex >= 0
        ? o.segmentIndex
        : null;
    if (seg === null) throw new Error("INNER_INVALID: segmentIndex 须为 >=0 的整数");
    if (typeof o.question !== "string" || !o.question.trim()) {
      throw new Error("INNER_INVALID: question 须为非空字符串");
    }
    const ps = typeof o.presentScore === "number" && Number.isInteger(o.presentScore) ? o.presentScore : NaN;
    if (ps < 1 || ps > 10) throw new Error("INNER_INVALID: presentScore 须为 1–10 的整数");
    out.push({ segmentIndex: seg, question: o.question.trim(), presentScore: ps });
  }
  return out;
}
