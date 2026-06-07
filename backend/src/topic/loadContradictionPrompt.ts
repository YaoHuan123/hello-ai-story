import fs from "node:fs";
import { resolvePromptFilePath } from "../content/promptPath";

let cached: { system: string; userTemplate: string } | null = null;

/** 加载矛盾检测提示词（`## User` 分隔，含 `{{PIPELINE_JSON}}`）。 */
export function loadContradictionPrompt(): { system: string; userTemplate: string } {
  if (cached) return cached;

  const filePath = resolvePromptFilePath("preprocess", "contradiction.md");
  const raw = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const marker = "\n## User\n";
  const i = raw.indexOf(marker);
  if (i < 0) {
    throw new Error("PROMPT_INVALID: contradiction.md 缺少 ## User 段");
  }
  const system = raw.slice(0, i).trim();
  const userTemplate = raw.slice(i + marker.length).trim();
  if (!userTemplate.includes("{{PIPELINE_JSON}}")) {
    throw new Error("PROMPT_INVALID: contradiction.md 缺少 {{PIPELINE_JSON}}");
  }
  cached = { system, userTemplate };
  return cached;
}
