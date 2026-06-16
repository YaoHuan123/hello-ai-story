import fs from "node:fs";
import path from "node:path";
import { chatJson } from "../../topic/llm";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import { getInterviewRootDir } from "../../services/interviewWorkspace.service";
import type { DisplayLocale } from "../displayLocale";

const CACHE_FILE = "display-translate-cache.json";
const MAX_BATCH = 24;

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

const ZH2EN_CACHE_PREFIX = "zh2en:";

export function needsEnToZhTranslation(text: string, locale: DisplayLocale): boolean {
  if (locale !== "zh") return false;
  const t = text.trim();
  if (!t) return false;
  return !hasCjk(t);
}

export function needsZhToEnTranslation(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return hasCjk(t);
}

function cachePath(scope: InterviewScope): string {
  return path.join(getInterviewRootDir(scope), CACHE_FILE);
}

function readCache(scope: InterviewScope): Record<string, string> {
  const p = cachePath(scope);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeCache(scope: InterviewScope, cache: Record<string, string>): void {
  const p = cachePath(scope);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2), "utf-8");
}

type TranslateBatchOutput = {
  items?: Array<{ en?: string; zh?: string }>;
  error?: string;
};

async function fetchTranslations(unique: string[]): Promise<Record<string, string>> {
  const out = await chatJson<TranslateBatchOutput>([
    {
      role: "system",
      content: [
        "Translate English UI strings to natural conversational Chinese for a biography interview app.",
        'Output strict JSON: { "items": [{ "en": "<exact input>", "zh": "<translation>" }] }.',
        "Keep proper nouns; do not invent facts. One item per distinct input string.",
      ].join(" "),
    },
    { role: "user", content: JSON.stringify({ strings: unique }) },
  ]);
  if (out.error) {
    throw new Error(`DISPLAY_TRANSLATE_INVALID: ${out.error}`);
  }
  const mapped: Record<string, string> = {};
  for (const row of out.items ?? []) {
    const en = String(row.en ?? "").trim();
    const zh = String(row.zh ?? "").trim();
    if (en && zh) mapped[en] = zh;
  }
  return mapped;
}

/**
 * 将英文 canonical 文案批量译为中文展示；命中采访级文件缓存，未命中时单次 LLM 批量请求。
 */
export async function translateTextsForDisplay(
  scope: InterviewScope,
  texts: readonly string[],
  locale: DisplayLocale,
): Promise<string[]> {
  if (locale !== "zh") return [...texts];

  const cache = readCache(scope);
  const results = texts.map((t) => t.trim());
  const pending = new Map<string, number[]>();

  for (let i = 0; i < results.length; i++) {
    const t = results[i]!;
    if (!needsEnToZhTranslation(t, locale)) continue;
    if (cache[t]) {
      results[i] = cache[t];
      continue;
    }
    const hits = pending.get(t) ?? [];
    hits.push(i);
    pending.set(t, hits);
  }

  if (pending.size === 0) return results;

  const unique = [...pending.keys()];
  for (let offset = 0; offset < unique.length; offset += MAX_BATCH) {
    const chunk = unique.slice(offset, offset + MAX_BATCH);
    const fetched = await fetchTranslations(chunk);
    for (const [en, zh] of Object.entries(fetched)) {
      cache[en] = zh;
    }
    writeCache(scope, cache);
    for (const en of chunk) {
      const zh = cache[en] ?? en;
      for (const idx of pending.get(en) ?? []) {
        results[idx] = zh;
      }
    }
  }

  return results;
}

type ZhToEnBatchOutput = {
  items?: Array<{ zh?: string; en?: string }>;
  error?: string;
};

async function fetchZhToEnTranslations(unique: string[]): Promise<Record<string, string>> {
  const out = await chatJson<ZhToEnBatchOutput>([
    {
      role: "system",
      content: [
        "Translate Chinese biography voiceover lines into natural spoken English for text-to-speech.",
        "Preserve all dates, places, names, and facts; do not invent or omit content.",
        'Output strict JSON: { "items": [{ "zh": "<exact input>", "en": "<translation>" }] }.',
        "One item per distinct input string.",
      ].join(" "),
    },
    { role: "user", content: JSON.stringify({ strings: unique }) },
  ]);
  if (out.error) {
    throw new Error(`DISPLAY_TRANSLATE_INVALID: ${out.error}`);
  }
  const mapped: Record<string, string> = {};
  for (const row of out.items ?? []) {
    const zh = String(row.zh ?? "").trim();
    const en = String(row.en ?? "").trim();
    if (zh && en) mapped[zh] = en;
  }
  return mapped;
}

/** 中文旁白 → 英文（en_ 音色 TTS 用）；命中采访级缓存。 */
export async function translateTextsZhToEnForTts(
  scope: InterviewScope,
  texts: readonly string[],
): Promise<string[]> {
  const cache = readCache(scope);
  const results = texts.map((t) => t.trim());
  const pending = new Map<string, number[]>();

  for (let i = 0; i < results.length; i++) {
    const t = results[i]!;
    if (!needsZhToEnTranslation(t)) continue;
    const cacheKey = ZH2EN_CACHE_PREFIX + t;
    if (cache[cacheKey]) {
      results[i] = cache[cacheKey];
      continue;
    }
    const hits = pending.get(t) ?? [];
    hits.push(i);
    pending.set(t, hits);
  }

  if (pending.size === 0) return results;

  const unique = [...pending.keys()];
  for (let offset = 0; offset < unique.length; offset += MAX_BATCH) {
    const chunk = unique.slice(offset, offset + MAX_BATCH);
    const fetched = await fetchZhToEnTranslations(chunk);
    for (const [zh, en] of Object.entries(fetched)) {
      cache[ZH2EN_CACHE_PREFIX + zh] = en;
    }
    writeCache(scope, cache);
    for (const zh of chunk) {
      const en = cache[ZH2EN_CACHE_PREFIX + zh] ?? zh;
      for (const idx of pending.get(zh) ?? []) {
        results[idx] = en;
      }
    }
  }

  return results;
}

/** 从 en→zh 展示缓存反查 canonical 英文（选题提交用）。 */
export function lookupCanonicalEnFromDisplayCache(
  scope: InterviewScope,
  displayZh: string,
): string | undefined {
  const zh = displayZh.trim();
  if (!zh) return undefined;
  const cache = readCache(scope);
  for (const [en, cachedZh] of Object.entries(cache)) {
    if (en.startsWith(ZH2EN_CACHE_PREFIX)) continue;
    if (cachedZh === zh) return en;
  }
  return undefined;
}

type TranslateArticleOutput = {
  zh?: string;
  error?: string;
};

async function fetchArticleTranslation(article: string): Promise<string> {
  const out = await chatJson<TranslateArticleOutput>([
    {
      role: "system",
      content: [
        "Translate a formal first-person English biography article into natural, publishable Chinese.",
        "Preserve all facts, names, dates, relationships, and paragraph structure; do not invent or omit content.",
        'Output strict JSON: { "zh": "<full Chinese article>" }.',
      ].join(" "),
    },
    { role: "user", content: JSON.stringify({ article }) },
  ]);
  if (out.error) {
    throw new Error(`DISPLAY_TRANSLATE_INVALID: ${out.error}`);
  }
  const zh = String(out.zh ?? "").trim();
  if (!zh) {
    throw new Error("DISPLAY_TRANSLATE_INVALID: empty article translation");
  }
  return zh;
}

/**
 * 将 canonical 英文正式文章译为中文展示；命中采访级 `display-translate-cache.json`。
 */
export async function translateArticleForDisplay(
  scope: InterviewScope,
  article: string,
  locale: DisplayLocale,
): Promise<string> {
  if (locale !== "zh") return article;
  const t = article.trim();
  if (!t || !needsEnToZhTranslation(t, locale)) return article;

  const cache = readCache(scope);
  if (cache[t]) return cache[t];

  const zh = await fetchArticleTranslation(t);
  cache[t] = zh;
  writeCache(scope, cache);
  return zh;
}
