export const MAX_SUGGEST_CURRENT = 4;
export const SUGGEST_CURRENT_VALUE_MAX_LEN = 80;

function extractSuggestValue(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return String((raw as Record<string, unknown>).value ?? "").trim();
  }
  return "";
}

function readSuggestRawArray(parsed: unknown): unknown[] {
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
  return rawArr;
}

/** LLM 是否返回了非空备选（含因超长被丢弃的项）。 */
export function hasNonEmptySuggestCandidates(parsed: unknown): boolean {
  try {
    const rawArr = readSuggestRawArray(parsed);
    return rawArr.some((raw) => extractSuggestValue(raw).length > 0);
  } catch {
    return false;
  }
}

/**
 * 解析逐题备选 LLM 输出。
 *
 * 新格式：`{ "suggestedAnswers": ["1970-09"] }`。
 * 兼容旧格式：`{ "suggestedAnswers": [{ "value": "1970-09", ... }] }`。
 * 超过长度上限的项静默丢弃（避免整题失败；用户仍可手输）。
 *
 * @throws SUGGEST_CURRENT_INVALID | SUGGEST_CURRENT_MISSING_INPUT
 */
export function parseSuggestCurrent(parsed: unknown): string[] {
  const rawArr = readSuggestRawArray(parsed);

  const out: string[] = [];
  for (const raw of rawArr) {
    const value = extractSuggestValue(raw);
    if (!value) continue;
    if (value.length > SUGGEST_CURRENT_VALUE_MAX_LEN) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}
