import type { CurrentAnswerSuggestionCandidate } from "./types";

export const MAX_SUGGEST_CURRENT = 4;
export const SUGGEST_CURRENT_VALUE_MAX_LEN = 40;
/** 低于此置信度的候选不进入 `suggestedAnswers` 字符串列表 */
export const SUGGEST_CURRENT_MIN_CONFIDENCE = 0.7;

const INFERENCE_TYPES = new Set<CurrentAnswerSuggestionCandidate["inferenceType"]>([
  "direct_extract",
  "calculation",
  "entity_location",
  "enum_match",
]);

function isInferenceType(x: unknown): x is CurrentAnswerSuggestionCandidate["inferenceType"] {
  return typeof x === "string" && INFERENCE_TYPES.has(x as CurrentAnswerSuggestionCandidate["inferenceType"]);
}

/**
 * 解析逐题备选 LLM 输出。
 *
 * @throws SUGGEST_CURRENT_INVALID | SUGGEST_CURRENT_MISSING_INPUT
 */
export function parseSuggestCurrent(parsed: unknown): CurrentAnswerSuggestionCandidate[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SUGGEST_CURRENT_INVALID: 模型输出不是对象");
  }
  const root = parsed as Record<string, unknown>;
  if ("error" in root) {
    throw new Error(`SUGGEST_CURRENT_MISSING_INPUT: ${JSON.stringify(root)}`);
  }

  const rawArr = root.suggestedAnswers;
  if (!Array.isArray(rawArr)) {
    throw new Error("SUGGEST_CURRENT_INVALID: suggestedAnswers 须为数组");
  }
  if (rawArr.length > MAX_SUGGEST_CURRENT) {
    throw new Error(`SUGGEST_CURRENT_INVALID: suggestedAnswers 超过 ${MAX_SUGGEST_CURRENT} 条`);
  }

  const out: CurrentAnswerSuggestionCandidate[] = [];
  for (let i = 0; i < rawArr.length; i++) {
    const raw = rawArr[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`SUGGEST_CURRENT_INVALID: suggestedAnswers[${i}] 须为对象`);
    }
    const row = raw as Record<string, unknown>;
    const value = String(row.value ?? "").trim();
    if (!value) continue;
    if (value.length > SUGGEST_CURRENT_VALUE_MAX_LEN) {
      throw new Error(`SUGGEST_CURRENT_INVALID: suggestedAnswers[${i}].value 超过 ${SUGGEST_CURRENT_VALUE_MAX_LEN} 字`);
    }
    const confidence = Number(row.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error(`SUGGEST_CURRENT_INVALID: suggestedAnswers[${i}].confidence 须为 0~1`);
    }
    const inferenceType = row.inferenceType;
    if (!isInferenceType(inferenceType)) {
      throw new Error(`SUGGEST_CURRENT_INVALID: suggestedAnswers[${i}].inferenceType 非法`);
    }
    const basis = String(row.basis ?? "").trim();
    if (!basis) {
      throw new Error(`SUGGEST_CURRENT_INVALID: suggestedAnswers[${i}].basis 不能为空`);
    }
    if (!out.some((x) => x.value === value)) {
      out.push({ value, confidence, inferenceType, basis });
    }
  }
  return out;
}

/** 高置信候选的 value 列表（供 UI chip，保持顺序）。 */
export function suggestedAnswerValuesFromCandidates(
  candidates: CurrentAnswerSuggestionCandidate[],
  minConfidence = SUGGEST_CURRENT_MIN_CONFIDENCE,
): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    if (c.confidence < minConfidence) continue;
    if (!out.includes(c.value)) out.push(c.value);
  }
  return out;
}
