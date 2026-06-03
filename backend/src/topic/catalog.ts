import fs from "node:fs";
import path from "node:path";

/**
 * 话题配置模板（大类 → 子类）。与前端表单共用同一份：
 * `frontend/public/template-config.v2.json`。
 * 本文件位于 backend/src/topic 或编译后 backend/dist/topic，向上三级即仓库根。
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

/** `template-config.v2.json` 中本模块关心的最小结构（其余字段忽略）。 */
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

/** 进程级缓存：配置模板只读一次。 */
let cache: Topic[] | null = null;

/** 子类名 → 合并后的字段 key 列表（required + optional，不区分）。 */
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

/**
 * 加载全部可选话题（排除 basic 基本信息大类，那是档案不是话题）。
 *
 * 结果进程级缓存；配置缺失 categories 或无任何话题时抛错，不静默返回空。
 *
 * @returns 扁平化的话题列表（大类 × 子类）
 * @throws CATALOG_INVALID 配置缺少 categories；CATALOG_EMPTY 无可选话题
 */
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
 * 按子类名取配置模板中的字段 key（required + optional 合并，不区分）。
 *
 * @param name 子类显示名（全局唯一，与 {@link Topic.name} 一致）
 * @returns 字段 key 列表（可能为空数组）
 * @throws CATALOG_TOPIC_NOT_FOUND 配置中无该子类
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
