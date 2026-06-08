import { AsyncLocalStorage } from "node:async_hooks";
import { APP_LOCALE, type AppLocale } from "../config";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { readInterviewMeta } from "../services/interviewWorkspace.service";

/** 用户界面与聊天展示语言。 */
export type DisplayLocale = AppLocale;

/** 内部存储、LLM、模板一律使用英文。 */
export const CANONICAL_LOCALE = "en" as const;

const storage = new AsyncLocalStorage<DisplayLocale>();

export function normalizeDisplayLocale(raw: string | undefined | null): DisplayLocale {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "en" ? "en" : "zh";
}

export function getDisplayLocale(): DisplayLocale {
  return storage.getStore() ?? APP_LOCALE;
}

export async function runWithDisplayLocale<T>(locale: DisplayLocale, fn: () => Promise<T>): Promise<T> {
  return storage.run(locale, fn);
}

export function runWithDisplayLocaleSync<T>(locale: DisplayLocale, fn: () => T): T {
  return storage.run(locale, fn);
}

/** 采访展示语言：meta.locale → 默认 zh（兼容旧字段名）。 */
export function getInterviewDisplayLocale(scope: InterviewScope): DisplayLocale {
  const meta = readInterviewMeta(scope);
  if (meta?.locale) return normalizeDisplayLocale(meta.locale);
  return "zh";
}

export function interviewSkipLabel(locale: DisplayLocale = getDisplayLocale()): string {
  return locale === "en" ? "(skipped)" : "（跳过）";
}

export function selectTopicPrompt(locale: DisplayLocale = getDisplayLocale()): string {
  return locale === "en" ? "Choose a topic to explore" : "请选择一个主题";
}

export function interviewCompletePrompt(locale: DisplayLocale = getDisplayLocale()): string {
  return locale === "en"
    ? "You've covered a rich set of memories for now. You can create story text or video from the studio."
    : "这一轮能聊的主题都已经聊过了。你可以返回创作台，去生成故事文本或视频。";
}

/** LLM 口语化 / refine 问句长度上限（canonical 英文）。 */
export const QUESTION_TEXT_MAX_CHARS = 180;

/** 扩展追问长度上限（canonical 英文）。 */
export const EXTEND_QUESTION_MAX_CHARS = 180;
