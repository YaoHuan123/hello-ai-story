import type { InterviewScope } from "../../services/interviewWorkspace.service";
import type { BiographyPipelineStepId } from "../biography/orchestrator/biographyPipelineSteps.js";
import { runBiographyVideoPipeline } from "../biography/orchestrator/runBiographyVideoPipeline.js";
import { VIDEO_PREP_STEPS } from "../shared/constants/prepStepIds.js";
import type { StudioPipelineStepId } from "../studio/orchestrator/studioPipelineSteps.js";
import { runStudioVideoPipeline } from "../studio/orchestrator/runStudioVideoPipeline.js";
import {
  listAllClaimableVideoTasks,
  purgeDeletedVideoTasks,
  touchVideoTaskHeartbeat,
  tryClaimVideoTask,
  VIDEO_TASK_DELETED_ERROR,
} from "./videoTaskClaim.js";
import { readVideoTaskRequest, type BiographyVideoRequestPayload, type StudioVideoRequestPayload } from "./videoTaskRequest.js";
import type { VideoTaskRequestKind } from "./videoTaskRequest.js";

const DEFAULT_HEARTBEAT_MS = Math.max(
  5000,
  Number.parseInt(process.env.VIDEO_WORKER_HEARTBEAT_MS ?? "15000", 10) || 15000,
);

const DEFAULT_POLL_MS = Math.max(
  1000,
  Number.parseInt(process.env.VIDEO_WORKER_POLL_MS ?? "3000", 10) || 3000,
);

export type VideoWorkerRunResult = {
  processed: boolean;
  taskId?: string;
  kind?: VideoTaskRequestKind;
  error?: string;
  purgedDeleted?: number;
};

function startTaskHeartbeat(
  scope: InterviewScope,
  taskId: string,
  runToken: string,
  intervalMs = DEFAULT_HEARTBEAT_MS,
): { stop: () => void } {
  const timer = setInterval(() => {
    touchVideoTaskHeartbeat(scope, taskId, runToken);
  }, intervalMs);
  return { stop: () => clearInterval(timer) };
}

function parseBiographyPayload(payload: BiographyVideoRequestPayload): BiographyVideoRequestPayload {
  const ttsVoice = typeof payload.ttsVoice === "string" ? payload.ttsVoice.trim() : "";
  if (!ttsVoice) throw new Error("VIDEO_TASK_REQUEST_INVALID: biography request 缺少 ttsVoice");
  return {
    ttsVoice,
    ...(payload.polishMode ? { polishMode: payload.polishMode } : {}),
    ...(payload.styleConfigPath?.trim() ? { styleConfigPath: payload.styleConfigPath.trim() } : {}),
    ...(payload.styleId?.trim() ? { styleId: payload.styleId.trim() } : {}),
    ...(payload.textTaskId?.trim() ? { textTaskId: payload.textTaskId.trim() } : {}),
    ...(payload.throughStep?.trim() ? { throughStep: payload.throughStep.trim() } : {}),
  };
}

function parseStudioPayload(payload: StudioVideoRequestPayload): StudioVideoRequestPayload {
  const hostVoice = typeof payload.hostVoice === "string" ? payload.hostVoice.trim() : "";
  const guestVoice = typeof payload.guestVoice === "string" ? payload.guestVoice.trim() : "";
  if (!hostVoice || !guestVoice) {
    throw new Error("VIDEO_TASK_REQUEST_INVALID: studio request 缺少 hostVoice/guestVoice");
  }
  return {
    hostVoice,
    guestVoice,
    ...(payload.qaGranularity ? { qaGranularity: payload.qaGranularity } : {}),
    ...(payload.polishMode ? { polishMode: payload.polishMode } : {}),
    ...(payload.textTaskId?.trim() ? { textTaskId: payload.textTaskId.trim() } : {}),
    ...(payload.throughStep?.trim() ? { throughStep: payload.throughStep.trim() } : {}),
  };
}

/** 执行已认领的成片任务（pipeline 负责写 meta 终态）。 */
export async function executeVideoTask(
  scope: InterviewScope,
  taskId: string,
  runToken: string,
): Promise<unknown> {
  const request = readVideoTaskRequest(scope, taskId);
  if (!request) throw new Error(`VIDEO_TASK_REQUEST_MISSING: ${taskId}`);

  const hb = startTaskHeartbeat(scope, taskId, runToken);
  const onStep = () => touchVideoTaskHeartbeat(scope, taskId, runToken);

  try {
    switch (request.kind) {
      case "create_video_biography": {
        const p = parseBiographyPayload(request.payload);
        return await runBiographyVideoPipeline(scope, {
          taskId,
          styleConfigPath: p.styleConfigPath,
          styleId: p.styleId,
          textTaskId: p.textTaskId,
          polishMode: p.polishMode,
          ...(p.throughStep
            ? {
                throughStep: p.throughStep as typeof VIDEO_PREP_STEPS.POLISH | BiographyPipelineStepId,
              }
            : {}),
          onStepComplete: onStep,
        });
      }
      case "create_video_studio": {
        const p = parseStudioPayload(request.payload);
        return await runStudioVideoPipeline(scope, {
          taskId,
          qaGranularity: p.qaGranularity,
          textTaskId: p.textTaskId,
          polishMode: p.polishMode,
          ...(p.throughStep
            ? {
                throughStep: p.throughStep as typeof VIDEO_PREP_STEPS.POLISH | StudioPipelineStepId,
              }
            : {}),
          onStepComplete: onStep,
        });
      }
      default:
        throw new Error(`VIDEO_TASK_REQUEST_UNKNOWN_KIND: ${String((request as { kind: string }).kind)}`);
    }
  } finally {
    hb.stop();
  }
}

/** 认领并执行一条成片任务；无任务时返回 processed=false。 */
export async function runVideoWorkerOnce(): Promise<VideoWorkerRunResult> {
  const purgedDeleted = purgeDeletedVideoTasks();

  const candidates = listAllClaimableVideoTasks();
  if (candidates.length === 0) {
    return { processed: false, purgedDeleted };
  }

  for (const { scope, taskId } of candidates) {
    const claim = tryClaimVideoTask(scope, taskId);
    if (!claim.ok || !claim.runToken) continue;

    const request = readVideoTaskRequest(scope, taskId);
    const kind = request?.kind;

    try {
      await executeVideoTask(scope, taskId, claim.runToken);
      return {
        processed: true,
        taskId,
        kind,
        purgedDeleted,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === VIDEO_TASK_DELETED_ERROR) {
        purgeDeletedVideoTasks();
        return { processed: true, taskId, kind, error: message, purgedDeleted };
      }
      return {
        processed: true,
        taskId,
        kind,
        error: message,
        purgedDeleted,
      };
    }
  }

  return { processed: false, purgedDeleted };
}

/** Worker 主循环：轮询 `成片/` 认领并执行；`once=true` 时只跑一轮。 */
export async function runVideoWorkerLoop(opts?: { pollMs?: number; once?: boolean }): Promise<void> {
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS;
  const once = opts?.once ?? false;

  for (;;) {
    const r = await runVideoWorkerOnce();
    if (r.purgedDeleted && r.purgedDeleted > 0) {
      console.log(`[video-worker] purged ${r.purgedDeleted} deleted task(s)`);
    }
    if (r.processed) {
      const tag = r.error ? `FAILED ${r.error}` : "OK";
      console.log(`[video-worker] ${r.kind ?? "?"} ${r.taskId ?? "?"} ${tag}`);
    }
    if (once) break;
    if (!r.processed) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
