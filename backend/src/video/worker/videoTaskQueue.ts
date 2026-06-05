import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import { getInterviewRootDir } from "../../services/interviewWorkspace.service";
import { readJsonObjectFile, writeJsonAtomic } from "../shared/orchestrator/pipelineDisk.js";
import {
  VIDEO_QUEUE_DIR,
  VIDEO_QUEUE_FILE_PREFIX,
  type VideoQueueTaskRecord,
  type VideoQueueTaskStatus,
} from "./videoTaskQueueTypes.js";

export type { VideoQueueTaskRecord, VideoQueueTaskStatus } from "./videoTaskQueueTypes.js";

const HEARTBEAT_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.VIDEO_QUEUE_HEARTBEAT_TIMEOUT_SEC ?? "120", 10);
  if (!Number.isFinite(raw) || raw < 10) return 120_000;
  return raw * 1000;
})();

export function videoQueueDir(scope: InterviewScope): string {
  return path.join(getInterviewRootDir(scope), VIDEO_QUEUE_DIR);
}

export function videoQueueTaskFileName(queueTaskId: string): string {
  return `${VIDEO_QUEUE_FILE_PREFIX}${queueTaskId.trim()}.json`;
}

export function videoQueueTaskPath(scope: InterviewScope, queueTaskId: string): string {
  return path.join(videoQueueDir(scope), videoQueueTaskFileName(queueTaskId));
}

export function isFreshVideoQueueHeartbeat(heartbeatAt: string | undefined): boolean {
  if (!heartbeatAt) return false;
  const ms = Date.parse(heartbeatAt);
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= HEARTBEAT_TIMEOUT_MS;
}

export function parseVideoQueueTaskRecord(raw: Record<string, unknown> | null): VideoQueueTaskRecord | null {
  if (!raw) return null;
  const queueTaskId = typeof raw.queueTaskId === "string" ? raw.queueTaskId.trim() : "";
  const userId = typeof raw.userId === "string" ? raw.userId.trim() : "";
  const interviewId = typeof raw.interviewId === "string" ? raw.interviewId.trim() : "";
  const videoTaskId = typeof raw.videoTaskId === "string" ? raw.videoTaskId.trim() : "";
  const kind = raw.kind;
  const st = raw.status as VideoQueueTaskStatus;
  if (!queueTaskId || !userId || !interviewId || !videoTaskId) return null;
  if (kind !== "create_video_biography" && kind !== "create_video_studio") return null;
  if (st !== "queued" && st !== "running" && st !== "success" && st !== "failed") return null;
  const err = raw.error;
  return {
    queueTaskId,
    userId,
    interviewId,
    videoTaskId,
    kind,
    payload:
      raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload)
        ? (raw.payload as Record<string, unknown>)
        : {},
    status: st,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : undefined,
    finishedAt: typeof raw.finishedAt === "string" ? raw.finishedAt : undefined,
    runToken: typeof raw.runToken === "string" ? raw.runToken : undefined,
    heartbeatAt: typeof raw.heartbeatAt === "string" ? raw.heartbeatAt : undefined,
    result: "result" in raw ? raw.result : undefined,
    error:
      err && typeof err === "object" && !Array.isArray(err) && typeof (err as { message?: unknown }).message === "string"
        ? {
            code:
              typeof (err as { code?: unknown }).code === "string"
                ? (err as { code: string }).code
                : "VIDEO_QUEUE_TASK_FAILED",
            message: String((err as { message: string }).message),
          }
        : undefined,
  };
}

export function readVideoQueueTask(scope: InterviewScope, queueTaskId: string): VideoQueueTaskRecord | null {
  return parseVideoQueueTaskRecord(readJsonObjectFile(videoQueueTaskPath(scope, queueTaskId)));
}

export function writeVideoQueueTask(scope: InterviewScope, record: VideoQueueTaskRecord): void {
  writeJsonAtomic(videoQueueTaskPath(scope, record.queueTaskId), {
    ...record,
    updatedAt: new Date().toISOString(),
  });
}

export function enqueueVideoQueueTask(
  scope: InterviewScope,
  params: {
    videoTaskId: string;
    kind: VideoQueueTaskRecord["kind"];
    payload: Record<string, unknown>;
    queueTaskId?: string;
  },
): VideoQueueTaskRecord {
  const queueTaskId = params.queueTaskId?.trim() || params.videoTaskId.trim();
  const now = new Date().toISOString();
  const rec: VideoQueueTaskRecord = {
    queueTaskId,
    userId: scope.userId,
    interviewId: scope.interviewId,
    videoTaskId: params.videoTaskId.trim(),
    kind: params.kind,
    payload: params.payload,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  fs.mkdirSync(videoQueueDir(scope), { recursive: true });
  writeVideoQueueTask(scope, rec);
  return rec;
}

export function tryClaimVideoQueueTask(
  scope: InterviewScope,
  queueTaskId: string,
): { ok: boolean; record: VideoQueueTaskRecord | null; runToken: string | null } {
  const p = videoQueueTaskPath(scope, queueTaskId);
  const cur = parseVideoQueueTaskRecord(readJsonObjectFile(p));
  if (!cur) return { ok: false, record: null, runToken: null };

  const runToken = crypto.randomUUID();
  const now = new Date().toISOString();

  if (cur.status === "queued") {
    const next: VideoQueueTaskRecord = {
      ...cur,
      status: "running",
      startedAt: cur.startedAt ?? now,
      updatedAt: now,
      runToken,
      heartbeatAt: now,
    };
    writeJsonAtomic(p, next);
    return { ok: true, record: next, runToken };
  }

  if (cur.status === "running" && !isFreshVideoQueueHeartbeat(cur.heartbeatAt)) {
    const next: VideoQueueTaskRecord = {
      ...cur,
      status: "running",
      startedAt: cur.startedAt ?? now,
      updatedAt: now,
      runToken,
      heartbeatAt: now,
    };
    writeJsonAtomic(p, next);
    return { ok: true, record: next, runToken };
  }

  return { ok: false, record: cur, runToken: null };
}

export function touchVideoQueueTaskHeartbeat(
  scope: InterviewScope,
  queueTaskId: string,
  runToken: string,
): boolean {
  const p = videoQueueTaskPath(scope, queueTaskId);
  const cur = parseVideoQueueTaskRecord(readJsonObjectFile(p));
  if (!cur || cur.status !== "running" || cur.runToken !== runToken) return false;
  const now = new Date().toISOString();
  writeJsonAtomic(p, { ...cur, heartbeatAt: now, updatedAt: now });
  return true;
}

export function completeVideoQueueTaskSuccess(
  scope: InterviewScope,
  queueTaskId: string,
  runToken: string,
  result: unknown,
): boolean {
  const p = videoQueueTaskPath(scope, queueTaskId);
  const cur = parseVideoQueueTaskRecord(readJsonObjectFile(p));
  if (!cur || cur.status !== "running" || cur.runToken !== runToken) return false;
  const now = new Date().toISOString();
  writeJsonAtomic(p, {
    ...cur,
    status: "success",
    finishedAt: now,
    updatedAt: now,
    result,
    error: undefined,
  });
  return true;
}

export function completeVideoQueueTaskFailure(
  scope: InterviewScope,
  queueTaskId: string,
  runToken: string,
  error: { code: string; message: string },
): boolean {
  const p = videoQueueTaskPath(scope, queueTaskId);
  const cur = parseVideoQueueTaskRecord(readJsonObjectFile(p));
  if (!cur || cur.status !== "running" || cur.runToken !== runToken) return false;
  const now = new Date().toISOString();
  writeJsonAtomic(p, {
    ...cur,
    status: "failed",
    finishedAt: now,
    updatedAt: now,
    error,
  });
  return true;
}

export function listVideoQueueTasks(scope: InterviewScope): VideoQueueTaskRecord[] {
  const dir = videoQueueDir(scope);
  if (!fs.existsSync(dir)) return [];
  const out: VideoQueueTaskRecord[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(VIDEO_QUEUE_FILE_PREFIX) || !name.endsWith(".json")) continue;
    const rec = parseVideoQueueTaskRecord(readJsonObjectFile(path.join(dir, name)));
    if (rec) out.push(rec);
  }
  return out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function listClaimableVideoQueueTasks(scope: InterviewScope): VideoQueueTaskRecord[] {
  return listVideoQueueTasks(scope).filter(
    (r) => r.status === "queued" || (r.status === "running" && !isFreshVideoQueueHeartbeat(r.heartbeatAt)),
  );
}

export function requeueFailedVideoTask(scope: InterviewScope, queueTaskId: string): VideoQueueTaskRecord {
  const cur = readVideoQueueTask(scope, queueTaskId);
  if (!cur) throw new Error(`VIDEO_QUEUE_NOT_FOUND: ${queueTaskId}`);
  if (cur.status !== "failed") {
    throw new Error(`VIDEO_QUEUE_RETRY_INVALID: 仅 failed 任务可重试，当前 ${cur.status}`);
  }
  const now = new Date().toISOString();
  const next: VideoQueueTaskRecord = {
    ...cur,
    status: "queued",
    updatedAt: now,
    startedAt: undefined,
    finishedAt: undefined,
    runToken: undefined,
    heartbeatAt: undefined,
    error: undefined,
    result: undefined,
  };
  writeVideoQueueTask(scope, next);
  return next;
}
