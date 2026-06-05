import type { InterviewScope } from "../../services/interviewWorkspace.service";
import { assertProductionReady } from "../../services/productionReadiness.service";
import {
  createBiographyVideoTask,
  createStudioVideoTask,
  getVideoTaskPaths,
  openVideoTask,
  readVideoTaskMeta,
  writeVideoTaskMeta,
  type VideoTaskMeta,
} from "../shared/orchestrator/videoTaskWorkspace.js";
import type { MaterialPolishMode } from "../shared/input/sectionsVideoInput.js";
import type { InterviewQaGranularity } from "../studio/llm/studioScript.js";
import { enqueueVideoQueueTask, requeueFailedVideoTask, type VideoQueueTaskRecord } from "./videoTaskQueue.js";
import type { BiographyVideoQueuePayload, StudioVideoQueuePayload } from "./videoTaskQueueTypes.js";

export type ScheduleBiographyVideoTaskOptions = {
  taskId?: string;
  ttsVoice: string;
  styleConfigPath?: string;
  styleId?: string;
  polishMode?: MaterialPolishMode;
  throughStep?: string;
};

export type ScheduleStudioVideoTaskOptions = {
  taskId?: string;
  hostVoice: string;
  guestVoice: string;
  qaGranularity?: InterviewQaGranularity;
  polishMode?: MaterialPolishMode;
  throughStep?: string;
};

export type ScheduledVideoTask = {
  scope: InterviewScope;
  videoTaskId: string;
  queueTaskId: string;
  queueRecord: VideoQueueTaskRecord;
};

function markVideoTaskQueued(scope: InterviewScope, videoTaskId: string): VideoTaskMeta {
  const paths = getVideoTaskPaths(scope, videoTaskId);
  const meta = readVideoTaskMeta(paths);
  if (!meta) throw new Error(`VIDEO_TASK_META_MISSING: ${videoTaskId}`);
  const next: VideoTaskMeta = {
    ...meta,
    status: "queued",
    updatedAt: new Date().toISOString(),
    lastError: undefined,
  };
  writeVideoTaskMeta(paths, next);
  return next;
}

/** 创建（或打开）传记成片任务并入队，供 worker 异步执行。 */
export function scheduleBiographyVideoTask(
  scope: InterviewScope,
  opts: ScheduleBiographyVideoTaskOptions,
): ScheduledVideoTask {
  const ttsVoice = opts.ttsVoice.trim();
  if (!ttsVoice) throw new Error("VIDEO_SCHEDULE_TTS_REQUIRED: 传记成片须提供 ttsVoice");

  assertProductionReady(scope);

  const handle = opts.taskId
    ? openVideoTask(scope, opts.taskId)
    : createBiographyVideoTask(scope);

  const payload: BiographyVideoQueuePayload = {
    ttsVoice,
    ...(opts.styleConfigPath?.trim() ? { styleConfigPath: opts.styleConfigPath.trim() } : {}),
    ...(opts.styleId?.trim() ? { styleId: opts.styleId.trim() } : {}),
    ...(opts.polishMode ? { polishMode: opts.polishMode } : {}),
    ...(opts.throughStep?.trim() ? { throughStep: opts.throughStep.trim() } : {}),
  };

  markVideoTaskQueued(scope, handle.taskId);
  const queueRecord = enqueueVideoQueueTask(scope, {
    videoTaskId: handle.taskId,
    kind: "create_video_biography",
    payload,
    queueTaskId: handle.taskId,
  });

  return {
    scope,
    videoTaskId: handle.taskId,
    queueTaskId: queueRecord.queueTaskId,
    queueRecord,
  };
}

/** 创建（或打开）演播室成片任务并入队。 */
export function scheduleStudioVideoTask(
  scope: InterviewScope,
  opts: ScheduleStudioVideoTaskOptions,
): ScheduledVideoTask {
  const hostVoice = opts.hostVoice.trim();
  const guestVoice = opts.guestVoice.trim();
  if (!hostVoice || !guestVoice) {
    throw new Error("VIDEO_SCHEDULE_VOICES_REQUIRED: 演播室须提供 hostVoice 与 guestVoice");
  }

  assertProductionReady(scope);

  const handle = opts.taskId ? openVideoTask(scope, opts.taskId) : createStudioVideoTask(scope);

  const payload: StudioVideoQueuePayload = {
    hostVoice,
    guestVoice,
    ...(opts.qaGranularity ? { qaGranularity: opts.qaGranularity } : {}),
    ...(opts.polishMode ? { polishMode: opts.polishMode } : {}),
    ...(opts.throughStep?.trim() ? { throughStep: opts.throughStep.trim() } : {}),
  };

  markVideoTaskQueued(scope, handle.taskId);
  const queueRecord = enqueueVideoQueueTask(scope, {
    videoTaskId: handle.taskId,
    kind: "create_video_studio",
    payload,
    queueTaskId: handle.taskId,
  });

  return {
    scope,
    videoTaskId: handle.taskId,
    queueTaskId: queueRecord.queueTaskId,
    queueRecord,
  };
}

/** 将 failed 队列任务重新标为 queued，并重置成片 meta 为 queued。 */
export function retryScheduledVideoTask(scope: InterviewScope, queueTaskId: string): VideoQueueTaskRecord {
  const rec = requeueFailedVideoTask(scope, queueTaskId);
  markVideoTaskQueued(scope, rec.videoTaskId);
  return rec;
}
