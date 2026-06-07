import { chatJson } from "./llm";
import { loadInnerPrompt } from "./loadInnerPrompt";
import { MATERIAL_INNER_REASON } from "./materialCopy";
import { parseEmotionalInnerQuestions } from "./parseInner";
import {
  assertSectionsForTier5,
  sectionsToPolishedEventSummaries,
} from "./sectionsInput";
import type { AnsweredSection, TopicPick } from "./types";

export type RecommendTier8Params = {
  sections: AnsweredSection[];
};

/**
 * Tier8（内心是/否）：根据 `sections` 调 LLM（含 tier7 答题后的正文，由调用方合并）。
 *
 * @throws TOPIC_MISSING_INPUT | MATERIAL_MIN_ENTRIES
 */
export async function recommendTier8(params: RecommendTier8Params): Promise<TopicPick[]> {
  assertSectionsForTier5(params.sections);

  const polishedTemplateInstanceSummaries = sectionsToPolishedEventSummaries(params.sections);
  const keys = Object.keys(polishedTemplateInstanceSummaries);
  if (keys.length === 0) return [];

  const { system, userTemplate } = loadInnerPrompt();
  const pipelineJson = JSON.stringify({ polishedTemplateInstanceSummaries }, null, 2);
  const userContent = userTemplate.replace("{{PIPELINE_JSON}}", pipelineJson);
  const parsed = await chatJson<unknown>([
    { role: "system", content: system },
    { role: "user", content: userContent },
  ]);
  const rows = parseEmotionalInnerQuestions(parsed);

  return rows.map((row) => ({
    tier: 8 as const,
    kind: "material_inner" as const,
    title: row.question,
    reason: MATERIAL_INNER_REASON,
  }));
}
