import { mapPickRow } from "./parse";
import { prepareCandidates } from "./prepare";
import { loadTier2Prompt } from "./prompt";
import { chatJson } from "./llm";
import type { RecommendTierParams, TopicRecommendation } from "./types";

const TIER2_MAX_PICKS = 6;
const TIER2_MIN_PICKS = 1;

type Tier2LlmOutput = {
  error?: string;
  picks?: Array<{ name?: string; confidence?: string; reason?: string }>;
};

/** Tier2 选题入参（在 {@link RecommendTierParams} 基础上可限制返回条数）。 */
export type RecommendTier2Params = RecommendTierParams & {
  /** 最多返回条数，默认 6，范围 1～6 */
  maxPicks?: number;
};

/**
 * Tier2：从配置模板加载候选，调用 LLM 返回 **1～maxPicks 条**话题供用户点选。
 *
 * 适用于多个话题都值得问、或没有唯一 high 领先项时；不自动选定单一话题。
 *
 * @param params.maxPicks 默认 6
 * @returns 按模型相关度排序的推荐列表
 * @throws TOPIC_MISSING_INPUT | TOPIC_NO_CANDIDATE | TOPIC_LLM_INVALID
 */
export async function recommendTier2(
  params: RecommendTier2Params,
): Promise<TopicRecommendation[]> {
  const maxPicks = Math.min(
    TIER2_MAX_PICKS,
    Math.max(TIER2_MIN_PICKS, params.maxPicks ?? TIER2_MAX_PICKS),
  );

  const { candidates, input } = prepareCandidates(params);
  const { system, userTemplate } = loadTier2Prompt();
  const userContent = userTemplate.replace(
    "{{INPUT_JSON}}",
    JSON.stringify({ ...input, maxPicks }),
  );

  const out = await chatJson<Tier2LlmOutput>([
    { role: "system", content: system },
    { role: "user", content: userContent },
  ]);

  if (out.error) {
    throw new Error(`TOPIC_LLM_INVALID: 模型返回错误：${out.error}`);
  }
  const rows = Array.isArray(out.picks) ? out.picks : [];
  if (rows.length < TIER2_MIN_PICKS || rows.length > maxPicks) {
    throw new Error(
      `TOPIC_LLM_INVALID: Tier2 须 ${TIER2_MIN_PICKS}～${maxPicks} 条，实际 ${rows.length} 条`,
    );
  }

  const seen = new Set<string>();
  const result: TopicRecommendation[] = [];
  for (let i = 0; i < rows.length; i++) {
    const item = mapPickRow(candidates, rows[i], `picks[${i}]`);
    if (seen.has(item.name)) {
      throw new Error(`TOPIC_LLM_INVALID: picks 重复话题「${item.name}」`);
    }
    seen.add(item.name);
    result.push(item);
  }
  return result;
}
