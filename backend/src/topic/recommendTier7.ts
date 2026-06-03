import { chatJson } from "./llm";
import { loadTurnPrompt } from "./loadTurnPrompt";
import { parseTurningPointReasons } from "./parseTurn";
import {
  assertSectionsForTier5,
  sectionsToPolishedEventSummaries,
} from "./sectionsInput";
import type { AnsweredSection, TopicPick } from "./types";

export type RecommendTier7Params = {
  sections: AnsweredSection[];
};

/**
 * Tier7（转折）：根据 `sections` 调 LLM，返回转折追问待选项。
 *
 * @throws TOPIC_MISSING_INPUT | MATERIAL_MIN_ENTRIES
 */
export async function recommendTier7(params: RecommendTier7Params): Promise<TopicPick[]> {
  assertSectionsForTier5(params.sections);

  const polishedTemplateInstanceSummaries = sectionsToPolishedEventSummaries(params.sections);
  const keys = Object.keys(polishedTemplateInstanceSummaries);
  if (keys.length === 0) return [];

  const { system, userTemplate } = loadTurnPrompt();
  const pipelineJson = JSON.stringify({ polishedTemplateInstanceSummaries }, null, 2);
  const userContent = userTemplate.replace("{{PIPELINE_JSON}}", pipelineJson);
  const parsed = await chatJson<unknown>([
    { role: "system", content: system },
    { role: "user", content: userContent },
  ]);
  const rows = parseTurningPointReasons(parsed);

  return rows.map((row) => ({
    tier: 7 as const,
    kind: "material_turn" as const,
    title: row.question,
    reason: row.reason,
  }));
}
