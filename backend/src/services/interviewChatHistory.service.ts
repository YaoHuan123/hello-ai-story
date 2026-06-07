import { getInterviewDisplayLocale } from "../content/displayLocale";
import { getDisplayOptionByCanonicalValue } from "../content/displayCatalog";
import { toDisplayTopicName } from "../content/translate/display";
import { toDisplayYesNo } from "../content/translate/yesNo";
import { translateTextsForDisplay } from "../content/translate/runtime";
import { getSections } from "./answeredSections.service";
import type { InterviewScope } from "./interviewWorkspace.service";
import { readAnswers, readQuestionSet } from "../question/topicPersist";

export type InterviewChatMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
  /** 普通问答时的小节/主题名 */
  meta?: string;
};

const CANONICAL_SKIP = "(skipped)";

function toDisplayStoredAnswer(text: string, locale: ReturnType<typeof getInterviewDisplayLocale>): string {
  const t = text.trim();
  if (locale !== "zh") return t;
  if (t === CANONICAL_SKIP) return "（跳过）";
  const yn = toDisplayYesNo(t, locale);
  if (yn !== t) return yn;
  return getDisplayOptionByCanonicalValue(t, locale) ?? t;
}

/** 从已 commit 小节 + 进行中 `出题/answers` 还原聊天时间线（canonical 原文）。 */
export function getInterviewChatHistory(scope: InterviewScope): InterviewChatMessage[] {
  const messages: InterviewChatMessage[] = [];
  let seq = 0;

  const push = (role: "ai" | "user", text: string, meta?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    messages.push({
      id: `hist-${seq++}`,
      role,
      text: trimmed,
      ...(meta ? { meta } : {}),
    });
  };

  for (const section of getSections(scope)) {
    const meta = section.name.trim();
    if (!meta) continue;
    for (const pair of section.qa ?? []) {
      const q = String(pair.q ?? "").trim();
      const a = String(pair.a ?? "").trim();
      if (!q || !a) continue;
      push("ai", q, meta);
      push("user", a);
    }
  }

  const questionSet = readQuestionSet(scope);
  const inProgress = readAnswers(scope);
  if (questionSet && inProgress.length > 0) {
    const meta = questionSet.title.trim();
    if (meta) {
      for (const record of inProgress) {
        const q = record.questionText.trim();
        const a = record.answer.trim();
        if (!q || !a) continue;
        push("ai", q, meta);
        push("user", a);
      }
    }
  }

  return messages;
}

/** HTTP：按 `meta.locale` 翻译主题名、问句与答案。 */
export async function getInterviewChatHistoryForDisplay(
  scope: InterviewScope,
): Promise<InterviewChatMessage[]> {
  const locale = getInterviewDisplayLocale(scope);
  const raw = getInterviewChatHistory(scope);
  if (locale === "en") return raw;

  const metas = raw.map((m) => (m.meta ? toDisplayTopicName(m.meta, locale) : undefined));
  const texts = raw.map((m) =>
    m.role === "user" ? toDisplayStoredAnswer(m.text, locale) : m.text,
  );
  const translatedTexts = await translateTextsForDisplay(scope, texts, locale);

  return raw.map((m, i) => ({
    ...m,
    text: translatedTexts[i]!,
    ...(metas[i] ? { meta: metas[i] } : {}),
  }));
}
