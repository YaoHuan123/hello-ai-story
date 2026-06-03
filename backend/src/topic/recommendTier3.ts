import { mapGeneratedPickRow } from "./parse";
import { loadTier3Prompt } from "./prompt";
import { chatJson } from "./llm";
import type { GeneratedTopicPick, RecommendTier3Params } from "./types";

const TIER3_MAX_PICKS = 10;
const TIER3_MIN_PICKS = 1;

type Tier3LlmOutput = {
  error?: string;
  picks?: Array<{ title?: string; reason?: string; questions?: unknown }>;
};

function assertSections(sections: RecommendTier3Params["sections"]): void {
  if (!sections || sections.length === 0) {
    throw new Error("TOPIC_MISSING_INPUT: sections 为空（请先填写基本信息）");
  }
}

/**
 * Tier3：根据已填 `sections` 调用 LLM，返回 **1～maxPicks 条** AI 创意主题。
 *
 * 不读配置模板候选；适用于 catalog 话题已耗尽或需补充非模板角度时。
 * 用户选中某条后，用返回的 `questions` 引导访谈。
 *
 * @param params.maxPicks 默认 10
 * @throws TOPIC_MISSING_INPUT | TOPIC_LLM_INVALID
 */
export async function recommendTier3(
  params: RecommendTier3Params,
): Promise<GeneratedTopicPick[]> {
  assertSections(params.sections);

  const maxPicks = Math.min(
    TIER3_MAX_PICKS,
    Math.max(TIER3_MIN_PICKS, params.maxPicks ?? TIER3_MAX_PICKS),
  );

  const input = { sections: params.sections, maxPicks };
  const { system, userTemplate } = loadTier3Prompt();
  const userContent = userTemplate.replace("{{INPUT_JSON}}", JSON.stringify(input));

  const out = await chatJson<Tier3LlmOutput>([
    { role: "system", content: system },
    { role: "user", content: userContent },
  ]);

  if (out.error) {
    throw new Error(`TOPIC_LLM_INVALID: 模型返回错误：${out.error}`);
  }
  const rows = Array.isArray(out.picks) ? out.picks : [];
  if (rows.length < TIER3_MIN_PICKS || rows.length > maxPicks) {
    throw new Error(
      `TOPIC_LLM_INVALID: Tier3 须 ${TIER3_MIN_PICKS}～${maxPicks} 条，实际 ${rows.length} 条`,
    );
  }

  const seen = new Set<string>();
  const result: GeneratedTopicPick[] = [];
  for (let i = 0; i < rows.length; i++) {
    const item = mapGeneratedPickRow(rows[i], `picks[${i}]`);
    if (seen.has(item.title)) {
      throw new Error(`TOPIC_LLM_INVALID: picks 重复标题「${item.title}」`);
    }
    seen.add(item.title);
    result.push(item);
  }
  return result;
}
