import type { DisplayLocale } from "../displayLocale";
import {
  getCanonicalFieldKeyByZhLabel,
  getDisplayBasicProfilePrompt,
  getDisplayFieldKeyLabel,
  getDisplaySubCategoryName,
  getSubCategoryIdByZhDisplayName,
} from "../displayCatalog";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import { toDisplayFieldChoices } from "./options";
import { shouldUseLegacyDisplayTranslation } from "../interviewOutputLocale";
import { translateTextsForDisplay } from "./runtime";
import { toDisplayMaterialPickReason } from "../../topic/materialCopy";
import { toDisplayYesNo } from "./yesNo";
import {
  getSubCategoryIdByTopicName,
  getTopicNameBySubCategoryId,
  isBasicProfileTopicName,
  parseSchoolLastYearQuestionEn,
  resolveCanonicalTopicName,
  schoolLastYearQuestionZh,
} from "../../topic/catalog";
import { interviewCompletePrompt } from "../displayLocale";
import type { InterviewFieldType } from "../../topic/fieldMeta";

export type DisplayInterviewQuestion = {
  type: "topic" | "normal" | "complete";
  title: string | null;
  key: string;
  text: string;
  options: string[];
  optionReasons?: string[];
  fieldType?: InterviewFieldType;
  fieldChoices?: string[];
  skippable?: boolean;
  answerCount?: number;
};

const EN_BASIC_PROFILE_PROMPTS: Record<string, string> = {
  "Full name (required)": "What is your full name?",
  Gender: "What is your gender?",
  "Date of birth": "When were you born? (year and month)",
  Married: "Are you married?",
  Children: "Do you have children?",
  Education: "What is your highest level of education?",
  "Place of birth": "Where were you born?",
  "Current residence": "Where do you live now?",
};

export function toDisplayTopicName(canonicalName: string, locale: DisplayLocale): string {
  if (locale === "en") return canonicalName;
  const id = getSubCategoryIdByTopicName(canonicalName);
  if (id) {
    const zh = getDisplaySubCategoryName(id, locale);
    if (zh) return zh;
  }
  return canonicalName;
}

export function toCanonicalTopicNameFromDisplay(displayName: string, locale: DisplayLocale): string {
  const t = displayName.trim();
  if (!t) throw new Error("CATALOG_TOPIC_NOT_FOUND: 空主题名");
  if (locale === "zh") {
    const id = getSubCategoryIdByZhDisplayName(t);
    if (id) {
      const canonical = getTopicNameBySubCategoryId(id);
      if (canonical) return canonical;
    }
  }
  return resolveCanonicalTopicName(t);
}

export function toDisplayCatalogFieldText(
  topicName: string,
  canonicalFieldKey: string,
  locale: DisplayLocale,
): string {
  if (isBasicProfileTopicName(topicName)) {
    if (locale === "en") {
      return EN_BASIC_PROFILE_PROMPTS[canonicalFieldKey] ?? canonicalFieldKey;
    }
    return getDisplayBasicProfilePrompt(canonicalFieldKey, locale) ?? getDisplayFieldKeyLabel(canonicalFieldKey, locale) ?? canonicalFieldKey;
  }
  if (locale === "zh") {
    return getDisplayFieldKeyLabel(canonicalFieldKey, locale) ?? canonicalFieldKey;
  }
  return canonicalFieldKey;
}

export function toDisplayQuestionText(text: string, locale: DisplayLocale): string {
  if (locale === "en") return text;
  // 动态 LLM 问句：暂无 MT，先展示 canonical 英文
  return text;
}

export function toDisplayInterviewQuestion(
  q: DisplayInterviewQuestion,
  locale: DisplayLocale,
  fieldMeta?: { fieldType?: InterviewFieldType; fieldChoices?: string[]; optionsKey?: string },
): DisplayInterviewQuestion {
  if (q.type === "complete") {
    return { ...q, text: interviewCompletePrompt(locale) };
  }
  const title = q.title ? toDisplayTopicName(q.title, locale) : null;
  let text = q.type === "topic" ? selectTopicPrompt(locale) : toDisplayQuestionText(q.text, locale);
  if (q.type === "normal" && q.title && isBasicProfileTopicName(q.title)) {
    text = toDisplayCatalogFieldText(q.title, q.key, locale);
  }
  const options =
    q.type === "topic"
      ? q.options.map((o) => toDisplayTopicName(o, locale))
      : q.options.map((o) => toDisplayQuestionText(o, locale));
  const fieldChoices = fieldMeta?.fieldChoices
    ? toDisplayFieldChoices(fieldMeta.fieldChoices, fieldMeta.optionsKey, locale)
    : undefined;
  return {
    ...q,
    title,
    text,
    options,
    ...(fieldChoices ? { fieldChoices } : {}),
  };
}

/** 结构翻译；方案 A：zh 落盘中文问句直接展示，仅 legacy 英文内容才读时 MT。 */
export async function toDisplayInterviewQuestionAsync(
  scope: InterviewScope,
  q: DisplayInterviewQuestion,
  locale: DisplayLocale,
  fieldMeta?: { fieldType?: InterviewFieldType; fieldChoices?: string[]; optionsKey?: string },
): Promise<DisplayInterviewQuestion> {
  const base = toDisplayInterviewQuestion(q, locale, fieldMeta);
  if (locale !== "zh") return base;

  const schoolFromLastYear = parseSchoolLastYearQuestionEn(base.text);
  if (schoolFromLastYear) {
    return { ...base, text: schoolLastYearQuestionZh(schoolFromLastYear) };
  }

  let optionReasons = base.optionReasons;
  if (base.type === "topic" && base.optionReasons?.length) {
    optionReasons = base.optionReasons.map((r) => toDisplayMaterialPickReason(r, locale));
  }

  const legacySlots: Array<{ kind: "text" | "option"; index: number; text: string }> = [];
  if (shouldUseLegacyDisplayTranslation(base.text, locale)) {
    legacySlots.push({ kind: "text", index: 0, text: base.text });
  }
  const options = [...base.options];
  for (let i = 0; i < options.length; i++) {
    const o = options[i]!;
    const yn = toDisplayYesNo(o, locale);
    if (yn !== o) {
      options[i] = yn;
      continue;
    }
    if (shouldUseLegacyDisplayTranslation(o, locale)) {
      legacySlots.push({ kind: "option", index: i, text: o });
    }
  }

  if (legacySlots.length === 0) {
    return { ...base, options, ...(optionReasons ? { optionReasons } : {}) };
  }

  const translated = await translateTextsForDisplay(
    scope,
    legacySlots.map((s) => s.text),
    locale,
  );
  let text = base.text;
  for (let j = 0; j < legacySlots.length; j++) {
    const slot = legacySlots[j]!;
    const value = translated[j] ?? slot.text;
    if (slot.kind === "text") text = value;
    else options[slot.index] = value;
  }

  return {
    ...base,
    text,
    options,
    ...(optionReasons ? { optionReasons } : {}),
  };
}

export function toCanonicalQuestionKey(displayKey: string, locale: DisplayLocale): string {
  const t = displayKey.trim();
  if (locale === "zh") {
    const canonical = getCanonicalFieldKeyByZhLabel(t);
    if (canonical) return canonical;
  }
  return t;
}

function selectTopicPrompt(locale: DisplayLocale): string {
  return locale === "en" ? "Choose a topic to explore" : "请选择一个主题";
}
