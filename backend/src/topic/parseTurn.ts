export type TurningPointReasonRow = {
  order: number;
  question: string;
  reason: string;
  presentScore: number;
};

/** Tier7：解析 `turningPointReasons`。 */
export function parseTurningPointReasons(parsed: unknown): TurningPointReasonRow[] {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("TURN_INVALID: 模型输出不是对象");
  }
  const arr = (parsed as Record<string, unknown>).turningPointReasons;
  if (!Array.isArray(arr)) {
    throw new Error("TURN_INVALID: 缺少 turningPointReasons 数组");
  }
  const out: TurningPointReasonRow[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("TURN_INVALID: turningPointReasons 项须为对象");
    }
    const o = item as Record<string, unknown>;
    const order =
      typeof o.order === "number" && Number.isInteger(o.order) && o.order >= 1 ? o.order : null;
    if (order === null) throw new Error("TURN_INVALID: order 须为 >=1 的整数");
    const question = typeof o.question === "string" ? o.question.trim() : "";
    if (!question) {
      throw new Error("TURN_INVALID: question 须为非空字符串");
    }
    if (/^(is there|are there|did you (ever )?have)\b/i.test(question)) {
      throw new Error("TURN_INVALID: question 不得为筛查句式");
    }
    if (typeof o.reason !== "string" || !o.reason.trim()) {
      throw new Error("TURN_INVALID: reason 须为非空字符串");
    }
    const ps = typeof o.presentScore === "number" && Number.isInteger(o.presentScore) ? o.presentScore : NaN;
    if (ps < 1 || ps > 10) throw new Error("TURN_INVALID: presentScore 须为 1–10 的整数");
    out.push({
      order,
      question,
      reason: o.reason.trim(),
      presentScore: ps,
    });
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}
