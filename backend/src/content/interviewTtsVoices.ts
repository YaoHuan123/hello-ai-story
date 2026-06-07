import type { DisplayLocale } from "./displayLocale";
import { getInterviewDisplayLocale } from "./displayLocale";
import type { InterviewScope } from "../services/interviewWorkspace.service";

/** 302 传记旁白推荐音色，与 `frontend/src/constants/ttsVoices.ts` 对齐。 */
export const INTERVIEW_TTS_VOICE_ZH = "zh_male_M392_conversation_wvae_bigtts";
export const INTERVIEW_TTS_VOICE_EN = "en_male_adam_mars_bigtts";

export const STUDIO_HOST_VOICE_ZH = "zh_female_tianmeixiaoyuan_moon_bigtts";
export const STUDIO_GUEST_VOICE_ZH = "zh_male_M392_conversation_wvae_bigtts";
export const STUDIO_HOST_VOICE_EN = "en_female_sarah_mars_bigtts";
export const STUDIO_GUEST_VOICE_EN = "en_male_adam_mars_bigtts";

export function biographyTtsVoiceForLocale(locale: DisplayLocale): string {
  return locale === "en" ? INTERVIEW_TTS_VOICE_EN : INTERVIEW_TTS_VOICE_ZH;
}

export function studioHostVoiceForLocale(locale: DisplayLocale): string {
  return locale === "en" ? STUDIO_HOST_VOICE_EN : STUDIO_HOST_VOICE_ZH;
}

export function studioGuestVoiceForLocale(locale: DisplayLocale): string {
  return locale === "en" ? STUDIO_GUEST_VOICE_EN : STUDIO_GUEST_VOICE_ZH;
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

export function assertTtsVoiceMatchesLocale(voice: string, locale: DisplayLocale, label: string): void {
  const expected = expectedTtsVoiceLanguage(locale);
  const got = ttsVoiceLanguagePrefix(voice);
  if (got !== expected) {
    throw new Error(
      `VIDEO_TTS_VOICE_LOCALE_MISMATCH: ${label} 音色「${voice}」与采访展示语言「${locale}」不匹配，须使用 ${expected}_ 前缀`,
    );
  }
}

export function resolveBiographyTtsVoice(scope: InterviewScope, clientVoice?: string): string {
  const locale = getInterviewDisplayLocale(scope);
  const voice = (clientVoice ?? "").trim() || biographyTtsVoiceForLocale(locale);
  assertTtsVoiceMatchesLocale(voice, locale, "传记旁白");
  return voice;
}

export function resolveStudioTtsVoices(
  scope: InterviewScope,
  clientHost?: string,
  clientGuest?: string,
): { hostVoice: string; guestVoice: string } {
  const locale = getInterviewDisplayLocale(scope);
  const hostVoice = (clientHost ?? "").trim() || studioHostVoiceForLocale(locale);
  const guestVoice = (clientGuest ?? "").trim() || studioGuestVoiceForLocale(locale);
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
