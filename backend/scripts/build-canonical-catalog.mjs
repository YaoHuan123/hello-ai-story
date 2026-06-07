/**
 * Build English canonical template + zh display catalog from v2 + en overrides.
 * Run: node backend/scripts/build-canonical-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const ZH_PATH = path.join(ROOT, "frontend", "public", "template-config.v2.json");
const EN_OVERRIDES_PATH = path.join(ROOT, "frontend", "public", "template-config.en.overrides.json");
const FIELD_MAP_PATH = path.join(ROOT, "backend", "config", "display", "field-keys.zh-to-canonical.json");
const CANONICAL_OUT = path.join(ROOT, "frontend", "public", "template-config.canonical.json");
const DISPLAY_ZH_OUT = path.join(ROOT, "backend", "config", "display", "catalog.zh.json");

const zh = JSON.parse(fs.readFileSync(ZH_PATH, "utf-8"));
const enOverrides = fs.existsSync(EN_OVERRIDES_PATH)
  ? JSON.parse(fs.readFileSync(EN_OVERRIDES_PATH, "utf-8"))
  : {};
const fieldZhToCanonical = JSON.parse(fs.readFileSync(FIELD_MAP_PATH, "utf-8"));

const BASIC_PROFILE_PROMPTS_ZH = {
  "Full name (required)": "怎么称呼您？",
  Gender: "您的性别是？",
  "Date of birth": "您是哪年哪月出生？",
  Married: "您结婚了吗？",
  Children: "您有子女吗？",
  Education: "您的最高学历是？",
  "Place of birth": "您在哪里出生？",
  "Current residence": "您现在住在哪里？",
};

const canonicalFieldValues = new Set(Object.values(fieldZhToCanonical));

function canonicalFieldKey(zhKey, subCategoryId) {
  const hit = fieldZhToCanonical[zhKey];
  if (hit) return hit;
  if (canonicalFieldValues.has(zhKey)) return zhKey;
  const override = enOverrides.subCategories?.[subCategoryId];
  if (override) {
    for (const f of [...(override.required ?? []), ...(override.optional ?? [])]) {
      if (f.key === zhKey) return f.key;
    }
  }
  throw new Error(`MISSING_FIELD_MAP: ${zhKey}`);
}

function mergeSubCategory(sc, subCategoryId) {
  const nameOverride = enOverrides.subCategoryNames?.[subCategoryId];
  const fullOverride = enOverrides.subCategories?.[subCategoryId];
  const name = nameOverride?.trim() || sc.name;
  const mapFields = (list) =>
    (list ?? []).map((f) => ({
      ...f,
      key: canonicalFieldKey(f.key, subCategoryId),
    }));
  if (fullOverride) {
    return {
      ...sc,
      name,
      required: mapFields(fullOverride.required ?? sc.required),
      optional: mapFields(fullOverride.optional ?? sc.optional),
    };
  }
  return {
    ...sc,
    name,
    required: mapFields(sc.required),
    optional: mapFields(sc.optional),
  };
}

const canonicalFieldOptions = { ...(enOverrides.fieldOptions ?? {}) };
for (const [key, zhValues] of Object.entries(zh.fieldOptions ?? {})) {
  if (canonicalFieldOptions[key]) continue;
  canonicalFieldOptions[key] = zhValues;
}

const canonical = {
  version: "2.0.0-canonical-en",
  source: {
    project: "hello story2",
    notes: "English canonical template; display strings in backend/config/display/",
  },
  fieldOptions: canonicalFieldOptions,
  categories: (zh.categories ?? []).map((cat) => ({
    ...cat,
    name: cat.id === "basic" ? "Basic info" : cat.id === "edu" ? "Education" : cat.name,
    subCategories: (cat.subCategories ?? []).map((sc) => {
      const subCategoryId = (sc.id ?? sc.name).trim();
      return mergeSubCategory(sc, subCategoryId);
    }),
  })),
};

const subCategoryNamesZh = {};
const fieldKeysZh = {};
const fieldOptionsZh = {};

for (const c of zh.categories ?? []) {
  for (const sc of c.subCategories ?? []) {
    const subCategoryId = (sc.id ?? sc.name).trim();
    const canonicalName =
      enOverrides.subCategoryNames?.[subCategoryId] ??
      canonical.categories
        .flatMap((cat) => cat.subCategories)
        .find((x) => (x.id ?? x.name).trim() === subCategoryId)?.name ??
      sc.name;
    subCategoryNamesZh[subCategoryId] = sc.name;
    for (const f of [...(sc.required ?? []), ...(sc.optional ?? [])]) {
      const ck = canonicalFieldKey(f.key, subCategoryId);
      fieldKeysZh[ck] = f.key;
    }
  }
}

for (const [optKey, zhValues] of Object.entries(zh.fieldOptions ?? {})) {
  const enValues = enOverrides.fieldOptions?.[optKey];
  if (!enValues) continue;
  fieldOptionsZh[optKey] = {};
  for (let i = 0; i < enValues.length; i++) {
    const en = enValues[i];
    const z = zhValues[i];
    if (en && z) fieldOptionsZh[optKey][en] = z;
  }
}

const displayZh = {
  subCategoryNames: subCategoryNamesZh,
  fieldKeys: fieldKeysZh,
  fieldOptions: fieldOptionsZh,
  basicProfilePrompts: BASIC_PROFILE_PROMPTS_ZH,
};

fs.mkdirSync(path.dirname(DISPLAY_ZH_OUT), { recursive: true });
fs.writeFileSync(CANONICAL_OUT, JSON.stringify(canonical, null, 2), "utf-8");
fs.writeFileSync(DISPLAY_ZH_OUT, JSON.stringify(displayZh, null, 2), "utf-8");
console.log("Wrote", CANONICAL_OUT);
console.log("Wrote", DISPLAY_ZH_OUT);
