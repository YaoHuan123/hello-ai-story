import fs from "node:fs";
import path from "node:path";
import { resolveFieldMeta, type TopicFieldMeta } from "./fieldMeta";

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

type RawField = { key: string; control?: string };

type RawCatalog = {
  fieldOptions?: Record<string, string[]>;
  categories: Array<{
    id: string;
    name: string;
    subCategories: Array<{
      id?: string;
      name: string;
      required?: RawField[];
      optional?: RawField[];
    }>;
  }>;
};

type FieldDef = {
  control: string;
  subCategoryId: string;
};

let cache: Topic[] | null = null;
let fieldKeysCache: Map<string, string[]> | null = null;
let fieldDefsCache: Map<string, Map<string, FieldDef>> | null = null;
let fieldOptionsCache: Record<string, string[]> | null = null;

function loadRawCatalog(): RawCatalog {
  const raw = fs.readFileSync(CATALOG_PATH, "utf-8");
  return JSON.parse(raw) as RawCatalog;
}

function buildFieldCaches(): {
  keys: Map<string, string[]>;
  defs: Map<string, Map<string, FieldDef>>;
  fieldOptions: Record<string, string[]>;
} {
  const parsed = loadRawCatalog();
  const keys = new Map<string, string[]>();
  const defs = new Map<string, Map<string, FieldDef>>();
  const fieldOptions = parsed.fieldOptions ?? {};

  for (const c of parsed.categories ?? []) {
    for (const sc of c.subCategories ?? []) {
      const topicName = sc.name;
      const subCategoryId = (sc.id ?? topicName).trim();
      const fieldKeys: string[] = [];
      const fieldMap = new Map<string, FieldDef>();

      for (const f of [...(sc.required ?? []), ...(sc.optional ?? [])]) {
        if (typeof f.key !== "string" || !f.key.trim()) continue;
        const key = f.key.trim();
        fieldKeys.push(key);
        fieldMap.set(key, {
          control: typeof f.control === "string" && f.control.trim() ? f.control.trim() : "text",
          subCategoryId,
        });
      }

      keys.set(topicName, fieldKeys);
      defs.set(topicName, fieldMap);
    }
  }

  return { keys, defs, fieldOptions };
}

function ensureFieldCaches(): void {
  if (fieldKeysCache && fieldDefsCache && fieldOptionsCache) return;
  const built = buildFieldCaches();
  fieldKeysCache = built.keys;
  fieldDefsCache = built.defs;
  fieldOptionsCache = built.fieldOptions;
}

export function loadTopics(): Topic[] {
  if (cache) return cache;
  const parsed = loadRawCatalog();
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
  ensureFieldCaches();
  const keys = fieldKeysCache!.get(name);
  if (keys === undefined) {
    throw new Error(`CATALOG_TOPIC_NOT_FOUND: 未找到话题「${name}」`);
  }
  return keys;
}

/**
 * 按话题名 + 字段 key 取访谈控件元数据（fieldType / fieldChoices）。
 * 扩展题等不在 catalog 中的 key 返回 undefined。
 */
export function getTopicFieldMeta(topicName: string, fieldKey: string): TopicFieldMeta | undefined {
  ensureFieldCaches();
  const def = fieldDefsCache!.get(topicName)?.get(fieldKey.trim());
  if (!def) return undefined;
  return resolveFieldMeta(def.control, def.subCategoryId, fieldOptionsCache!);
}
