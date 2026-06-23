import { resolveApiUrl } from "../lib/apiBase";
import { authTokenStore } from "../lib/authToken";
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
  ProductionReadiness,
  VideoStylesCatalog,
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
  return apiRequest<{ taskId: string; status: string }>(
    productionPath(interviewId, `/video/tasks/${tid}/retry`),
    { method: "POST" },
    true,
  );
}

export async function deleteVideoTask(interviewId: string, taskId: string): Promise<void> {
  const tid = encodeURIComponent(taskId);
  await apiRequest<void>(
    productionPath(interviewId, `/video/tasks/${tid}`),
    { method: "DELETE" },
    true,
  );
}

export async function deleteTextTask(interviewId: string, taskId: string): Promise<void> {
  const tid = encodeURIComponent(taskId);
  await apiRequest<void>(
    productionPath(interviewId, `/text/tasks/${tid}`),
    { method: "DELETE" },
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

/** 成片封面直链，供 `<img src>` 使用（query 传 JWT）。 */
export function videoTaskCoverUrl(interviewId: string, taskId: string): string | null {
  const token = authTokenStore.get();
  if (!token) return null;
  const tid = encodeURIComponent(taskId);
  const q = new URLSearchParams({ token });
  return `${resolveApiUrl(productionPath(interviewId, `/video/tasks/${tid}/cover`))}?${q.toString()}`;
}

/** 取最近一次成功成片任务的封面 URL（故事墙卡片用）。 */
export function latestSuccessVideoCoverUrl(
  interviewId: string,
  tasks: VideoTaskListItem[],
): string | null {
  const latest = tasks
    .filter((t) => t.status === "success")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return null;
  return videoTaskCoverUrl(interviewId, latest.taskId);
}

export async function fetchVideoPrimaryBlob(interviewId: string, taskId: string): Promise<Blob> {
  return fetchAuthenticatedBlob(videoPrimaryVideoUrl(interviewId, taskId));
}

export async function fetchVideoCoverBlob(interviewId: string, taskId: string): Promise<Blob> {
  const tid = encodeURIComponent(taskId);
  return fetchAuthenticatedBlob(productionPath(interviewId, `/video/tasks/${tid}/cover`));
}

export async function getProductionReadiness(interviewId: string) {
  return apiRequest<ProductionReadiness>(
    productionPath(interviewId, "/production/readiness"),
    { method: "GET" },
    true,
  );
}

export async function listVideoStyles() {
  return apiRequest<VideoStylesCatalog>("/api/production/video-styles", { method: "GET" }, true);
}

export async function fetchVideoArtifactBlob(
  interviewId: string,
  taskId: string,
  rel: string,
): Promise<Blob> {
  return fetchAuthenticatedBlob(videoArtifactFileUrl(interviewId, taskId, rel));
}

export async function fetchTextArtifactBlob(interviewId: string, taskId: string): Promise<Blob> {
  return fetchAuthenticatedBlob(textArtifactFileUrl(interviewId, taskId));
}
