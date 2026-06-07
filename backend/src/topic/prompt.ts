import fs from "node:fs";
import { resolvePromptFilePath } from "../content/promptPath";

const TIER1_FILE = "sub-category-gating.md";
const TIER2_FILE = "topic-pick-tier2.md";
const TIER3_FILE = "topic-pick-tier3.md";
const TIER4_FILE = "hot-topic-questions.md";

const cache = new Map<string, { system: string; userTemplate: string }>();

/**
 * 加载选题提示词：以 `## User` 分隔 system 与 user 模板。
 *
 * @param filename `prompts/interview/` 下的文件名
 * @throws PROMPT_INVALID 缺少 `## User` 段或 `{{INPUT_JSON}}` 占位
 */
export function loadTopicPrompt(filename: string): { system: string; userTemplate: string } {
  const cacheKey = filename;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const filePath = resolvePromptFilePath("interview", filename);
  const raw = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const marker = "\n## User\n";
  const i = raw.indexOf(marker);
  if (i < 0) {
    throw new Error(`PROMPT_INVALID: ${filename} 缺少 ## User 段`);
  }
  const system = raw.slice(0, i).trim();
  const userTemplate = raw.slice(i + marker.length).trim();
  if (!userTemplate.includes("{{INPUT_JSON}}")) {
    throw new Error(`PROMPT_INVALID: ${filename} 的 User 段缺少 {{INPUT_JSON}}`);
  }
  const parsed = { system, userTemplate };
  cache.set(cacheKey, parsed);
  return parsed;
}

/** Tier1：自动推荐单个最值得立刻问的话题。 */
export function loadTier1Prompt(): { system: string; userTemplate: string } {
  return loadTopicPrompt(TIER1_FILE);
}

/** Tier2：列出 1～6 个候选话题供用户点选。 */
export function loadTier2Prompt(): { system: string; userTemplate: string } {
  return loadTopicPrompt(TIER2_FILE);
}

/** Tier3：列出 1～10 个 AI 创意主题供用户点选。 */
export function loadTier3Prompt(): { system: string; userTemplate: string } {
  return loadTopicPrompt(TIER3_FILE);
}

/** Tier4：列出 1～6 条生活记忆热点开放问句供用户点选。 */
export function loadTier4Prompt(): { system: string; userTemplate: string } {
  return loadTopicPrompt(TIER4_FILE);
}

/** @deprecated 使用 {@link loadTier1Prompt} */
export function loadGatingPrompt(): { system: string; userTemplate: string } {
  return loadTier1Prompt();
}
