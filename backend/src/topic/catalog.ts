import fs from "node:fs";
import path from "node:path";
import {
  getCanonicalFieldKeyByZhLabel,
  getSubCategoryIdByZhDisplayName,
  getZhSubCategoryName,
} from "../content/displayCatalog";
import type { DisplayLocale } from "../content/displayLocale";
import { BASIC_PROFILE_SUB_ID } from "../content/topicIds";
import { resolveFieldMeta, type TopicFieldMeta } from "./fieldMeta";

const PUBLIC_DIR = path.join(__dirname, "..", "..", "..", "frontend", "public");
const CANONICAL_CATALOG_PATH = path.join(PUBLIC_DIR, "template-config.canonical.json");

/** 一个可供选题的话题（canonical 英文名 + 稳定 subCategoryId）。 */
export type Topic = {
  name: string;
  subCategoryId: string;
};

type RawField = { key: string; control?: string; required?: boolean };

type RawSubCategory = {
  id?: string;
  name: string;
  required?: RawField[];
  optional?: RawField[];
};

type RawCatalog = {
  fieldOptions?: Record<string, string[]>;
  categories: Array<{
    id: string;
    name: string;
    subCategories: RawSubCategory[];
  }>;
};

type FieldDef = {
  control: string;
  subCategoryId: string;
  optional: boolean;
  optionsKey?: string;
};

type CatalogCaches = {
  topics: Topic[];
  keys: Map<string, string[]>;
  defs: Map<string, Map<string, FieldDef>>;
  fieldOptions: Record<string, string[]>;
  nameToId: Map<string, string>;
  idToName: Map<string, string>;
  basicProfileNames: Set<string>;
  legacyTopicNames: Set<string>;
};

let cache: CatalogCaches | null = null;

function loadRawCatalog(): RawCatalog {
  const raw = fs.readFileSync(CANONICAL_CATALOG_PATH, "utf-8");
  return JSON.parse(raw) as RawCatalog;
}

function optionsKeyForField(control: string, subCategoryId: string): string | undefined {
  const DIRECT: Record<string, string> = {
    p_2_7: "directRelationTitleSiblings",
    p_2_8: "directRelationTitleGrandparents",
  };
  const CONTROL: Record<string, string> = {
    gender: "gender",
    children: "children",
    married: "married",
    education: "education",
    firstJobNature: "firstJobNature",
    partnerMeetRelation: "partnerMeetRelation",
    meetChannelSelect: "meetChannel",
    firstDateBreakReasonSelect: "firstDateBreakReason",
    friendAgeGapSelect: "friendAgeGap",
    familyFeelingSelect: "familyOverallFeeling",
    personalitySelect: "personality",
    familyIncomeChangeDirectionSelect: "familyIncomeChangeDirection",
    homePurchaseHouseTypeSelect: "homePurchaseHouseType",
  };
  if (control === "directRelationTitleSelect") return DIRECT[subCategoryId];
  return CONTROL[control];
}

function buildCaches(): CatalogCaches {
  const parsed = loadRawCatalog();
  const keys = new Map<string, string[]>();
  const defs = new Map<string, Map<string, FieldDef>>();
  const fieldOptions = parsed.fieldOptions ?? {};
  const topics: Topic[] = [];
  const nameToId = new Map<string, string>();
  const idToName = new Map<string, string>();
  const basicProfileNames = new Set<string>();
  const legacyTopicNames = new Set<string>();

  for (const c of parsed.categories ?? []) {
    for (const sc of c.subCategories ?? []) {
      const topicName = sc.name.trim();
      const subCategoryId = (sc.id ?? topicName).trim();
      nameToId.set(topicName, subCategoryId);
      idToName.set(subCategoryId, topicName);
      if (subCategoryId === BASIC_PROFILE_SUB_ID) {
        basicProfileNames.add(topicName);
        legacyTopicNames.add("基本档案");
      }
      const zhName = getZhSubCategoryName(subCategoryId);
      if (zhName) legacyTopicNames.add(zhName);

      if (c.id !== "basic") {
        topics.push({ name: topicName, subCategoryId });
      }

      const fieldKeys: string[] = [];
      const fieldMap = new Map<string, FieldDef>();

      for (const f of sc.required ?? []) {
        if (typeof f.key !== "string" || !f.key.trim()) continue;
        const key = f.key.trim();
        fieldKeys.push(key);
        const control = typeof f.control === "string" && f.control.trim() ? f.control.trim() : "text";
        fieldMap.set(key, {
          control,
          subCategoryId,
          optional: false,
          optionsKey: optionsKeyForField(control, subCategoryId),
        });
      }
      for (const f of sc.optional ?? []) {
        if (typeof f.key !== "string" || !f.key.trim()) continue;
        const key = f.key.trim();
        fieldKeys.push(key);
        const control = typeof f.control === "string" && f.control.trim() ? f.control.trim() : "text";
        fieldMap.set(key, {
          control,
          subCategoryId,
          optional: true,
          optionsKey: optionsKeyForField(control, subCategoryId),
        });
      }

      keys.set(topicName, fieldKeys);
      defs.set(topicName, fieldMap);
    }
  }

  if (topics.length === 0) {
    throw new Error("CATALOG_EMPTY: canonical template has no topics");
  }

  return { topics, keys, defs, fieldOptions, nameToId, idToName, basicProfileNames, legacyTopicNames };
}

function ensureCaches(): CatalogCaches {
  if (!cache) cache = buildCaches();
  return cache;
}

export function getBasicProfileTopicName(): string {
  return ensureCaches().idToName.get(BASIC_PROFILE_SUB_ID) ?? "Basic profile";
}

export function isBasicProfileTopicName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  const c = ensureCaches();
  return c.basicProfileNames.has(t) || c.legacyTopicNames.has(t) || t === "基本档案";
}

export function getSubCategoryIdByTopicName(name: string): string | undefined {
  const t = name.trim();
  if (!t) return undefined;
  const c = ensureCaches();
  const hit = c.nameToId.get(t);
  if (hit) return hit;
  const zhId = getSubCategoryIdByZhDisplayName(t);
  if (zhId) return zhId;
  return undefined;
}

export function getTopicNameBySubCategoryId(subCategoryId: string): string | undefined {
  return ensureCaches().idToName.get(subCategoryId.trim());
}

/** 接受 canonical 名、中文展示名或旧落盘名。 */
export function resolveCanonicalTopicName(name: string): string {
  const t = name.trim();
  if (!t) throw new Error("CATALOG_TOPIC_NOT_FOUND: 空主题名");
  const c = ensureCaches();
  if (c.keys.has(t)) return t;
  const id = getSubCategoryIdByZhDisplayName(t);
  if (id) {
    const canonical = c.idToName.get(id);
    if (canonical) return canonical;
  }
  if (t === "基本档案") return getBasicProfileTopicName();
  throw new Error(`CATALOG_TOPIC_NOT_FOUND: 未找到话题「${name}」`);
}

export function resolveCanonicalFieldKey(topicName: string, fieldKey: string): string {
  const topic = resolveCanonicalTopicName(topicName);
  const key = fieldKey.trim();
  const defs = ensureCaches().defs.get(topic);
  if (defs?.has(key)) return key;
  const fromZh = getCanonicalFieldKeyByZhLabel(key);
  if (fromZh && defs?.has(fromZh)) return fromZh;
  return key;
}

export function loadTopics(): Topic[] {
  return ensureCaches().topics;
}

export function getTopicFieldKeys(name: string): string[] {
  const canonical = resolveCanonicalTopicName(name);
  const keys = ensureCaches().keys.get(canonical);
  if (keys === undefined) {
    throw new Error(`CATALOG_TOPIC_NOT_FOUND: 未找到话题「${name}」`);
  }
  return keys;
}

export function getTopicFieldMeta(topicName: string, fieldKey: string): TopicFieldMeta | undefined {
  const topic = resolveCanonicalTopicName(topicName);
  const key = resolveCanonicalFieldKey(topic, fieldKey);
  const def = ensureCaches().defs.get(topic)?.get(key);
  if (!def) return undefined;
  return resolveFieldMeta(def.control, def.subCategoryId, ensureCaches().fieldOptions);
}

export function getTopicFieldDef(topicName: string, fieldKey: string): FieldDef | undefined {
  const topic = resolveCanonicalTopicName(topicName);
  const key = resolveCanonicalFieldKey(topic, fieldKey);
  return ensureCaches().defs.get(topic)?.get(key);
}

export function isCatalogFieldOptional(topicName: string, fieldKey: string): boolean {
  const topic = resolveCanonicalTopicName(topicName);
  const key = resolveCanonicalFieldKey(topic, fieldKey);
  const def = ensureCaches().defs.get(topic)?.get(key);
  return def?.optional === true;
}

/** 问的是「他人」而非叙事者本人的子类（Partner / Father / Mother / …）。 */
export const PERSON_CENTRIC_SUB_IDS = new Set([
  "p_2_0",
  "p_2_1_f",
  "p_2_1_m",
  "p_2_7",
  "p_2_8",
  "p_2_5",
  "p_2_6",
  "p_2_2",
]);

const PERSON_SUBJECT_EN: Record<string, string> = {
  p_2_0: "the narrator's partner/spouse",
  p_2_1_f: "the narrator's father",
  p_2_1_m: "the narrator's mother",
  p_2_7: "the narrator's sibling",
  p_2_8: "the narrator's grandparent",
  p_2_5: "the narrator's child",
  p_2_6: "the narrator's grandchild",
  p_2_2: "this relative",
};

function personCentricSubCategoryId(topicName: string): string | undefined {
  const id = getSubCategoryIdByTopicName(topicName);
  if (!id || !PERSON_CENTRIC_SUB_IDS.has(id)) return undefined;
  return id;
}

/** 子类节问的是「他人」而非叙事者本人（Father / Mother / Partner / …）。 */
export function isPersonCentricCatalogTopic(topicName: string): boolean {
  return personCentricSubCategoryId(topicName) !== undefined;
}

/** 供 LLM prompt：如 "the narrator's father" / "父亲"。 */
export function catalogTopicSubjectLabel(
  topicName: string,
  locale: DisplayLocale = "en",
): string {
  const id = personCentricSubCategoryId(topicName);
  if (!id) {
    throw new Error(`CATALOG_NOT_PERSON_CENTRIC: 主题「${topicName}」非人物子类`);
  }
  if (locale === "zh") {
    return getZhSubCategoryName(id) ?? resolveCanonicalTopicName(topicName);
  }
  return PERSON_SUBJECT_EN[id] ?? `the person in the "${resolveCanonicalTopicName(topicName)}" section`;
}

/** 小学 / 初中 / 高中（K12）子类。 */
export const K12_SCHOOL_TOPICS = new Set(["Elementary school", "Middle school", "High school"]);

export const SCHOOL_LAST_YEAR_FIELD = "Last year attended at this school (optional)";

export const SCHOOL_NAME_FIELD = "School name (required)";

export function isK12SchoolTopic(topicName: string): boolean {
  try {
    return K12_SCHOOL_TOPICS.has(resolveCanonicalTopicName(topicName));
  } catch {
    return false;
  }
}

export function isSchoolLastYearField(topicName: string, fieldKey: string): boolean {
  if (!isK12SchoolTopic(topicName)) return false;
  try {
    return resolveCanonicalFieldKey(topicName, fieldKey) === SCHOOL_LAST_YEAR_FIELD;
  } catch {
    return false;
  }
}

export function schoolLastYearQuestionEn(schoolName: string): string {
  const name = schoolName.trim();
  return `What year did you attend ${name} until?`;
}

export function schoolLastYearQuestionZh(schoolName: string): string {
  const name = schoolName.trim();
  return `你在${name}上到哪一年？`;
}

/** 解析 K12「上到哪一年」英文问句中的学校名。 */
export function parseSchoolLastYearQuestionEn(text: string): string | null {
  const m = /^What year did you attend (.+) until\?$/.exec(text.trim());
  return m?.[1]?.trim() ?? null;
}

/** catalog 基本档案等跳过 LLM 时的 canonical 展示文案（英文问句）。 */
export function getCatalogFieldDisplayText(topicName: string, fieldKey: string): string {
  const topic = resolveCanonicalTopicName(topicName);
  const key = resolveCanonicalFieldKey(topic, fieldKey);
  if (!key) return fieldKey;
  if (key === SCHOOL_LAST_YEAR_FIELD) {
    return "What year did you attend this school until?";
  }
  if (isBasicProfileTopicName(topic)) {
    const EN: Record<string, string> = {
      "Full name (required)": "What is your full name?",
      Gender: "What is your gender?",
      "Date of birth": "When were you born? (year and month)",
      Married: "Are you married?",
      Children: "Do you have children?",
      Education: "What is your highest level of education?",
      "Place of birth": "Where were you born?",
      "Current residence": "Where do you live now?",
    };
    return EN[key] ?? key;
  }
  return key;
}
