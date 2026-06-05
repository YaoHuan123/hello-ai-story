import fs from "node:fs";
import path from "node:path";

/** 仓库根 `prompts/create-video`（dist 下 __dirname 为 backend/dist/video/shared/llm，向上 5 级到 repo 根）。 */
const DEFAULT_PROMPT_ROOT = path.join(__dirname, "..", "..", "..", "..", "..", "prompts", "create-video");

function promptRoot(): string {
  const override = (process.env.VIDEO_PROMPT_ROOT ?? "").trim();
  return override || DEFAULT_PROMPT_ROOT;
}

const cache = new Map<string, { systemText: string; userSuffix: string }>();

/** User 段只保留 `{{PIPELINE_JSON}}` 占位符附近正文；Schema 附录留在 md 文件供维护，不发给模型。 */
export function stripUserSuffixSchemaAppendix(userSuffix: string): string {
  const markers = [
    "\n---\n\n## 输出 JSON Schema",
    "\n---\n## 输出 JSON Schema",
    "\n## 输出 JSON Schema",
  ];
  for (const marker of markers) {
    const i = userSuffix.indexOf(marker);
    if (i >= 0) {
      return userSuffix.slice(0, i).trim();
    }
  }
  return userSuffix.trim();
}

/**
 * 解析 `prompts/create-video/` 下提示词文件的绝对路径。
 * @param basename 如 `step-20_era-backdrop-segments.md` 或 `create-video/era-100_...`
 */
export function resolveVideoPromptPath(basename: string): string {
  const segments = basename.split("/").filter(Boolean);
  const file = segments[segments.length - 1] ?? basename;
  return path.join(promptRoot(), file);
}

/**
 * 加载传记成片 LLM 提示词：`## User` 分段，user 段须含 `{{PIPELINE_JSON}}`。
 */
export function loadVideoPromptParts(
  basename: string,
  placeholder = "{{PIPELINE_JSON}}",
): { systemText: string; userSuffix: string } {
  const cacheKey = `${basename}\0${placeholder}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const filePath = resolveVideoPromptPath(basename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`VIDEO_PROMPT_NOT_FOUND: ${basename}（期望路径 ${filePath}）`);
  }

  let raw = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const marker = "\n## User\n";
  const i = raw.indexOf(marker);
  if (i < 0) {
    throw new Error(`VIDEO_PROMPT_INVALID: ${basename} 缺少 ## User 分段`);
  }
  const systemText = raw.slice(0, i).trim();
  const userSuffixRaw = raw.slice(i + marker.length).trim();
  if (!userSuffixRaw.includes(placeholder)) {
    throw new Error(`VIDEO_PROMPT_INVALID: ${basename} 的 User 段缺少 ${placeholder}`);
  }
  const userSuffix = stripUserSuffixSchemaAppendix(userSuffixRaw);

  const parsed = { systemText, userSuffix };
  cache.set(cacheKey, parsed);
  return parsed;
}
