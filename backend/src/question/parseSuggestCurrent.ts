export const MAX_SUGGEST_CURRENT = 4;
export const SUGGEST_CURRENT_VALUE_MAX_LEN = 40;

/**
 * 解析逐题备选 LLM 输出。
 *
 * 新格式：`{ "suggestedAnswers": ["1970-09"] }`。
 * 兼容旧格式：`{ "suggestedAnswers": [{ "value": "1970-09", ... }] }`。
 *
 * @throws SUGGEST_CURRENT_INVALID | SUGGEST_CURRENT_MISSING_INPUT
 */
export function parseSuggestCurrent(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SUGGEST_CURRENT_INVALID: 模型输出不是对象");
  }
  const root = parsed as Record<string, unknown>;
  if ("error" in root) {
    throw new Error(`SUGGEST_CURRENT_MISSING_INPUT: ${JSON.stringify(root)}`);
  }

  const rawArr = root.suggestedAnswers ?? root.options;
  if (!Array.isArray(rawArr)) {
    throw new Error("SUGGEST_CURRENT_INVALID: suggestedAnswers 须为数组");
  }
  if (rawArr.length > MAX_SUGGEST_CURRENT) {
    throw new Error(`SUGGEST_CURRENT_INVALID: suggestedAnswers 超过 ${MAX_SUGGEST_CURRENT} 条`);
  }

  const out: string[] = [];
  for (let i = 0; i < rawArr.length; i++) {
    const raw = rawArr[i];
    const value =
      typeof raw === "string"
        ? raw.trim()
        : raw && typeof raw === "object" && !Array.isArray(raw)
          ? String((raw as Record<string, unknown>).value ?? "").trim()
          : "";
    if (!value) continue;
    if (value.length > SUGGEST_CURRENT_VALUE_MAX_LEN) {
      throw new Error(`SUGGEST_CURRENT_INVALID: suggestedAnswers[${i}].value 超过 ${SUGGEST_CURRENT_VALUE_MAX_LEN} 字`);
    }
    if (!out.includes(value)) out.push(value);
  }
  return out;
}
