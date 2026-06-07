import type { DisplayLocale } from "./displayLocale";
import {
  expectedTtsVoiceLanguage,
  ttsVoiceLanguagePrefix,
} from "./interviewTtsVoices";
import { translateTextsForDisplay, translateTextsZhToEnForTts } from "./translate/runtime";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import type { MergedNarrativeSegmentItem } from "../video/biography/llm/steps/step150MergeEnvAndEra.js";

function resolveTtsTargetLanguage(locale: DisplayLocale, ttsVoice?: string): "zh" | "en" {
  const fromVoice = ttsVoice ? ttsVoiceLanguagePrefix(ttsVoice) : null;
  if (fromVoice === "zh" || fromVoice === "en") return fromVoice;
  return expectedTtsVoiceLanguage(locale);
}

/** 旁白/脚本按 TTS 音色语种对齐（en_ 音色会将中文旁白译为英文）。 */
export async function textsForDisplayTts(
  scope: InterviewScope,
  texts: readonly string[],
  locale: DisplayLocale,
  ttsVoice?: string,
): Promise<string[]> {
  if (texts.length === 0) return [];
  const target = resolveTtsTargetLanguage(locale, ttsVoice);
  if (target === "zh") {
    return translateTextsForDisplay(scope, texts, "zh");
  }
  return translateTextsZhToEnForTts(scope, texts);
}

export async function singleTextForDisplayTts(
  scope: InterviewScope,
  text: string,
  locale: DisplayLocale,
  ttsVoice?: string,
): Promise<string> {
  const [out] = await textsForDisplayTts(scope, [text], locale, ttsVoice);
  return out ?? text.trim();
}

/** 传记 step180：按 TTS 音色语种翻译 merged voiceover 后再合成。 */
export async function mergedSegmentsForDisplayTts(
  scope: InterviewScope,
  segments: MergedNarrativeSegmentItem[],
  locale: DisplayLocale,
  ttsVoice?: string,
): Promise<MergedNarrativeSegmentItem[]> {
  const flat: string[] = [];
  const slots: Array<{ seg: number; idx: number }> = [];
  for (const row of segments) {
    const vo = row.voiceover ?? [];
    for (let i = 0; i < vo.length; i++) {
      flat.push(String(vo[i] ?? "").trim());
      slots.push({ seg: row.segmentIndex, idx: i });
    }
  }
  const translated = await textsForDisplayTts(scope, flat, locale, ttsVoice);

  const bySeg = new Map<number, string[]>();
  for (const row of segments) {
    bySeg.set(row.segmentIndex, [...(row.voiceover ?? [])]);
  }
  for (let i = 0; i < slots.length; i++) {
    const { seg, idx } = slots[i]!;
    const arr = bySeg.get(seg);
    if (arr) arr[idx] = translated[i] ?? arr[idx]!;
  }

  return segments.map((row) => ({
    ...row,
    voiceover: bySeg.get(row.segmentIndex) ?? [...(row.voiceover ?? [])],
  }));
}

/** 传记 step250 字幕：与 TTS 同源展示翻译。 */
export async function translateSubtitleBySegment(
  scope: InterviewScope,
  bySegment: Map<number, string[]>,
  locale: DisplayLocale,
  ttsVoice?: string,
): Promise<Map<number, string[]>> {
  if (bySegment.size === 0) return bySegment;

  const keys = [...bySegment.keys()].sort((a, b) => a - b);
  const flat: string[] = [];
  for (const seg of keys) {
    flat.push(...(bySegment.get(seg) ?? []));
  }
  const translated = await textsForDisplayTts(scope, flat, locale, ttsVoice);

  const out = new Map<number, string[]>();
  let offset = 0;
  for (const seg of keys) {
    const len = bySegment.get(seg)?.length ?? 0;
    out.set(seg, translated.slice(offset, offset + len));
    offset += len;
  }
  return out;
}
