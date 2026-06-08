import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import {
  getVideoTaskPaths,
  type VideoTaskPaths,
} from "../shared/orchestrator/videoTaskWorkspace.js";
import { readJsonObjectFile, writeJsonAtomic } from "../shared/orchestrator/pipelineDisk.js";

/** 调度参数快照：`成片/{taskId}/request.json` */
export const VIDEO_TASK_REQUEST_FILE = "request.json";

/** 删除标记：`成片/{taskId}/.deleted` */
export const VIDEO_TASK_DELETED_FILE = ".deleted";

export type VideoTaskRequestKind = "create_video_biography" | "create_video_studio";

export type BiographyVideoRequestPayload = {
  ttsVoice: string;
  styleConfigPath?: string;
  styleId?: string;
  textTaskId?: string;
  polishMode?: "llm" | "stub";
  throughStep?: string;
};

export type StudioVideoRequestPayload = {
  hostVoice: string;
  guestVoice: string;
  qaGranularity?: "hybrid" | "per_event" | "batch";
  textTaskId?: string;
  polishMode?: "llm" | "stub";
  throughStep?: string;
};

export type VideoTaskRequest =
  | { kind: "create_video_biography"; payload: BiographyVideoRequestPayload }
  | { kind: "create_video_studio"; payload: StudioVideoRequestPayload };

export type VideoTaskDeletedMarker = {
  deletedAt: string;
};

export function videoTaskRequestPath(paths: VideoTaskPaths): string {
  return path.join(paths.taskRoot, VIDEO_TASK_REQUEST_FILE);
}

export function videoTaskDeletedPath(paths: VideoTaskPaths): string {
  return path.join(paths.taskRoot, VIDEO_TASK_DELETED_FILE);
}

export function isVideoTaskDeleted(scope: InterviewScope, taskId: string): boolean {
  const paths = getVideoTaskPaths(scope, taskId);
  return fs.existsSync(videoTaskDeletedPath(paths));
}

export function writeVideoTaskDeletedMarker(scope: InterviewScope, taskId: string): VideoTaskDeletedMarker {
  const paths = getVideoTaskPaths(scope, taskId);
  const marker: VideoTaskDeletedMarker = { deletedAt: new Date().toISOString() };
  writeJsonAtomic(videoTaskDeletedPath(paths), marker);
  return marker;
}

export function readVideoTaskRequest(scope: InterviewScope, taskId: string): VideoTaskRequest | null {
  const paths = getVideoTaskPaths(scope, taskId);
  const raw = readJsonObjectFile(videoTaskRequestPath(paths));
  const kind = raw.kind;
  if (kind !== "create_video_biography" && kind !== "create_video_studio") return null;
  const payload = raw.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return { kind, payload: payload as BiographyVideoRequestPayload & StudioVideoRequestPayload };
}

export function writeVideoTaskRequest(scope: InterviewScope, taskId: string, request: VideoTaskRequest): void {
  const paths = getVideoTaskPaths(scope, taskId);
  fs.mkdirSync(paths.taskRoot, { recursive: true });
  writeJsonAtomic(videoTaskRequestPath(paths), request);
}
