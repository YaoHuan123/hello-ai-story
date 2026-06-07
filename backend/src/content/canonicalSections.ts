import type { AnsweredSection } from "../topic/types";
import { resolveCanonicalTopicName } from "../topic/catalog";

/** 当前采访落盘格式：节名为 canonical 英文（catalog）或 LLM 英文自由标题。 */
export const INTERVIEW_SCHEMA_VERSION = 2;

export function normalizeSectionName(name: string): string {
  const t = name.trim();
  if (!t) return t;
  try {
    return resolveCanonicalTopicName(t);
  } catch {
    return t;
  }
}

export function normalizeSections(sections: AnsweredSection[]): AnsweredSection[] {
  return (sections ?? []).map((sec) => ({
    ...sec,
    name: normalizeSectionName(sec.name),
  }));
}

export function sectionsNeedNormalization(sections: AnsweredSection[]): boolean {
  return (sections ?? []).some((sec) => normalizeSectionName(sec.name) !== sec.name.trim());
}
