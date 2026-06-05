import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import { assertInterviewExists, getInterviewRootDir } from "../../services/interviewWorkspace.service";
import {
  getVideoTaskPaths,
  openVideoTask,
  readVideoTaskMeta,
  VIDEO_TASKS_DIR,
  type VideoProductionMode,
  type VideoTaskMeta,
  type VideoTaskStatus,
} from "../shared/orchestrator/videoTaskWorkspace.js";
import { readVideoQueueTask } from "./videoTaskQueue.js";
import type { VideoQueueTaskKind, VideoQueueTaskRecord, VideoQueueTaskStatus } from "./videoTaskQueueTypes.js";

/** 成片任务列表项（来自 meta.json）。 */
export type VideoTaskListItem = {
  taskId: string;
  productionMode: VideoProductionMode;
  status: VideoTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedSteps: string[];
  lastError?: string;
};

/** 队列侧快照（不含 payload / result 等大字段）。 */
export type VideoTaskQueueSnapshot = {
  queueTaskId: string;
  status: VideoQueueTaskStatus;
  kind: VideoQueueTaskKind;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  heartbeatAt?: string;
  error?: { code: string; message: string };
};

/** 单任务进度：成片 meta + 可选 worker 队列快照。 */
export type VideoTaskProgress = VideoTaskListItem & {
  queue: VideoTaskQueueSnapshot | null;
};

function metaToListItem(meta: VideoTaskMeta): VideoTaskListItem {
  return {
    taskId: meta.id,
    productionMode: meta.productionMode,
    status: meta.status,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    completedSteps: meta.completedSteps,
    ...(meta.lastError ? { lastError: meta.lastError } : {}),
  };
}

function queueToSnapshot(rec: VideoQueueTaskRecord): VideoTaskQueueSnapshot {
  return {
    queueTaskId: rec.queueTaskId,
    status: rec.status,
    kind: rec.kind,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    ...(rec.startedAt ? { startedAt: rec.startedAt } : {}),
    ...(rec.finishedAt ? { finishedAt: rec.finishedAt } : {}),
    ...(rec.heartbeatAt ? { heartbeatAt: rec.heartbeatAt } : {}),
    ...(rec.error ? { error: rec.error } : {}),
  };
}

/** 列出采访下所有成片任务（按 createdAt 降序）。 */
export function listVideoTasks(scope: InterviewScope): VideoTaskListItem[] {
  assertInterviewExists(scope);
  const dir = path.join(getInterviewRootDir(scope), VIDEO_TASKS_DIR);
  if (!fs.existsSync(dir)) return [];

  const out: VideoTaskListItem[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const meta = readVideoTaskMeta(getVideoTaskPaths(scope, ent.name));
    if (!meta || meta.interviewId !== scope.interviewId) continue;
    out.push(metaToListItem(meta));
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

/**
 * 查询单条成片进度：meta 为主（步骤、错误），队列可选（worker 执行态）。
 * 任务不存在时抛 `VIDEO_TASK_NOT_FOUND`。
 */
export function getVideoTaskProgress(scope: InterviewScope, taskId: string): VideoTaskProgress {
  const handle = openVideoTask(scope, taskId);
  const meta = readVideoTaskMeta(handle.paths);
  if (!meta) {
    throw new Error(`VIDEO_TASK_NOT_FOUND: 成片任务「${taskId}」不存在或 meta 无效`);
  }
  const queueRec = readVideoQueueTask(scope, taskId);
  return {
    ...metaToListItem(meta),
    queue: queueRec ? queueToSnapshot(queueRec) : null,
  };
}
