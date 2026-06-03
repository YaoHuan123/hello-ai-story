import fs from "node:fs";
import path from "node:path";

/**
 * 话题配置模板（大类 → 子类）。与前端表单共用同一份：
 * `frontend/public/template-config.v2.json`。
 */
const CATALOG_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "frontend",
  "public",
  "template-config.v2.json",
);

/** 一个可供选题的话题，即配置模板中各大类下的子类展开后的一项。 */
export type Topic = {
  /** 子类显示名（如「小学」），全局唯一，LLM 按此名作答 */
  name: string;
};

type RawField = { key: string };

type RawCatalog = {
  categories: Array<{
    id: string;
    name: string;
    subCategories: Array<{
      name: string;
      required?: RawField[];
      optional?: RawField[];
    }>;
  }>;
};

let cache: Topic[] | null = null;
let fieldKeysCache: Map<string, string[]> | null = null;

function buildFieldKeysCache(): Map<string, string[]> {
  const raw = fs.readFileSync(CATALOG_PATH, "utf-8");
  const parsed = JSON.parse(raw) as RawCatalog;
  const map = new Map<string, string[]>();
  for (const c of parsed.categories ?? []) {
    for (const sc of c.subCategories ?? []) {
      const keys: string[] = [];
      for (const f of [...(sc.required ?? []), ...(sc.optional ?? [])]) {
        if (typeof f.key === "string" && f.key.trim()) {
          keys.push(f.key.trim());
        }
      }
      map.set(sc.name, keys);
    }
  }
  return map;
}

export function loadTopics(): Topic[] {
  if (cache) return cache;
  const raw = fs.readFileSync(CATALOG_PATH, "utf-8");
  const parsed = JSON.parse(raw) as RawCatalog;
  if (!Array.isArray(parsed.categories) || parsed.categories.length === 0) {
    throw new Error("CATALOG_INVALID: template-config.v2.json 缺少 categories");
  }
  const topics: Topic[] = [];
  for (const c of parsed.categories) {
    if (c.id === "basic") continue;
    for (const sc of c.subCategories ?? []) {
      topics.push({ name: sc.name });
    }
  }
  if (topics.length === 0) {
    throw new Error("CATALOG_EMPTY: 配置模板中无可选话题");
  }
  cache = topics;
  return topics;
}

/**
 * 选题接口 2（catalog）组装 `QuestionSet.questions` 时使用。
 *
 * @throws CATALOG_TOPIC_NOT_FOUND
 */
export function getTopicFieldKeys(name: string): string[] {
  if (!fieldKeysCache) {
    fieldKeysCache = buildFieldKeysCache();
  }
  const keys = fieldKeysCache.get(name);
  if (keys === undefined) {
    throw new Error(`CATALOG_TOPIC_NOT_FOUND: 未找到话题「${name}」`);
  }
  return keys;
}
