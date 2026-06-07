import type { DisplayLocale } from "../content/displayLocale";
import { getDisplayHotTopicDomainName } from "../content/displayCatalog";
import { hotTopicDomainIdByName } from "./hotTopicMap";

const LIFE_MEMORY_REASON_RE = /^Life memory:\s*(.+)$/;

/** Tier5～8 落盘用英文文案（展示层再翻译）。 */

export function contradictionQuestionFallback(title: string): string {
  return `Please clarify this inconsistency: ${title.trim()}`;
}

export function gapQuestionText(missingPoint: string): string {
  return `Details you could add: ${missingPoint.trim()}`;
}

export const MATERIAL_GAP_REASON = "Material gap — please add key dates or places";

export const MATERIAL_INNER_REASON = "Inner reflection — answer yes or no";

export const MATERIAL_INNER_SUGGESTIONS = ["Yes", "No"] as const;

export function materialContradictionPickReason(sectionCount: number): string {
  return `Involves ${sectionCount} filled section(s) — please clarify`;
}

/** 已知英文 reason 模板 → 中文（其余交给 MT 缓存）。 */
export function toDisplayMaterialPickReason(reason: string, locale: DisplayLocale): string {
  if (locale !== "zh") return reason;
  const t = reason.trim();
  if (t === MATERIAL_GAP_REASON) return "素材尚有缺口，请补充关键时间或地点";
  if (t === MATERIAL_INNER_REASON) return "内心反思——请用是或否作答";
  const contradiction = /^Involves (\d+) filled section\(s\) — please clarify$/.exec(t);
  if (contradiction) {
    return `涉及 ${contradiction[1]} 个已填小节，请说明`;
  }
  const lifeMemory = LIFE_MEMORY_REASON_RE.exec(t);
  if (lifeMemory) {
    const domainId = hotTopicDomainIdByName(lifeMemory[1]!);
    const zhDomain = domainId ? getDisplayHotTopicDomainName(domainId, locale) : undefined;
    if (zhDomain) return `生活记忆：${zhDomain}`;
  }
  return reason;
}
