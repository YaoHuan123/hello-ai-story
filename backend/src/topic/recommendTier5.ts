import { chatJson } from "./llm";
import { buildContradictionQuestion } from "./contradictionQuestion";
import { toPendingRow } from "./pendingPickRow";
import { parseFactContradictions } from "./parseContradiction";
import { loadContradictionPrompt } from "./loadContradictionPrompt";
import {
  assertSectionsForTier5,
  sectionsToPolishedEventSummaries,
} from "./sectionsInput";
import type { AnsweredSection, PendingPickRow } from "./types";

/** Tier5 选题入参：使用调用方传入的 `sections`（结果由 service 写入 tier5.json）。 */
export type RecommendTier5Params = {
  sections: AnsweredSection[];
};

/**
 * Tier5：根据 `sections` 调 LLM 检测矛盾，返回待用户确认项。
 *
 * 题面写入 row 的 `questions`（各节摘录 + 请说明），无 `contradictionId` / `involvedIds`。
 *
 * @throws TOPIC_MISSING_INPUT | MATERIAL_MIN_ENTRIES
 */
export async function recommendTier5(params: RecommendTier5Params): Promise<PendingPickRow[]> {
  assertSectionsForTier5(params.sections);

  const polishedEventSummaries = sectionsToPolishedEventSummaries(params.sections);
  const ids = Object.keys(polishedEventSummaries);
  if (ids.length < 2) {
    return [];
  }

  const { system, userTemplate } = loadContradictionPrompt();
  const pipelineJson = JSON.stringify({ polishedEventSummaries }, null, 2);
  const userContent = userTemplate.replace("{{PIPELINE_JSON}}", pipelineJson);
  const parsed = await chatJson<unknown>([
    { role: "system", content: system },
    { role: "user", content: userContent },
  ]);
  const raw = parseFactContradictions(parsed, new Set(ids));

  return raw
    .filter((c) => c.needsUserFix === "yes" || c.needsUserFix === "maybe")
    .map((c) =>
      toPendingRow(
        {
          tier: 5,
          kind: "material_contradiction",
          title: c.summary,
          reason: `涉及 ${c.involvedIds.length} 个已填节，待您说明`,
        },
        {
          questions: [buildContradictionQuestion(c, polishedEventSummaries)],
          suggestedAnswers:
            c.reconciliationHypotheses.length > 0 ? c.reconciliationHypotheses : undefined,
        },
      ),
    );
}
