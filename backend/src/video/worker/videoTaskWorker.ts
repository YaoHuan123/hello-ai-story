import fs from "node:fs";
import path from "node:path";
import { DATA_USERS_ROOT } from "../../config.js";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import type { BiographyPipelineStepId } from "../biography/orchestrator/biographyPipelineSteps.js";
import { runBiographyVideoPipeline } from "../biography/orchestrator/runBiographyVideoPipeline.js";
import { VIDEO_PREP_STEPS } from "../shared/constants/prepStepIds.js";
import type { StudioPipelineStepId } from "../studio/orchestrator/studioPipelineSteps.js";
import { runStudioVideoPipeline } from "../studio/orchestrator/runStudioVideoPipeline.js";
import {
  completeVideoQueueTaskFailure,
  completeVideoQueueTaskSuccess,
  listClaimableVideoQueueTasks,
  touchVideoQueueTaskHeartbeat,
  tryClaimVideoQueueTask,
  type VideoQueueTaskRecord,
} from "./videoTaskQueue.js";
import type { BiographyVideoQueuePayload, StudioVideoQueuePayload } from "./videoTaskQueueTypes.js";

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
  queueTaskId?: string;
  kind?: VideoQueueTaskRecord["kind"];
  error?: string;
};

function scopeFromRecord(rec: VideoQueueTaskRecord): InterviewScope {
  return { userId: rec.userId, interviewId: rec.interviewId };
}

function startQueueHeartbeat(
  scope: InterviewScope,
  queueTaskId: string,
  runToken: string,
  intervalMs = DEFAULT_HEARTBEAT_MS,
): { stop: () => void } {
  const timer = setInterval(() => {
    touchVideoQueueTaskHeartbeat(scope, queueTaskId, runToken);
  }, intervalMs);
  return {
    stop: () => clearInterval(timer),
  };
}

function parseBiographyPayload(payload: Record<string, unknown>): BiographyVideoQueuePayload {
  const ttsVoice = typeof payload.ttsVoice === "string" ? payload.ttsVoice.trim() : "";
  if (!ttsVoice) throw new Error("VIDEO_QUEUE_INVALID: biography payload 缺少 ttsVoice");
  const polishMode = payload.polishMode === "stub" || payload.polishMode === "llm" ? payload.polishMode : undefined;
  const styleConfigPath =
    typeof payload.styleConfigPath === "string" && payload.styleConfigPath.trim()
      ? payload.styleConfigPath.trim()
      : undefined;
  const styleId =
    typeof payload.styleId === "string" && payload.styleId.trim() ? payload.styleId.trim() : undefined;
  const throughStep =
    typeof payload.throughStep === "string" && payload.throughStep.trim() ? payload.throughStep.trim() : undefined;
  const textTaskId =
    typeof payload.textTaskId === "string" && payload.textTaskId.trim() ? payload.textTaskId.trim() : undefined;
  return { ttsVoice, polishMode, styleConfigPath, styleId, textTaskId, throughStep };
}

function parseStudioPayload(payload: Record<string, unknown>): StudioVideoQueuePayload {
  const hostVoice = typeof payload.hostVoice === "string" ? payload.hostVoice.trim() : "";
  const guestVoice = typeof payload.guestVoice === "string" ? payload.guestVoice.trim() : "";
  if (!hostVoice || !guestVoice) {
    throw new Error("VIDEO_QUEUE_INVALID: studio payload 缺少 hostVoice/guestVoice");
  }
  const qa =
    payload.qaGranularity === "hybrid" ||
    payload.qaGranularity === "per_event" ||
    payload.qaGranularity === "batch"
      ? payload.qaGranularity
      : undefined;
  const polishMode = payload.polishMode === "stub" || payload.polishMode === "llm" ? payload.polishMode : undefined;
  const throughStep =
    typeof payload.throughStep === "string" && payload.throughStep.trim() ? payload.throughStep.trim() : undefined;
  const textTaskId =
    typeof payload.textTaskId === "string" && payload.textTaskId.trim() ? payload.textTaskId.trim() : undefined;
  return { hostVoice, guestVoice, qaGranularity: qa, polishMode, textTaskId, throughStep };
}

/** 执行已认领的队列任务（调用方须先 claim 并取得 runToken）。 */
export async function executeVideoQueueTask(
  rec: VideoQueueTaskRecord,
  runToken: string,
): Promise<unknown> {
  const scope = scopeFromRecord(rec);
  const hb = startQueueHeartbeat(scope, rec.queueTaskId, runToken);

  try {
    switch (rec.kind) {
      case "create_video_biography": {
        const p = parseBiographyPayload(rec.payload);
        return await runBiographyVideoPipeline(scope, {
          taskId: rec.videoTaskId,
          ttsVoice: p.ttsVoice,
          styleConfigPath: p.styleConfigPath,
          styleId: p.styleId,
          textTaskId: p.textTaskId,
          polishMode: p.polishMode,
          ...(p.throughStep
            ? {
                throughStep: p.throughStep as typeof VIDEO_PREP_STEPS.POLISH | BiographyPipelineStepId,
              }
            : {}),
          onStepComplete: () => touchVideoQueueTaskHeartbeat(scope, rec.queueTaskId, runToken),
        });
      }
      case "create_video_studio": {
        const p = parseStudioPayload(rec.payload);
        return await runStudioVideoPipeline(scope, {
          taskId: rec.videoTaskId,
          hostVoice: p.hostVoice,
          guestVoice: p.guestVoice,
          qaGranularity: p.qaGranularity,
          textTaskId: p.textTaskId,
          polishMode: p.polishMode,
          ...(p.throughStep
            ? {
                throughStep: p.throughStep as typeof VIDEO_PREP_STEPS.POLISH | StudioPipelineStepId,
              }
            : {}),
          onStepComplete: () => touchVideoQueueTaskHeartbeat(scope, rec.queueTaskId, runToken),
        });
      }
      default:
        throw new Error(`VIDEO_QUEUE_UNKNOWN_KIND: ${String(rec.kind)}`);
    }
  } finally {
    hb.stop();
  }
}

/** 扫描全部用户采访目录，列出可认领队列任务（queued 优先于 reclaim）。 */
export function listAllClaimableVideoQueueTasks(): Array<{ scope: InterviewScope; record: VideoQueueTaskRecord }> {
  const out: Array<{ scope: InterviewScope; record: VideoQueueTaskRecord }> = [];
  if (!fs.existsSync(DATA_USERS_ROOT)) return out;

  for (const userId of fs.readdirSync(DATA_USERS_ROOT)) {
    const interviewsDir = path.join(DATA_USERS_ROOT, userId, "采访");
    if (!fs.existsSync(interviewsDir)) continue;
    for (const interviewId of fs.readdirSync(interviewsDir)) {
      const scope = { userId, interviewId };
      for (const record of listClaimableVideoQueueTasks(scope)) {
        out.push({ scope, record });
      }
    }
  }

  return out.sort((a, b) => Date.parse(a.record.createdAt) - Date.parse(b.record.createdAt));
}

/** 认领并执行一条队列任务；无任务时返回 processed=false。 */
export async function runVideoWorkerOnce(): Promise<VideoWorkerRunResult> {
  const candidates = listAllClaimableVideoQueueTasks();
  if (candidates.length === 0) return { processed: false };

  for (const { scope, record } of candidates) {
    const claim = tryClaimVideoQueueTask(scope, record.queueTaskId);
    if (!claim.ok || !claim.record || !claim.runToken) continue;

    try {
      const result = await executeVideoQueueTask(claim.record, claim.runToken);
      completeVideoQueueTaskSuccess(scope, claim.record.queueTaskId, claim.runToken, result);
      return {
        processed: true,
        queueTaskId: claim.record.queueTaskId,
        kind: claim.record.kind,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      completeVideoQueueTaskFailure(scope, claim.record.queueTaskId, claim.runToken, {
        code: "VIDEO_WORKER_FAILED",
        message,
      });
      return {
        processed: true,
        queueTaskId: claim.record.queueTaskId,
        kind: claim.record.kind,
        error: message,
      };
    }
  }

  return { processed: false };
}

/** Worker 主循环：轮询认领并执行；`once=true` 时只跑一轮。 */
export async function runVideoWorkerLoop(opts?: { pollMs?: number; once?: boolean }): Promise<void> {
  const pollMs = opts?.pollMs ?? DEFAULT_POLL_MS;
  const once = opts?.once ?? false;

  for (;;) {
    const r = await runVideoWorkerOnce();
    if (r.processed) {
      const tag = r.error ? `FAILED ${r.error}` : "OK";
      console.log(`[video-worker] ${r.kind ?? "?"} ${r.queueTaskId ?? "?"} ${tag}`);
    }
    if (once) break;
    if (!r.processed) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
