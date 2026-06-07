import {
  TTS_VOICE_EN_FEMALE,
  TTS_VOICE_EN_MALE,
  TTS_VOICE_ZH_FEMALE,
  TTS_VOICE_ZH_MALE,
} from "../config";
import type { DisplayLocale } from "./displayLocale";
import { getInterviewDisplayLocale } from "./displayLocale";
import type { InterviewScope } from "../services/interviewWorkspace.service";

/** 传记旁白：中文男声 / 英文男声（来自 .env） */
export function biographyTtsVoiceForLocale(locale: DisplayLocale): string {
  return locale === "en" ? TTS_VOICE_EN_MALE : TTS_VOICE_ZH_MALE;
}

/** 演播室主持：中文女声 / 英文女声 */
export function studioHostVoiceForLocale(locale: DisplayLocale): string {
  return locale === "en" ? TTS_VOICE_EN_FEMALE : TTS_VOICE_ZH_FEMALE;
}

/** 演播室嘉宾：中文男声 / 英文男声 */
export function studioGuestVoiceForLocale(locale: DisplayLocale): string {
  return locale === "en" ? TTS_VOICE_EN_MALE : TTS_VOICE_ZH_MALE;
}

/** 从火山 voice_type 解析语种前缀（`zh_` / `en_`）。 */
export function ttsVoiceLanguagePrefix(voice: string): "zh" | "en" | null {
  const v = voice.trim().toLowerCase();
  if (v.startsWith("zh_")) return "zh";
  if (v.startsWith("en_")) return "en";
  return null;
}

export function expectedTtsVoiceLanguage(locale: DisplayLocale): "zh" | "en" {
  return locale === "en" ? "en" : "zh";
}

function assertTtsVoiceMatchesLocale(voice: string, locale: DisplayLocale, label: string): void {
  const expected = expectedTtsVoiceLanguage(locale);
  const got = ttsVoiceLanguagePrefix(voice);
  if (got !== expected) {
    throw new Error(
      `VIDEO_TTS_VOICE_LOCALE_MISMATCH: ${label} 音色「${voice}」与采访展示语言「${locale}」不匹配，须使用 ${expected}_ 前缀`,
    );
  }
}

/** 按采访 `meta.locale` 与 .env 默认音色解析传记旁白（忽略客户端传入）。 */
export function resolveBiographyTtsVoice(scope: InterviewScope): string {
  const locale = getInterviewDisplayLocale(scope);
  const voice = biographyTtsVoiceForLocale(locale);
  assertTtsVoiceMatchesLocale(voice, locale, "传记旁白");
  return voice;
}

/** 按采访 `meta.locale` 与 .env 默认音色解析演播室双声道。 */
export function resolveStudioTtsVoices(scope: InterviewScope): { hostVoice: string; guestVoice: string } {
  const locale = getInterviewDisplayLocale(scope);
  const hostVoice = studioHostVoiceForLocale(locale);
  const guestVoice = studioGuestVoiceForLocale(locale);
  assertTtsVoiceMatchesLocale(hostVoice, locale, "演播室主持");
  assertTtsVoiceMatchesLocale(guestVoice, locale, "演播室嘉宾");
  return { hostVoice, guestVoice };
}

export type ProductionTtsVoiceHints = {
  locale: DisplayLocale;
  biographyTtsVoice: string;
  studioHostVoice: string;
  studioGuestVoice: string;
};

export function productionTtsVoiceHints(scope: InterviewScope): ProductionTtsVoiceHints {
  const locale = getInterviewDisplayLocale(scope);
  return {
    locale,
    biographyTtsVoice: biographyTtsVoiceForLocale(locale),
    studioHostVoice: studioHostVoiceForLocale(locale),
    studioGuestVoice: studioGuestVoiceForLocale(locale),
  };
}
