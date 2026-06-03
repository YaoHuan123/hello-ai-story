import { mapPickRow } from "./parse";
import { prepareCandidates } from "./prepare";
import { loadTier1Prompt } from "./prompt";
import { chatJson } from "./llm";
import type { RecommendTierParams, TopicRecommendation } from "./types";

export type { AnsweredSection, TopicRecommendation, GatingConfidence } from "./types";

type Tier1LlmOutput = {
  error?: string;
  pick?: { name?: string; confidence?: string; reason?: string };
};

/**
 * Tier1：从配置模板加载候选，调用 LLM 返回**单个**自动推荐话题。
 *
 * 适用于有一条明显领先、可立刻开章的场景；若需用户点选列表请用 {@link recommendTier2}。
 *
 * @throws TOPIC_MISSING_INPUT | TOPIC_NO_CANDIDATE | TOPIC_LLM_INVALID
 */
export async function recommendTier1(
  params: RecommendTierParams,
): Promise<TopicRecommendation> {
  const { candidates, input } = prepareCandidates(params);
  const { system, userTemplate } = loadTier1Prompt();
  const userContent = userTemplate.replace("{{INPUT_JSON}}", JSON.stringify(input));

  const out = await chatJson<Tier1LlmOutput>([
    { role: "system", content: system },
    { role: "user", content: userContent },
  ]);

  if (out.error) {
    throw new Error(`TOPIC_LLM_INVALID: 模型返回错误：${out.error}`);
  }
  if (!out.pick) {
    throw new Error("TOPIC_LLM_INVALID: 模型未返回 pick");
  }

  return mapPickRow(candidates, out.pick, "pick");
}
