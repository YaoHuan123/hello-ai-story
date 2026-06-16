import type { DisplayLocale } from "./displayLocale";
import { getDisplayLocale, getInterviewDisplayLocale } from "./displayLocale";
import type { InterviewScope } from "../services/interviewWorkspace.service";

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

/** 当前 HTTP 采访请求的 LLM 输出语种（AsyncLocalStorage 或 meta.locale）。 */
export function interviewOutputLocale(scope?: InterviewScope): DisplayLocale {
  if (scope) return getInterviewDisplayLocale(scope);
  return getDisplayLocale();
}

/** 写入 LLM promptInput：`{ outputLocale: "zh" | "en" }`。 */
export function outputLocaleField(locale: DisplayLocale): { outputLocale: DisplayLocale } {
  return { outputLocale: locale };
}

/**
 * 方案 A：zh 采访落盘已是中文时，读 API 不再 LLM 回译。
 * 仅对仍为纯英文/拉丁文的旧数据做 legacy MT。
 */
export function shouldUseLegacyDisplayTranslation(text: string, locale: DisplayLocale): boolean {
  if (locale !== "zh") return false;
  const t = text.trim();
  if (!t) return false;
  return !hasCjk(t);
}

/** 追加到 system 段，统一约束问句/chip/reason 的输出语种。 */
export function appendLocaleOutputRules(system: string, locale: DisplayLocale): string {
  const rules =
    locale === "zh"
      ? [
          "## Output locale (required)",
          "Input JSON includes `outputLocale`.",
          "When `outputLocale` is `zh`: write user-facing strings (`questionText`, `reason`, creative `title`, `questions`, `suggestedAnswers`, chips, `userQuestion`, etc.) in natural conversational **Chinese**.",
          "Preserve personal names, nicknames, dates, and places exactly as in `sections`; never substitute homophones (e.g. 一一 ≠ 依依).",
          "**Catalog topic picks (tier1/2)**: `pick.name` / `picks[].name` must still match a candidate from input `topics` **exactly** (English canonical id). Only translate `reason` to Chinese.",
          "**Tier4 hot topics**: `domainId` / `domainName` must copy input `topicMap` **exactly** (English canonical). Only translate `q` and `suggestedAnswers`.",
          "**Tier5 contradictions**: translate `summary`, `userQuestion`, `reconciliationHypotheses`; keep `involvedIds` as input section ids. Use input `referenceDate` as today for all time/age logic; do not invent a different date.",
          "**Tier7 turning points**: translate both `question` and `reason`.",
          "**Formal article (create-text)**: write the full `article` body in natural **Chinese** (first person「我」); preserve names, dates, places from input.",
          "**Video pipeline (create-video)**: write **voiceover**, **narrative**, **sceneDescription**, subtitles, env narrative, and other user-facing video copy in natural **Chinese**; preserve names, dates, places from input sections.",
          "**Video polish keys**: `polishedTemplateInstanceSummaries` object keys stay English section names; only values are translated.",
          "When `outputLocale` is `en`: write in English.",
          "Catalog field keys in input stay English for matching.",
        ].join("\n")
      : [
          "## Output locale",
          "When `outputLocale` is `en` (default): user-facing strings in English.",
          "When `outputLocale` is `zh`: user-facing strings in Chinese; **`article`** (formal biography) and **video voiceover/narrative/scene copy** in Chinese; preserve facts from sections.",
        ].join("\n");
  return `${system.trim()}\n\n${rules}`;
}

export function withOutputLocale<T extends Record<string, unknown>>(
  input: T,
  locale?: DisplayLocale,
): T & { outputLocale: DisplayLocale } {
  const loc = locale ?? interviewOutputLocale();
  return { ...input, ...outputLocaleField(loc) };
}

export function systemWithOutputLocale(system: string, locale?: DisplayLocale): string {
  return appendLocaleOutputRules(system, locale ?? interviewOutputLocale());
}
