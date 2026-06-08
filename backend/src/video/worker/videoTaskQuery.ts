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
} from "../shared/orchestrator/videoTaskWorkspace.js";
import { isVideoTaskDeleted } from "./videoTaskRequest.js";

/** 成片任务列表项（来自 meta.json）。 */
export type VideoTaskListItem = {
  taskId: string;
  productionMode: VideoProductionMode;
  status: VideoTaskMeta["status"];
  createdAt: string;
  updatedAt: string;
  completedSteps: string[];
  lastError?: string;
  heartbeatAt?: string;
};

/** 单任务进度（仅 meta）。 */
export type VideoTaskProgress = VideoTaskListItem;

function metaToListItem(meta: VideoTaskMeta): VideoTaskListItem {
  return {
    taskId: meta.id,
    productionMode: meta.productionMode,
    status: meta.status,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    completedSteps: meta.completedSteps,
    ...(meta.lastError ? { lastError: meta.lastError } : {}),
    ...(meta.heartbeatAt ? { heartbeatAt: meta.heartbeatAt } : {}),
  };
}

/** 列出采访下所有成片任务（按 createdAt 降序，不含已删除）。 */
export function listVideoTasks(scope: InterviewScope): VideoTaskListItem[] {
  assertInterviewExists(scope);
  const dir = path.join(getInterviewRootDir(scope), VIDEO_TASKS_DIR);
  if (!fs.existsSync(dir)) return [];

  const out: VideoTaskListItem[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (isVideoTaskDeleted(scope, ent.name)) continue;
    const meta = readVideoTaskMeta(getVideoTaskPaths(scope, ent.name));
    if (!meta || meta.interviewId !== scope.interviewId) continue;
    out.push(metaToListItem(meta));
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

/**
 * 查询单条成片进度（meta.json）。
 * 已删除或不存在时抛 `VIDEO_TASK_NOT_FOUND`。
 */
export function getVideoTaskProgress(scope: InterviewScope, taskId: string): VideoTaskProgress {
  if (isVideoTaskDeleted(scope, taskId)) {
    throw new Error(`VIDEO_TASK_NOT_FOUND: 成片任务「${taskId}」不存在或 meta 无效`);
  }
  const handle = openVideoTask(scope, taskId);
  const meta = readVideoTaskMeta(handle.paths);
  if (!meta) {
    throw new Error(`VIDEO_TASK_NOT_FOUND: 成片任务「${taskId}」不存在或 meta 无效`);
  }
  return metaToListItem(meta);
}
