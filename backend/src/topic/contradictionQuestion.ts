import type { FactContradictionRaw } from "./parseContradiction";

/** 单节摘录最大长度，避免 pending.json 过大。 */
const MAX_EXCERPT_CHARS = 800;

function truncateExcerpt(text: string): string {
  if (text.length <= MAX_EXCERPT_CHARS) return text;
  return `${text.slice(0, MAX_EXCERPT_CHARS)}…`;
}

/**
 * 将矛盾涉及的各节正文拼成一道完整确认题（开放作答）。
 * `involvedIds` 为节名，正文来自 `polishedEventSummaries`。
 */
export function buildContradictionQuestion(
  item: FactContradictionRaw,
  summaries: Record<string, string>,
): string {
  const lines: string[] = [
    `The following materials appear inconsistent. Please explain what actually happened: ${item.summary}`,
    "",
  ];

  for (const sectionName of item.involvedIds) {
    const body = summaries[sectionName]?.trim();
    if (!body) continue;
    lines.push(`[${sectionName}]`, truncateExcerpt(body), "");
  }

  lines.push(
    "Briefly explain which part is wrong, or how both statements can be true at once.",
  );
  return lines.join("\n").trim();
}
