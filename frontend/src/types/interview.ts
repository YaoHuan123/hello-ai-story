export type InterviewFieldType = "text" | "select" | "yearMonth";

/** 与后端 `interviewOrchestrator.service` 的 `InterviewQuestion` 对齐。 */
export type InterviewQuestion = {
  type: "topic" | "normal";
  title: string | null;
  key: string;
  text: string;
  /** 选主题=候选主题；普通问答=LLM 备选答案 */
  options: string[];
  /** 选主题时与 options 等长的推荐理由 */
  optionReasons?: string[];
  fieldType?: InterviewFieldType;
  fieldChoices?: string[];
  /** 选填 / 扩展 / 非 catalog 题可跳过 */
  skippable?: boolean;
};

export const INTERVIEW_SKIP_LABEL = "（跳过）";
export const INTERVIEW_SKIP_LABEL_EN = "(skipped)";

export type SubmitPayload = {
  key: string;
  text: string;
  value?: string;
  skip?: boolean;
};

export type InterviewChatMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
  meta?: string;
};

export type InterviewMessagesResponse = {
  messages: InterviewChatMessage[];
};

export type InterviewMeta = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  /** 内容语言，创建时由后端 APP_LOCALE 写入 */
  locale?: "zh" | "en";
};

export type InterviewListResponse = {
  interviews: InterviewMeta[];
};
