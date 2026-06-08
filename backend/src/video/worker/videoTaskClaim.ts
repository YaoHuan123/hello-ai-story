import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_USERS_ROOT } from "../../config.js";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import { getInterviewRootDir } from "../../services/interviewWorkspace.service";
import {
  getVideoTaskPaths,
  readVideoTaskMeta,
  VIDEO_TASKS_DIR,
  writeVideoTaskMeta,
  type VideoTaskMeta,
} from "../shared/orchestrator/videoTaskWorkspace.js";
import { readJsonObjectFile } from "../shared/orchestrator/pipelineDisk.js";
import { isVideoTaskDeleted, videoTaskDeletedPath } from "./videoTaskRequest.js";

const HEARTBEAT_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.VIDEO_TASK_HEARTBEAT_TIMEOUT_SEC ?? "120", 10);
  if (!Number.isFinite(raw) || raw < 10) return 120_000;
  return raw * 1000;
})();

export const VIDEO_TASK_DELETED_ERROR = "VIDEO_TASK_DELETED";

export function isFreshVideoTaskHeartbeat(heartbeatAt: string | undefined): boolean {
  if (!heartbeatAt) return false;
  const ms = Date.parse(heartbeatAt);
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= HEARTBEAT_TIMEOUT_MS;
}

export function isVideoTaskActive(meta: VideoTaskMeta): boolean {
  if (meta.status === "queued") return true;
  if (meta.status === "running") return isFreshVideoTaskHeartbeat(meta.heartbeatAt);
  return false;
}

export function tryClaimVideoTask(
  scope: InterviewScope,
  taskId: string,
): { ok: boolean; meta: VideoTaskMeta | null; runToken: string | null } {
  if (isVideoTaskDeleted(scope, taskId)) {
    return { ok: false, meta: null, runToken: null };
  }

  const paths = getVideoTaskPaths(scope, taskId);
  const cur = readVideoTaskMeta(paths);
  if (!cur) return { ok: false, meta: null, runToken: null };

  const runToken = crypto.randomUUID();
  const now = new Date().toISOString();

  if (cur.status === "queued") {
    const next: VideoTaskMeta = {
      ...cur,
      status: "running",
      startedAt: cur.startedAt ?? now,
      updatedAt: now,
      runToken,
      heartbeatAt: now,
      lastError: undefined,
    };
    writeVideoTaskMeta(paths, next);
    return { ok: true, meta: next, runToken };
  }

  if (cur.status === "running" && !isFreshVideoTaskHeartbeat(cur.heartbeatAt)) {
    const next: VideoTaskMeta = {
      ...cur,
      status: "running",
      startedAt: cur.startedAt ?? now,
      updatedAt: now,
      runToken,
      heartbeatAt: now,
    };
    writeVideoTaskMeta(paths, next);
    return { ok: true, meta: next, runToken };
  }

  return { ok: false, meta: cur, runToken: null };
}

export function touchVideoTaskHeartbeat(scope: InterviewScope, taskId: string, runToken: string): void {
  if (isVideoTaskDeleted(scope, taskId)) {
    throw new Error(VIDEO_TASK_DELETED_ERROR);
  }

  const paths = getVideoTaskPaths(scope, taskId);
  const cur = readVideoTaskMeta(paths);
  if (!cur || cur.status !== "running" || cur.runToken !== runToken) return;

  const now = new Date().toISOString();
  writeVideoTaskMeta(paths, { ...cur, heartbeatAt: now, updatedAt: now });
}

export function listClaimableVideoTasks(scope: InterviewScope): Array<{ taskId: string; meta: VideoTaskMeta }> {
  const dir = path.join(getInterviewRootDir(scope), VIDEO_TASKS_DIR);
  if (!fs.existsSync(dir)) return [];

  const out: Array<{ taskId: string; meta: VideoTaskMeta }> = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const taskId = ent.name;
    if (isVideoTaskDeleted(scope, taskId)) continue;

    const meta = readVideoTaskMeta(getVideoTaskPaths(scope, taskId));
    if (!meta || meta.interviewId !== scope.interviewId) continue;
    if (meta.status === "queued") {
      out.push({ taskId, meta });
      continue;
    }
    if (meta.status === "running" && !isFreshVideoTaskHeartbeat(meta.heartbeatAt)) {
      out.push({ taskId, meta });
    }
  }

  return out.sort((a, b) => Date.parse(a.meta.createdAt) - Date.parse(b.meta.createdAt));
}

export function listAllClaimableVideoTasks(): Array<{
  scope: InterviewScope;
  taskId: string;
  meta: VideoTaskMeta;
}> {
  const out: Array<{ scope: InterviewScope; taskId: string; meta: VideoTaskMeta }> = [];
  if (!fs.existsSync(DATA_USERS_ROOT)) return out;

  for (const userId of fs.readdirSync(DATA_USERS_ROOT)) {
    const interviewsDir = path.join(DATA_USERS_ROOT, userId, "采访");
    if (!fs.existsSync(interviewsDir)) continue;
    for (const interviewId of fs.readdirSync(interviewsDir)) {
      const scope = { userId, interviewId };
      for (const item of listClaimableVideoTasks(scope)) {
        out.push({ scope, ...item });
      }
    }
  }

  return out.sort((a, b) => Date.parse(a.meta.createdAt) - Date.parse(b.meta.createdAt));
}

/** 清理已打删除标记的成片目录。 */
export function purgeDeletedVideoTasks(): number {
  let removed = 0;
  if (!fs.existsSync(DATA_USERS_ROOT)) return removed;

  for (const userId of fs.readdirSync(DATA_USERS_ROOT)) {
    const interviewsDir = path.join(DATA_USERS_ROOT, userId, "采访");
    if (!fs.existsSync(interviewsDir)) continue;
    for (const interviewId of fs.readdirSync(interviewsDir)) {
      const scope = { userId, interviewId };
      const tasksDir = path.join(getInterviewRootDir(scope), VIDEO_TASKS_DIR);
      if (!fs.existsSync(tasksDir)) continue;

      for (const ent of fs.readdirSync(tasksDir, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const paths = getVideoTaskPaths(scope, ent.name);
        const deletedPath = videoTaskDeletedPath(paths);
        if (!fs.existsSync(deletedPath)) continue;

        const marker = readJsonObjectFile(deletedPath);
        if (typeof marker.deletedAt !== "string") continue;

        if (fs.existsSync(paths.taskRoot)) {
          fs.rmSync(paths.taskRoot, { recursive: true, force: true });
          removed += 1;
        }
      }
    }
  }

  return removed;
}
