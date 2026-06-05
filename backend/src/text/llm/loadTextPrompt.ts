import fs from "node:fs";
import path from "node:path";
import { stripUserSuffixSchemaAppendix } from "../../video/shared/llm/loadPrompt.js";

const cache = new Map<string, { systemText: string; userSuffix: string }>();

/** 仓库根 `prompts/create-text`（dist 下 __dirname 为 backend/dist/text/llm，向上 4 级到 repo 根）。 */
const DEFAULT_TEXT_PROMPT_ROOT = path.join(__dirname, "..", "..", "..", "..", "prompts", "create-text");

function textPromptRoot(): string {
  const override = (process.env.TEXT_PROMPT_ROOT ?? "").trim();
  if (override) return override;
  return DEFAULT_TEXT_PROMPT_ROOT;
}

function resolveTextPromptPath(basename: string): string {
  const file = basename.split("/").filter(Boolean).pop() ?? basename;
  return path.join(textPromptRoot(), file);
}

/** 加载 `prompts/create-text/` 提示词：`## System` / `## User` 分段；Schema 附录不发给模型。 */
export function loadTextPromptParts(
  basename: string,
  placeholder = "{{PIPELINE_JSON}}",
): { systemText: string; userSuffix: string } {
  const cacheKey = `${basename}\0${placeholder}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const filePath = resolveTextPromptPath(basename);
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
