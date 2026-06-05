import type { AnsweredSection } from "../../topic/types";
import { filterSectionsForVideo } from "../../video/shared/input/sectionsFilter.js";

export type TextArticleLlmSection = {
  name: string;
  qa: Array<{ q: string; a: string }>;
};

/** 文本流水线 LLM 入参：仅保留节名与 qa，顺序与 `sections.json` 一致。 */
export function sectionsForTextArticleLlm(sections: AnsweredSection[]): { sections: TextArticleLlmSection[] } {
  return {
    sections: filterSectionsForVideo(sections).map(({ name, qa }) => ({
      name,
      qa: qa.map(({ q, a }) => ({ q: q.trim(), a: a.trim() })),
    })),
  };
}
