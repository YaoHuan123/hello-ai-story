import type { DisplayLocale } from "../content/displayLocale";
import { toCanonicalFieldChoice } from "../content/translate/options";
import { getTopicFieldDef } from "./catalog";
import type { InterviewFieldType, TopicFieldMeta } from "./fieldMeta";
import { normalizeYearMonthInRange } from "./yearMonth";

/** 年月题：只保留可解析为 YYYY-MM 的 chip（过滤 LLM 叙事短语）。 */
export function filterSuggestionsForFieldType(
  suggestions: readonly string[],
  fieldType: InterviewFieldType | undefined,
): string[] {
  if (fieldType !== "yearMonth") {
    return suggestions.map((s) => String(s).trim()).filter(Boolean);
  }
  const out: string[] = [];
  for (const raw of suggestions) {
    const s = String(raw).trim();
    if (!s) continue;
    const ym = normalizeYearMonthInRange(s);
    if (!ym || out.includes(ym)) continue;
    out.push(ym);
  }
  return out;
}

export type FieldAnswerResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export type FieldAnswerOpts = {
  displayLocale?: DisplayLocale;
  topicName?: string;
  fieldKey?: string;
  canonicalChoices?: string[];
  optionsKey?: string;
};

/**
 * 按字段元数据校验并规范化用户答案（展示值 → canonical 落盘值）。
 */
export function normalizeFieldAnswer(
  meta: TopicFieldMeta | undefined,
  raw: string,
  opts?: FieldAnswerOpts,
): FieldAnswerResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: "答案不能为空" };
  }

  const fieldType = meta?.fieldType ?? "text";

  if (fieldType === "yearMonth") {
    const ym = normalizeYearMonthInRange(trimmed);
    if (!ym) {
      return { ok: false, message: "请输入合法的年月，如 1992年3月" };
    }
    return { ok: true, value: ym };
  }

  if (fieldType === "select" && meta?.fieldChoices?.length) {
    const locale = opts?.displayLocale ?? "zh";
    let optionsKey = opts?.optionsKey;
    if (!optionsKey && opts?.topicName && opts?.fieldKey) {
      optionsKey = getTopicFieldDef(opts.topicName, opts.fieldKey)?.optionsKey;
    }
    const canonical = toCanonicalFieldChoice(
      trimmed,
      opts?.canonicalChoices ?? meta.fieldChoices,
      optionsKey,
      locale,
    );
    if (!canonical) {
      return { ok: false, message: "请从给定选项中选择" };
    }
    return { ok: true, value: canonical };
  }

  return { ok: true, value: trimmed };
}
