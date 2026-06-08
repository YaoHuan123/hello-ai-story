import { resolveBiographyTtsVoice, resolveStudioTtsVoices } from "../../content/interviewTtsVoices";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import { assertVideoProductionReady } from "../../services/productionReadiness.service";
import {
  createBiographyVideoTask,
  createStudioVideoTask,
  getVideoTaskPaths,
  openVideoTask,
  readVideoTaskMeta,
  writeVideoTaskMeta,
  type VideoTaskHandle,
  type VideoTaskMeta,
} from "../shared/orchestrator/videoTaskWorkspace.js";
import type { MaterialPolishMode } from "../shared/input/sectionsVideoInput.js";
import type { InterviewQaGranularity } from "../studio/llm/studioScript.js";
import { isVideoTaskActive } from "./videoTaskClaim.js";
import {
  writeVideoTaskRequest,
  type BiographyVideoRequestPayload,
  type StudioVideoRequestPayload,
  type VideoTaskRequestKind,
} from "./videoTaskRequest.js";

export type ScheduleBiographyVideoTaskOptions = {
  taskId?: string;
  textTaskId?: string;
  styleConfigPath?: string;
  styleId?: string;
  polishMode?: MaterialPolishMode;
  throughStep?: string;
};

export type ScheduleStudioVideoTaskOptions = {
  taskId?: string;
  textTaskId?: string;
  qaGranularity?: InterviewQaGranularity;
  polishMode?: MaterialPolishMode;
  throughStep?: string;
};

export type ScheduledVideoTask = {
  scope: InterviewScope;
  videoTaskId: string;
  kind: VideoTaskRequestKind;
  status: "queued";
};

function assertVideoTaskSchedulable(scope: InterviewScope, videoTaskId: string): VideoTaskMeta {
  const paths = getVideoTaskPaths(scope, videoTaskId);
  const meta = readVideoTaskMeta(paths);
  if (!meta) throw new Error(`VIDEO_TASK_META_MISSING: ${videoTaskId}`);
  if (isVideoTaskActive(meta)) {
    throw new Error(`VIDEO_TASK_ALREADY_ACTIVE: 任务已在队列或生成中（${videoTaskId}）`);
  }
  return meta;
}

function markVideoTaskQueued(scope: InterviewScope, videoTaskId: string): VideoTaskMeta {
  const paths = getVideoTaskPaths(scope, videoTaskId);
  const meta = readVideoTaskMeta(paths);
  if (!meta) throw new Error(`VIDEO_TASK_META_MISSING: ${videoTaskId}`);
  const now = new Date().toISOString();
  const next: VideoTaskMeta = {
    ...meta,
    status: "queued",
    updatedAt: now,
    lastError: undefined,
    runToken: undefined,
    heartbeatAt: undefined,
    finishedAt: undefined,
  };
  writeVideoTaskMeta(paths, next);
  return next;
}

function scheduleOnHandle(
  handle: VideoTaskHandle,
  kind: VideoTaskRequestKind,
  payload: BiographyVideoRequestPayload | StudioVideoRequestPayload,
): ScheduledVideoTask {
  assertVideoTaskSchedulable(handle.scope, handle.taskId);
  writeVideoTaskRequest(handle.scope, handle.taskId, { kind, payload } as never);
  markVideoTaskQueued(handle.scope, handle.taskId);
  return {
    scope: handle.scope,
    videoTaskId: handle.taskId,
    kind,
    status: "queued",
  };
}

/** 在 `成片/{taskId}/` 创建任务并标为 queued，供 worker 扫描执行。 */
export function scheduleBiographyVideoTask(
  scope: InterviewScope,
  opts: ScheduleBiographyVideoTaskOptions,
): ScheduledVideoTask {
  const ttsVoice = resolveBiographyTtsVoice(scope);
  assertVideoProductionReady(scope, opts.textTaskId);

  const handle = opts.taskId
    ? openVideoTask(scope, opts.taskId)
    : createBiographyVideoTask(scope);

  const payload: BiographyVideoRequestPayload = {
    ttsVoice,
    ...(opts.textTaskId?.trim() ? { textTaskId: opts.textTaskId.trim() } : {}),
    ...(opts.styleConfigPath?.trim() ? { styleConfigPath: opts.styleConfigPath.trim() } : {}),
    ...(opts.styleId?.trim() ? { styleId: opts.styleId.trim() } : {}),
    ...(opts.polishMode ? { polishMode: opts.polishMode } : {}),
    ...(opts.throughStep?.trim() ? { throughStep: opts.throughStep.trim() } : {}),
  };

  return scheduleOnHandle(handle, "create_video_biography", payload);
}

/** 在 `成片/{taskId}/` 创建演播室任务并标为 queued。 */
export function scheduleStudioVideoTask(
  scope: InterviewScope,
  opts: ScheduleStudioVideoTaskOptions,
): ScheduledVideoTask {
  const { hostVoice, guestVoice } = resolveStudioTtsVoices(scope);
  assertVideoProductionReady(scope, opts.textTaskId);

  const handle = opts.taskId ? openVideoTask(scope, opts.taskId) : createStudioVideoTask(scope);

  const payload: StudioVideoRequestPayload = {
    hostVoice,
    guestVoice,
    ...(opts.textTaskId?.trim() ? { textTaskId: opts.textTaskId.trim() } : {}),
    ...(opts.qaGranularity ? { qaGranularity: opts.qaGranularity } : {}),
    ...(opts.polishMode ? { polishMode: opts.polishMode } : {}),
    ...(opts.throughStep?.trim() ? { throughStep: opts.throughStep.trim() } : {}),
  };

  return scheduleOnHandle(handle, "create_video_studio", payload);
}

/** 将 failed 任务重新标为 queued（保留 request.json）。 */
export function retryScheduledVideoTask(scope: InterviewScope, videoTaskId: string): {
  videoTaskId: string;
  status: "queued";
} {
  const paths = getVideoTaskPaths(scope, videoTaskId);
  const meta = readVideoTaskMeta(paths);
  if (!meta) throw new Error(`VIDEO_TASK_NOT_FOUND: ${videoTaskId}`);
  if (meta.status !== "failed") {
    throw new Error(`VIDEO_TASK_RETRY_INVALID: 仅 failed 任务可重试，当前 ${meta.status}`);
  }
  const next = markVideoTaskQueued(scope, videoTaskId);
  return { videoTaskId: next.id, status: "queued" };
}
