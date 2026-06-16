import { loadTopics, resolveCanonicalTopicName, type Topic } from "./catalog";
import type { RecommendTierParams } from "./types";

function answeredCatalogTopicNames(sections: RecommendTierParams["sections"]): Set<string> {
  const answered = new Set<string>();
  for (const sec of sections) {
    try {
      answered.add(resolveCanonicalTopicName(sec.name.trim()));
    } catch {
      /* 非 catalog 节（如 generated / tier5 summary）不计入 */
    }
  }
  return answered;
}

/**
 * 校验入参并加载配置模板候选话题（排除 sections 中已答 catalog 节）。
 *
 * @throws TOPIC_MISSING_INPUT sections 为空
 * @throws TOPIC_NO_CANDIDATE 无剩余 catalog 候选
 */
export function prepareCandidates(params: RecommendTierParams): {
  candidates: Topic[];
  input: { sections: RecommendTierParams["sections"]; topics: string[] };
} {
  if (!params.sections || params.sections.length === 0) {
    throw new Error("TOPIC_MISSING_INPUT: sections 为空（请先填写基本信息）");
  }

  const answered = answeredCatalogTopicNames(params.sections);
  const candidates = loadTopics().filter((t) => !answered.has(t.name));
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
