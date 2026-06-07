import { apiRequest, fetchAuthenticatedBlob } from "./client";
import type {
  InterviewListResponse,
  InterviewMessagesResponse,
  InterviewMeta,
  InterviewQuestion,
  SubmitPayload,
} from "../types/interview";

export async function createInterview(title?: string): Promise<InterviewMeta> {
  return apiRequest<InterviewMeta>(
    "/api/interviews",
    {
      method: "POST",
      body: JSON.stringify(title?.trim() ? { title: title.trim() } : {}),
    },
    true,
  );
}

export async function listInterviews(): Promise<InterviewListResponse> {
  return apiRequest<InterviewListResponse>("/api/interviews", { method: "GET" }, true);
}

export async function deleteInterview(interviewId: string): Promise<void> {
  const id = encodeURIComponent(interviewId);
  await apiRequest<{ ok: true }>(`/api/interviews/${id}`, { method: "DELETE" }, true);
}

export async function getCurrentQuestion(interviewId: string): Promise<InterviewQuestion> {
  const id = encodeURIComponent(interviewId);
  return apiRequest<InterviewQuestion>(`/api/interviews/${id}/current`, { method: "GET" }, true);
}

/** 当前展示题 TTS（服务端按 meta.locale 选音色并合成）。 */
export async function fetchInterviewQuestionTts(interviewId: string): Promise<Blob> {
  const id = encodeURIComponent(interviewId);
  return fetchAuthenticatedBlob(`/api/interviews/${id}/current/tts`);
}

export async function getInterviewMessages(interviewId: string): Promise<InterviewMessagesResponse> {
  const id = encodeURIComponent(interviewId);
  return apiRequest<InterviewMessagesResponse>(`/api/interviews/${id}/messages`, { method: "GET" }, true);
}

export async function submitAnswer(interviewId: string, payload: SubmitPayload): Promise<void> {
  const id = encodeURIComponent(interviewId);
  await apiRequest<{ ok: true }>(
    `/api/interviews/${id}/submit`,
    { method: "POST", body: JSON.stringify(payload) },
    true,
  );
}
