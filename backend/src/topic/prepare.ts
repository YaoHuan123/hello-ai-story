import { loadTopics, type Topic } from "./catalog";
import type { RecommendTierParams } from "./types";

/**
 * 校验入参并加载配置模板候选话题。
 *
 * @throws TOPIC_MISSING_INPUT sections 为空
 * @throws TOPIC_NO_CANDIDATE 配置模板无候选
 */
export function prepareCandidates(params: RecommendTierParams): {
  candidates: Topic[];
  input: { sections: RecommendTierParams["sections"]; topics: string[] };
} {
  if (!params.sections || params.sections.length === 0) {
    throw new Error("TOPIC_MISSING_INPUT: sections 为空（请先填写基本信息）");
  }

  const candidates = loadTopics();
  if (candidates.length === 0) {
    throw new Error("TOPIC_NO_CANDIDATE: 无剩余可选话题");
  }

  return {
    candidates,
    input: {
      sections: params.sections,
      topics: candidates.map((t) => t.name),
    },
  };
}
