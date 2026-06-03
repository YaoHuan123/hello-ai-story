import type { AnsweredSection } from "./types";

/** Tier5～8 素材分析至少需要的「有内容的节」数量。 */
export const MIN_TIER5_SECTIONS = 5;

/** 至少有一条非空回答的节。 */
export function sectionsWithAnswers(sections: AnsweredSection[]): AnsweredSection[] {
  return (sections ?? []).filter((sec) => {
    const qa = sec.qa ?? [];
    return qa.some((pair) => String(pair.a ?? "").trim().length > 0);
  });
}

/**
 * 将 `sections` 转为 tier5～8 LLM 提示词所需的节摘要映射。
 *
 * - 每条有效节 → 一个 id（`name`，与模板子类名一致）
 * - 正文：该节下所有 q/a 拼成叙述文本
 */
export function sectionsToPolishedEventSummaries(
  sections: AnsweredSection[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sec of sectionsWithAnswers(sections)) {
    const name = sec.name.trim();
    if (!name) continue;
    const lines = (sec.qa ?? [])
      .filter((pair) => String(pair.a ?? "").trim())
      .map((pair) => `${String(pair.q).trim()}：${String(pair.a).trim()}`);
    if (lines.length === 0) continue;
    out[name] = lines.join("\n");
  }
  return out;
}

/**
 * @throws TOPIC_MISSING_INPUT sections 为空
 * @throws MATERIAL_MIN_ENTRIES 有效节数不足 {@link MIN_TIER5_SECTIONS}
 */
export function assertSectionsForTier5(sections: AnsweredSection[]): void {
  if (!sections || sections.length === 0) {
    throw new Error("TOPIC_MISSING_INPUT: sections 为空（请先填写基本信息）");
  }
  const usable = sectionsWithAnswers(sections);
  if (usable.length < MIN_TIER5_SECTIONS) {
    throw new Error(
      `MATERIAL_MIN_ENTRIES: tier5 需要至少 ${MIN_TIER5_SECTIONS} 个有内容的节，当前 ${usable.length} 个`,
    );
  }
}
