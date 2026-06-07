import path from "node:path";

const REPO_PROMPTS = path.join(__dirname, "..", "..", "..", "prompts");

/** 解析英文 canonical 提示词：`prompts/{subdir}/{file}`。 */
export function resolvePromptFilePath(subdir: string, filename: string): string {
  const base = subdir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const file = filename.split("/").filter(Boolean).pop() ?? filename;
  return path.join(REPO_PROMPTS, base, file);
}
