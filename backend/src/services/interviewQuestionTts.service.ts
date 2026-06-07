import { interviewQuestionTtsVoice } from "../content/interviewTtsVoices";
import { getInterviewDisplayLocale } from "../content/displayLocale";
import type { InterviewQuestion } from "./interviewOrchestrator.service";
import { getCurrentQuestionTraced } from "./interviewOrchestrator.service";
import type { InterviewScope } from "./interviewWorkspace.service";
import { synthesizeSingleSpeechMp3 } from "../video/biography/render/step180Tts.js";

const SPEAK_TEXT_MAX = 2000;

/** 将 API 展示题转为可朗读文案（展示层，非 canonical）。 */
export function buildInterviewQuestionSpeakText(q: InterviewQuestion): string {
  const text = q.text.trim();
  if (!text) {
    throw new Error("INTERVIEW_TTS_EMPTY: 当前题无展示文案");
  }
  if (q.type === "topic") {
    return text;
  }
  const title = q.title?.trim();
  if (title && title !== text) {
    return `${title}. ${text}`;
  }
  return text;
}

export type InterviewQuestionTtsResult = {
  audio: Buffer;
  locale: ReturnType<typeof getInterviewDisplayLocale>;
  voice: string;
  speakText: string;
};

/** 读当前展示题并合成 MP3；音色由 `meta.locale` 决定。 */
export async function synthesizeCurrentQuestionTts(
  scope: InterviewScope,
): Promise<InterviewQuestionTtsResult> {
  const locale = getInterviewDisplayLocale(scope);
  const question = await getCurrentQuestionTraced(scope);
  let speakText = buildInterviewQuestionSpeakText(question);
  if (speakText.length > SPEAK_TEXT_MAX) {
    speakText = speakText.slice(0, SPEAK_TEXT_MAX);
  }
  const voice = interviewQuestionTtsVoice(locale);
  try {
    const audio = await synthesizeSingleSpeechMp3(speakText, voice);
    return { audio, locale, voice, speakText };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`INTERVIEW_TTS_FAILED: ${detail}`);
  }
}
