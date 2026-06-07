/**
 * @deprecated Import from `displayLocale.ts` instead. Kept for gradual migration.
 */
export {
  CANONICAL_LOCALE,
  type DisplayLocale,
  type DisplayLocale as ContentLocale,
  normalizeDisplayLocale,
  normalizeDisplayLocale as normalizeContentLocale,
  getDisplayLocale,
  getDisplayLocale as getContentLocale,
  runWithDisplayLocale,
  runWithDisplayLocale as runWithContentLocale,
  runWithDisplayLocaleSync,
  runWithDisplayLocaleSync as runWithContentLocaleSync,
  getInterviewDisplayLocale,
  getInterviewDisplayLocale as getInterviewContentLocale,
  interviewSkipLabel,
  selectTopicPrompt,
  QUESTION_TEXT_MAX_CHARS,
  EXTEND_QUESTION_MAX_CHARS,
} from "./displayLocale";

import { QUESTION_TEXT_MAX_CHARS, EXTEND_QUESTION_MAX_CHARS } from "./displayLocale";

/** @deprecated LLM 一律英文；保留签名避免大范围改动。 */
export function questionTextMaxChars(): number {
  return QUESTION_TEXT_MAX_CHARS;
}

/** @deprecated LLM 一律英文。 */
export function extendQuestionMaxChars(): number {
  return EXTEND_QUESTION_MAX_CHARS;
}
