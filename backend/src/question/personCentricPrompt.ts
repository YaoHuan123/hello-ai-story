import {
  catalogTopicSubjectLabel,
  getSubCategoryIdByTopicName,
  isPersonCentricCatalogTopic,
  resolveCanonicalTopicName,
} from "../topic/catalog";
import { getZhSubCategoryName } from "../content/displayCatalog";
import type { AnsweredSection } from "../topic/types";
import type { DedupeDecision } from "./types";

export type PersonCentricPromptFields = {
  topicSubject: string;
  dedupeScopeSection: string;
};

/** 人物子类 dedupe / colloquialize / refine 入参追加字段。 */
export function personCentricPromptFields(title: string): PersonCentricPromptFields | undefined {
  if (!isPersonCentricCatalogTopic(title)) return undefined;
  const canonical = resolveCanonicalTopicName(title);
  return {
    topicSubject: catalogTopicSubjectLabel(title, "en"),
    dedupeScopeSection: canonical,
  };
}

function sectionMatchesPersonCentricScope(sectionName: string, dedupeScopeSection: string): boolean {
  const n = sectionName.trim();
  if (!n) return false;
  if (n === dedupeScopeSection) return true;
  const id = getSubCategoryIdByTopicName(dedupeScopeSection);
  if (id) {
    const zh = getZhSubCategoryName(id);
    if (zh && n === zh) return true;
  }
  return false;
}

function hasPersonCentricScopeSection(sections: AnsweredSection[], dedupeScopeSection: string): boolean {
  return sections.some((s) => sectionMatchesPersonCentricScope(s.name, dedupeScopeSection));
}

/**
 * 人物子类：尚无同名 section 时不得 skip（避免 Basic profile 误去重）。
 * 已有 Father/父亲 等节时保留 LLM 判定。
 */
export function filterPersonCentricDedupeDecisions(
  title: string,
  sections: AnsweredSection[],
  decisions: DedupeDecision[],
): DedupeDecision[] {
  const extras = personCentricPromptFields(title);
  if (!extras) return decisions;
  if (hasPersonCentricScopeSection(sections, extras.dedupeScopeSection)) {
    return decisions;
  }
  return decisions.map((d) => (d.skip ? { ...d, skip: false, reason: "person-centric-no-scope-section" } : d));
}
