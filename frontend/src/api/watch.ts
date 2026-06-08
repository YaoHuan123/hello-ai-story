import { resolveApiUrl } from "../lib/apiBase";
import { authTokenStore } from "../lib/authToken";
import { apiRequest, fetchAuthenticatedBlob } from "./client";
import type { WatchFeedResponse, WatchVideoDetail, WatchQuizCurrentResponse, WatchQuizSubmitResponse } from "../types/watch";

export async function listWatchFeed(opts?: { limit?: number; cursor?: string }): Promise<WatchFeedResponse> {
  const q = new URLSearchParams();
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.cursor) q.set("cursor", opts.cursor);
  const suffix = q.size ? `?${q.toString()}` : "";
  return apiRequest<WatchFeedResponse>(`/api/watch/feed${suffix}`, { method: "GET" }, true);
}

export async function getWatchVideo(publishId: string): Promise<WatchVideoDetail> {
  return apiRequest<WatchVideoDetail>(`/api/watch/${encodeURIComponent(publishId)}`, { method: "GET" }, true);
}

export function watchCoverUrl(publishId: string): string | null {
  const token = authTokenStore.get();
  if (!token) return null;
  const q = new URLSearchParams({ token });
  return `${resolveApiUrl(`/api/watch/${encodeURIComponent(publishId)}/cover`)}?${q.toString()}`;
}

export function watchVideoStreamUrl(publishId: string): string {
  return resolveApiUrl(`/api/watch/${encodeURIComponent(publishId)}/video`);
}

export async function fetchWatchVideoBlob(publishId: string): Promise<Blob> {
  return fetchAuthenticatedBlob(watchVideoStreamUrl(publishId));
}

export async function startWatchQuiz(publishId: string): Promise<WatchQuizCurrentResponse> {
  return apiRequest<WatchQuizCurrentResponse>(
    `/api/watch/${encodeURIComponent(publishId)}/quiz/start`,
    { method: "POST" },
    true,
  );
}

export async function getWatchQuizCurrent(publishId: string): Promise<WatchQuizCurrentResponse> {
  return apiRequest<WatchQuizCurrentResponse>(
    `/api/watch/${encodeURIComponent(publishId)}/quiz/current`,
    { method: "GET" },
    true,
  );
}

export async function submitWatchQuizAnswer(
  publishId: string,
  answer: string,
): Promise<WatchQuizSubmitResponse> {
  return apiRequest<WatchQuizSubmitResponse>(
    `/api/watch/${encodeURIComponent(publishId)}/quiz/submit`,
    { method: "POST", body: JSON.stringify({ answer }) },
    true,
  );
}
