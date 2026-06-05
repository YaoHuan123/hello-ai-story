import { apiRequest, fetchAuthenticatedBlob } from "./client";
import type {
  CreateTextTaskPayload,
  CreateTextTaskResponse,
  ScheduleBiographyPayload,
  ScheduleStudioPayload,
  ScheduleVideoTaskResponse,
  TextArticleResponse,
  TextTaskArtifacts,
  TextTaskListItem,
  TextTaskProgress,
  VideoTaskArtifacts,
  VideoTaskListItem,
  VideoTaskProgress,
} from "../types/production";

function productionPath(interviewId: string, suffix: string): string {
  const id = encodeURIComponent(interviewId);
  return `/api/interviews/${id}${suffix}`;
}

export async function listVideoTasks(interviewId: string) {
  return apiRequest<{ tasks: VideoTaskListItem[] }>(
    productionPath(interviewId, "/video/tasks"),
    { method: "GET" },
    true,
  );
}

export async function getVideoTaskProgress(interviewId: string, taskId: string) {
  const tid = encodeURIComponent(taskId);
  return apiRequest<VideoTaskProgress>(
    productionPath(interviewId, `/video/tasks/${tid}`),
    { method: "GET" },
    true,
  );
}

export async function scheduleBiographyVideo(
  interviewId: string,
  payload: ScheduleBiographyPayload,
): Promise<ScheduleVideoTaskResponse> {
  return apiRequest<ScheduleVideoTaskResponse>(
    productionPath(interviewId, "/video/biography"),
    { method: "POST", body: JSON.stringify(payload) },
    true,
  );
}

export async function scheduleStudioVideo(
  interviewId: string,
  payload: ScheduleStudioPayload,
): Promise<ScheduleVideoTaskResponse> {
  return apiRequest<ScheduleVideoTaskResponse>(
    productionPath(interviewId, "/video/studio"),
    { method: "POST", body: JSON.stringify(payload) },
    true,
  );
}

export async function retryVideoTask(interviewId: string, taskId: string) {
  const tid = encodeURIComponent(taskId);
  return apiRequest<{ taskId: string; queueTaskId: string; status: string }>(
    productionPath(interviewId, `/video/tasks/${tid}/retry`),
    { method: "POST" },
    true,
  );
}

export async function listTextTasks(interviewId: string) {
  return apiRequest<{ tasks: TextTaskListItem[] }>(
    productionPath(interviewId, "/text/tasks"),
    { method: "GET" },
    true,
  );
}

export async function createTextTask(interviewId: string, payload: CreateTextTaskPayload = {}) {
  return apiRequest<CreateTextTaskResponse>(
    productionPath(interviewId, "/text/tasks"),
    { method: "POST", body: JSON.stringify(payload) },
    true,
  );
}

export async function getTextTaskProgress(interviewId: string, taskId: string) {
  const tid = encodeURIComponent(taskId);
  return apiRequest<TextTaskProgress>(
    productionPath(interviewId, `/text/tasks/${tid}`),
    { method: "GET" },
    true,
  );
}

export async function getTextArticle(interviewId: string, taskId: string) {
  const tid = encodeURIComponent(taskId);
  return apiRequest<TextArticleResponse>(
    productionPath(interviewId, `/text/tasks/${tid}/article`),
    { method: "GET" },
    true,
  );
}

export async function getTextTaskArtifacts(interviewId: string, taskId: string) {
  const tid = encodeURIComponent(taskId);
  return apiRequest<TextTaskArtifacts>(
    productionPath(interviewId, `/text/tasks/${tid}/artifacts`),
    { method: "GET" },
    true,
  );
}

export function textArtifactFileUrl(interviewId: string, taskId: string): string {
  const tid = encodeURIComponent(taskId);
  return productionPath(interviewId, `/text/tasks/${tid}/artifacts/file`);
}

export async function getVideoTaskArtifacts(interviewId: string, taskId: string) {
  const tid = encodeURIComponent(taskId);
  return apiRequest<VideoTaskArtifacts>(
    productionPath(interviewId, `/video/tasks/${tid}/artifacts`),
    { method: "GET" },
    true,
  );
}

export function videoArtifactFileUrl(interviewId: string, taskId: string, rel: string): string {
  const tid = encodeURIComponent(taskId);
  const q = new URLSearchParams({ rel });
  return productionPath(interviewId, `/video/tasks/${tid}/artifacts/file?${q.toString()}`);
}

export function videoPrimaryVideoUrl(interviewId: string, taskId: string): string {
  const tid = encodeURIComponent(taskId);
  return productionPath(interviewId, `/video/tasks/${tid}/video`);
}

export async function fetchVideoPrimaryBlob(interviewId: string, taskId: string): Promise<Blob> {
  return fetchAuthenticatedBlob(videoPrimaryVideoUrl(interviewId, taskId));
}

export async function fetchVideoArtifactBlob(
  interviewId: string,
  taskId: string,
  rel: string,
): Promise<Blob> {
  return fetchAuthenticatedBlob(videoArtifactFileUrl(interviewId, taskId, rel));
}
