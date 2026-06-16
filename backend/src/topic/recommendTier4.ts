import { hotTopicMapForPrompt } from "./hotTopicMap";
import { mapHotTopicRow } from "./parse";
import { loadTier4Prompt } from "./prompt";
import { chatJson } from "./llm";
import { topicInputLlmMessages } from "./localeLlm";
import type { HotTopicPick, RecommendTier4Params } from "./types";

const TIER4_MAX_PICKS = 6;
const TIER4_MIN_PICKS = 1;

type Tier4LlmOutput = {
  error?: string;
  questions?: Array<{
    domainId?: string;
    domainName?: string;
    q?: string;
    suggestedAnswers?: unknown;
  }>;
};

function assertSections(sections: RecommendTier4Params["sections"]): void {
  if (!sections || sections.length === 0) {
    throw new Error("TOPIC_MISSING_INPUT: sections 为空（请先填写基本信息）");
  }
}

/**
 * Tier4：根据已填 `sections` 与生活记忆 `topicMap`，调用 LLM 返回 **1～maxPicks 条**热点开放问句。
 *
 * 用户点选的是问句本身（`q`），不是 catalog 子类名。
 *
 * @param params.maxPicks 默认 6
 * @throws TOPIC_MISSING_INPUT | TOPIC_LLM_INVALID
 */
export async function recommendTier4(
  params: RecommendTier4Params,
): Promise<HotTopicPick[]> {
  assertSections(params.sections);

  const maxPicks = Math.min(
    TIER4_MAX_PICKS,
    Math.max(TIER4_MIN_PICKS, params.maxPicks ?? TIER4_MAX_PICKS),
  );

  const input = {
    sections: params.sections,
    topicMap: hotTopicMapForPrompt(),
    maxPicks,
  };

  const { system, userTemplate } = loadTier4Prompt();
  const out = await chatJson<Tier4LlmOutput>(topicInputLlmMessages(system, userTemplate, input));

  if (out.error) {
    throw new Error(`TOPIC_LLM_INVALID: 模型返回错误：${out.error}`);
  }

  const rows = Array.isArray(out.questions) ? out.questions : [];
  if (rows.length < TIER4_MIN_PICKS || rows.length > maxPicks) {
    throw new Error(
      `TOPIC_LLM_INVALID: Tier4 须 ${TIER4_MIN_PICKS}～${maxPicks} 条，实际 ${rows.length} 条`,
    );
  }

  const seenInBatch = new Set<string>();
  const result: HotTopicPick[] = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      result.push(mapHotTopicRow(rows[i], `questions[${i}]`, seenInBatch));
    } catch {
      /* 跳过非法/重复行，避免整批作废 */
    }
  }
  if (result.length < TIER4_MIN_PICKS) {
    throw new Error(
      `TOPIC_LLM_INVALID: Tier4 有效问句不足 ${TIER4_MIN_PICKS} 条，实际 ${result.length} 条`,
    );
  }
  return result.slice(0, maxPicks);
}
