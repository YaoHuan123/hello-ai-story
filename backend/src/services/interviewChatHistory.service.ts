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

/** 从已 commit 小节 + 进行中 `出题/answers` 还原聊天时间线。 */
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
