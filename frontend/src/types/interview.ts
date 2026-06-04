/** 与后端 `interviewOrchestrator.service` 的 `InterviewQuestion` 对齐。 */
export type InterviewQuestion = {
  type: "topic" | "normal";
  title: string | null;
  key: string;
  text: string;
  options: string[];
};

export type SubmitPayload = {
  key: string;
  text: string;
  value: string;
};

export type InterviewMeta = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
};

export type InterviewListResponse = {
  interviews: InterviewMeta[];
};
