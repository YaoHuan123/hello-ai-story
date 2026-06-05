/**
 * 文生图发 API 前：按词库对文本做子串替换。
 */
import fs from "node:fs";
import path from "node:path";

export type Text2imgSensitiveRule = { from: string; to: string };

function backendRootFromThisFile(): string {
  return path.join(__dirname, "..", "..", "..");
}

function defaultLexiconPath(): string {
  return path.join(backendRootFromThisFile(), "config", "text2img-sensitive-replacements.json");
}

function resolveLexiconPath(): string {
  const override = (process.env.TEXT2IMG_SENSITIVE_REPLACEMENTS_FILE ?? "").trim();
  if (!override) return defaultLexiconPath();
  if (path.isAbsolute(override)) return path.normalize(override);
  return path.resolve(path.join(backendRootFromThisFile(), override));
}

function loadRules(): Text2imgSensitiveRule[] {
  const p = resolveLexiconPath();
  if (!fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    const out: Text2imgSensitiveRule[] = [];
    for (const item of j) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      const from = typeof o.from === "string" ? o.from : "";
      const to = typeof o.to === "string" ? o.to : "";
      if (!from) continue;
      out.push({ from, to });
    }
    return out.sort((a, b) => b.from.length - a.from.length);
  } catch {
    return [];
  }
}

let rulesMemo: Text2imgSensitiveRule[] | undefined;

export function applyText2imgSensitiveReplacements(input: string): string {
  if (rulesMemo === undefined) rulesMemo = loadRules();
  if (rulesMemo.length === 0) return input;
  let s = input;
  for (const { from, to } of rulesMemo) {
    s = s.split(from).join(to);
  }
  return s;
}
