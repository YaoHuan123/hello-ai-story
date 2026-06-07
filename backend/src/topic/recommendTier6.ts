import { chatJson } from "./llm";
import { loadGapPrompt } from "./loadGapPrompt";
import { MATERIAL_GAP_REASON } from "./materialCopy";
import { parseGapAudit } from "./parseGap";
import {
  assertSectionsForTier5,
  sectionsToPolishedEventSummaries,
} from "./sectionsInput";
import type { AnsweredSection, TopicPick } from "./types";

/** Tier6 选题入参：与 tier5 相同，使用 `sections`（结果由 service 写入 pending.json）。 */
export type RecommendTier6Params = {
  sections: AnsweredSection[];
};

/**
 * Tier6：根据 `sections` 调 LLM 缺口审核，返回待补充要点列表。
 *
 * @throws TOPIC_MISSING_INPUT | MATERIAL_MIN_ENTRIES
 */
export async function recommendTier6(params: RecommendTier6Params): Promise<TopicPick[]> {
  assertSectionsForTier5(params.sections);

  const polishedTemplateInstanceSummaries = sectionsToPolishedEventSummaries(params.sections);
  const { system, userTemplate } = loadGapPrompt();
  const pipelineJson = JSON.stringify({ polishedTemplateInstanceSummaries }, null, 2);
  const userContent = userTemplate.replace("{{PIPELINE_JSON}}", pipelineJson);
  const parsed = await chatJson<unknown>([
    { role: "system", content: system },
    { role: "user", content: userContent },
  ]);
  const missingPoints = parseGapAudit(parsed);

  return missingPoints.map((text) => ({
    tier: 6 as const,
    kind: "material_gap" as const,
    title: text,
    reason: MATERIAL_GAP_REASON,
  }));
}
