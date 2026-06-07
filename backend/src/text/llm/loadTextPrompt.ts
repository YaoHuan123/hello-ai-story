import fs from "node:fs";
import { resolvePromptFilePath } from "../../content/promptPath.js";
import { stripUserSuffixSchemaAppendix } from "../../video/shared/llm/loadPrompt.js";

const cache = new Map<string, { systemText: string; userSuffix: string }>();

/** 加载 `prompts/create-text/` 提示词：`## System` / `## User` 分段；Schema 附录不发给模型。 */
export function loadTextPromptParts(
  basename: string,
  placeholder = "{{PIPELINE_JSON}}",
): { systemText: string; userSuffix: string } {
  const cacheKey = `${basename}\0${placeholder}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const file = basename.split("/").filter(Boolean).pop() ?? basename;
  const filePath = resolvePromptFilePath("create-text", file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`TEXT_PROMPT_NOT_FOUND: ${basename}（期望路径 ${filePath}）`);
  }

  let raw = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const marker = "\n## User\n";
  const i = raw.indexOf(marker);
  if (i < 0) {
    throw new Error(`TEXT_PROMPT_INVALID: ${basename} 缺少 ## User 分段`);
  }
  const systemText = raw.slice(0, i).trim();
  const userSuffixRaw = raw.slice(i + marker.length).trim();
  if (!userSuffixRaw.includes(placeholder)) {
    throw new Error(`TEXT_PROMPT_INVALID: ${basename} 的 User 段缺少 ${placeholder}`);
  }
  const userSuffix = stripUserSuffixSchemaAppendix(userSuffixRaw);

  const parsed = { systemText, userSuffix };
  cache.set(cacheKey, parsed);
  return parsed;
}
