import fs from "node:fs";
import path from "node:path";
import type { DisplayLocale } from "./displayLocale";

export type VideoStyleDisplayFields = {
  name: string;
  badge?: string;
  positioning?: string;
  atmosphere?: string;
  suitableFor?: string;
  detailedDesc?: string;
};

type DisplayCatalogZh = {
  subCategoryNames: Record<string, string>;
  fieldKeys: Record<string, string>;
  fieldOptions: Record<string, Record<string, string>>;
  hotTopicDomains?: Record<string, string>;
  videoStyles?: Record<string, VideoStyleDisplayFields>;
  basicProfilePrompts: Record<string, string>;
};

const DISPLAY_DIR = path.join(__dirname, "..", "..", "config", "display");
const ZH_CATALOG_PATH = path.join(DISPLAY_DIR, "catalog.zh.json");

let zhCatalog: DisplayCatalogZh | null = null;

function loadZhCatalog(): DisplayCatalogZh {
  if (!zhCatalog) {
    zhCatalog = JSON.parse(fs.readFileSync(ZH_CATALOG_PATH, "utf-8")) as DisplayCatalogZh;
  }
  return zhCatalog;
}

export function getZhSubCategoryName(subCategoryId: string): string | undefined {
  return loadZhCatalog().subCategoryNames[subCategoryId];
}

export function getDisplaySubCategoryName(subCategoryId: string, locale: DisplayLocale): string | undefined {
  if (locale !== "zh") return undefined;
  return getZhSubCategoryName(subCategoryId);
}

export function getDisplayFieldKeyLabel(canonicalKey: string, locale: DisplayLocale): string | undefined {
  if (locale !== "zh") return undefined;
  return loadZhCatalog().fieldKeys[canonicalKey];
}

export function getDisplayFieldOption(
  optionsKey: string,
  canonicalValue: string,
  locale: DisplayLocale,
): string | undefined {
  if (locale !== "zh") return undefined;
  return loadZhCatalog().fieldOptions[optionsKey]?.[canonicalValue];
}

export function getDisplayBasicProfilePrompt(canonicalKey: string, locale: DisplayLocale): string | undefined {
  if (locale !== "zh") return undefined;
  return loadZhCatalog().basicProfilePrompts[canonicalKey];
}

/** zh 展示名 → subCategoryId（选题提交反查）。 */
export function getSubCategoryIdByZhDisplayName(name: string): string | undefined {
  const t = name.trim();
  if (!t) return undefined;
  for (const [id, zhName] of Object.entries(loadZhCatalog().subCategoryNames)) {
    if (zhName === t) return id;
  }
  return undefined;
}

/** zh 字段标签 → canonical field key（兼容旧落盘）。 */
export function getCanonicalFieldKeyByZhLabel(zhLabel: string): string | undefined {
  const t = zhLabel.trim();
  if (!t) return undefined;
  for (const [canonical, zh] of Object.entries(loadZhCatalog().fieldKeys)) {
    if (zh === t) return canonical;
  }
  return undefined;
}

/** canonical 选项值 → 中文展示（遍历 fieldOptions，用于聊天历史答案）。 */
export function getDisplayHotTopicDomainName(domainId: string, locale: DisplayLocale): string | undefined {
  if (locale !== "zh") return undefined;
  return loadZhCatalog().hotTopicDomains?.[domainId];
}

/** 视频风格 id → 中文展示字段（`GET /api/production/video-styles`）。 */
export function getDisplayVideoStyleFields(
  styleId: string,
  locale: DisplayLocale,
): VideoStyleDisplayFields | undefined {
  if (locale !== "zh") return undefined;
  return loadZhCatalog().videoStyles?.[styleId.trim()];
}

export function getDisplayOptionByCanonicalValue(
  canonicalValue: string,
  locale: DisplayLocale,
): string | undefined {
  if (locale !== "zh") return undefined;
  const v = canonicalValue.trim();
  for (const map of Object.values(loadZhCatalog().fieldOptions)) {
    const zh = map[v];
    if (zh) return zh;
  }
  return undefined;
}
