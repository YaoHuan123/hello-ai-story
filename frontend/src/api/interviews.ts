import { apiRequest } from "./client";
import type {
  InterviewListResponse,
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

export async function submitAnswer(interviewId: string, payload: SubmitPayload): Promise<void> {
  const id = encodeURIComponent(interviewId);
  await apiRequest<{ ok: true }>(
    `/api/interviews/${id}/submit`,
    { method: "POST", body: JSON.stringify(payload) },
    true,
  );
}
