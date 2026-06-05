import type { TopicFieldMeta } from "./fieldMeta";
import { normalizeYearMonthInRange } from "./yearMonth";

export type FieldAnswerResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

/**
 * 按字段元数据校验并规范化用户答案。
 * - yearMonth → YYYY-MM
 * - select → 须在 fieldChoices 内
 * - text → trim 后非空
 */
export function normalizeFieldAnswer(meta: TopicFieldMeta | undefined, raw: string): FieldAnswerResult {
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
    const match = meta.fieldChoices.find((c) => c === trimmed);
    if (!match) {
      return { ok: false, message: "请从给定选项中选择" };
    }
    return { ok: true, value: match };
  }

  return { ok: true, value: trimmed };
}
