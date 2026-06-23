import type { DisplayLocale } from "../../../content/displayLocale.js";

/** 中文旁白单行码点上限。 */
export const VOICEOVER_LINE_MAX_CHARS = 80;

/** 英文旁白单行单词上限。 */
export const VOICEOVER_LINE_MAX_WORDS_EN = 18;

/** 英文旁白单行码点硬顶（防超长单词/标点堆叠）。 */
export const VOICEOVER_LINE_MAX_CHARS_EN = 140;

export type VoiceoverLineLimits = {
  maxCodePoints: number;
  maxWords?: number;
};

export function voiceoverLineLimits(locale: DisplayLocale): VoiceoverLineLimits {
  if (locale === "en") {
    return {
      maxCodePoints: VOICEOVER_LINE_MAX_CHARS_EN,
      maxWords: VOICEOVER_LINE_MAX_WORDS_EN,
    };
  }
  return { maxCodePoints: VOICEOVER_LINE_MAX_CHARS };
}

export function countVoiceoverWords(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function voiceoverLineTooLong(line: string, locale: DisplayLocale): boolean {
  const limits = voiceoverLineLimits(locale);
  const trimmed = line.trim();
  if ([...trimmed].length > limits.maxCodePoints) {
    return true;
  }
  if (limits.maxWords !== undefined && countVoiceoverWords(trimmed) > limits.maxWords) {
    return true;
  }
  return false;
}

export function voiceoverLineLimitDescription(locale: DisplayLocale): string {
  if (locale === "en") {
    return `each line ≤ ${VOICEOVER_LINE_MAX_WORDS_EN} words and ≤ ${VOICEOVER_LINE_MAX_CHARS_EN} characters`;
  }
  return `每条不超过 ${VOICEOVER_LINE_MAX_CHARS} 字`;
}

export function voiceoverLineTooLongMessage(label: string, line: string, locale: DisplayLocale): string {
  const limits = voiceoverLineLimits(locale);
  const trimmed = line.trim();
  const words = countVoiceoverWords(trimmed);
  const codePoints = [...trimmed].length;
  if (locale === "en") {
    const parts: string[] = [];
    if (limits.maxWords !== undefined && words > limits.maxWords) {
      parts.push(`${words} words (max ${limits.maxWords})`);
    }
    if (codePoints > limits.maxCodePoints) {
      parts.push(`${codePoints} characters (max ${limits.maxCodePoints})`);
    }
    return `${label} voiceover line too long: ${parts.join("; ")}`;
  }
  return `${label} voiceover 每条不超过 ${limits.maxCodePoints} 字，实际 ${codePoints} 字`;
}

function clampByCodePoints(line: string, maxCodePoints: number): string {
  const trimmed = line.trim();
  const chars = [...trimmed];
  if (chars.length <= maxCodePoints) {
    return trimmed;
  }
  const budget = maxCodePoints - 1;
  let cut = chars.slice(0, budget).join("");
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxCodePoints * 0.55)) {
    cut = cut.slice(0, lastSpace);
  }
  return `${cut.trimEnd()}…`;
}

/** LLM 偶发超长时兜底截断（英文先裁词再裁字）。 */
export function clampVoiceoverLine(line: string, locale: DisplayLocale = "zh"): string {
  const limits = voiceoverLineLimits(locale);
  let trimmed = line.trim();
  if (limits.maxWords !== undefined) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length > limits.maxWords) {
      trimmed = words.slice(0, limits.maxWords).join(" ");
    }
  }
  return clampByCodePoints(trimmed, limits.maxCodePoints);
}
