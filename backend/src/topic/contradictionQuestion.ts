import type { FactContradictionRaw } from "./parseContradiction";

/** 单节摘录最大长度，避免 tier5.json 过大。 */
const MAX_EXCERPT_CHARS = 800;

function truncateExcerpt(text: string): string {
  if (text.length <= MAX_EXCERPT_CHARS) return text;
  return `${text.slice(0, MAX_EXCERPT_CHARS)}…`;
}

/**
 * 将矛盾涉及的各节正文拼成一道完整确认题（开放作答「说明」）。
 * `involvedIds` 为节名，正文来自 `polishedEventSummaries`。
 */
export function buildContradictionQuestion(
  item: FactContradictionRaw,
  summaries: Record<string, string>,
): string {
  const lines: string[] = [
    `以下材料存在不一致，请说明实际情况：${item.summary}`,
    "",
  ];

  for (const sectionName of item.involvedIds) {
    const body = summaries[sectionName]?.trim();
    if (!body) continue;
    lines.push(`【${sectionName}】`, truncateExcerpt(body), "");
  }

  lines.push("请简要说明哪一处有误，或二者如何同时成立。");
  return lines.join("\n").trim();
}
