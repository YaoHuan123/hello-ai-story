import fs from "node:fs";
import path from "node:path";

const PROMPT_FILE = path.join(__dirname, "..", "..", "..", "prompts", "interview", "emotional-inner.md");

let cache: { system: string; userTemplate: string } | null = null;

export function loadInnerPrompt(): { system: string; userTemplate: string } {
  if (cache) return cache;
  const raw = fs.readFileSync(PROMPT_FILE, "utf-8").replace(/\r\n/g, "\n");
  const marker = "\n## User\n";
  const i = raw.indexOf(marker);
  if (i < 0) throw new Error("PROMPT_INVALID: emotional-inner.md 缺少 ## User 段");
  const system = raw.slice(0, i).trim();
  const userTemplate = raw.slice(i + marker.length).trim();
  if (!userTemplate.includes("{{PIPELINE_JSON}}")) {
    throw new Error("PROMPT_INVALID: emotional-inner.md 缺少 {{PIPELINE_JSON}}");
  }
  cache = { system, userTemplate };
  return cache;
}
