import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { assertInterviewExists, getInterviewRootDir } from "../services/interviewWorkspace.service";
import {
  getTextTaskPaths,
  openTextTask,
  readTextTaskMeta,
  TEXT_TASKS_DIR,
  type TextProductionMode,
  type TextTaskMeta,
  type TextTaskStatus,
} from "./orchestrator/textTaskWorkspace.js";

/** 文本任务列表项（来自 meta.json）。 */
export type TextTaskListItem = {
  taskId: string;
  productionMode: TextProductionMode;
  status: TextTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedSteps: string[];
  lastError?: string;
};

/** 产物侧快照（不含正文全文）。 */
export type TextTaskOutputSnapshot = {
  articlePath: string;
  hasArticle: boolean;
  articleLength?: number;
  sectionCount?: number;
  skippedModel?: boolean;
};

/** 单任务进度：meta + 可选产物快照（文本线无 worker 队列）。 */
export type TextTaskProgress = TextTaskListItem & {
  output: TextTaskOutputSnapshot | null;
};

function metaToListItem(meta: TextTaskMeta): TextTaskListItem {
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

function readOutputSnapshot(paths: ReturnType<typeof getTextTaskPaths>): TextTaskOutputSnapshot | null {
  const rel = path.relative(paths.taskRoot, paths.articlePath).split(path.sep).join("/");
  if (!fs.existsSync(paths.articlePath)) {
    return { articlePath: rel, hasArticle: false };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(paths.articlePath, "utf-8")) as Record<string, unknown>;
    const article = typeof raw.article === "string" ? raw.article : "";
    return {
      articlePath: rel,
      hasArticle: article.trim().length > 0,
      ...(article ? { articleLength: article.length } : {}),
      ...(typeof raw.sectionCount === "number" ? { sectionCount: raw.sectionCount } : {}),
      ...(typeof raw.skippedModel === "boolean" ? { skippedModel: raw.skippedModel } : {}),
    };
  } catch {
    return { articlePath: rel, hasArticle: false };
  }
}

/** 列出采访下所有文本任务（按 createdAt 降序）。 */
export function listTextTasks(scope: InterviewScope): TextTaskListItem[] {
  assertInterviewExists(scope);
  const dir = path.join(getInterviewRootDir(scope), TEXT_TASKS_DIR);
  if (!fs.existsSync(dir)) return [];

  const out: TextTaskListItem[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const meta = readTextTaskMeta(getTextTaskPaths(scope, ent.name));
    if (!meta || meta.interviewId !== scope.interviewId) continue;
    out.push(metaToListItem(meta));
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

/**
 * 查询单条文本任务进度：meta 为主（步骤、错误），附带产物快照（是否存在、长度等）。
 * 任务不存在时抛 `TEXT_TASK_NOT_FOUND`。
 */
export function getTextTaskProgress(scope: InterviewScope, taskId: string): TextTaskProgress {
  const handle = openTextTask(scope, taskId);
  const meta = readTextTaskMeta(handle.paths);
  if (!meta) {
    throw new Error(`TEXT_TASK_NOT_FOUND: 文本任务「${taskId}」不存在或 meta 无效`);
  }
  const output = meta.status === "success" || fs.existsSync(handle.paths.articlePath)
    ? readOutputSnapshot(handle.paths)
    : null;
  return {
    ...metaToListItem(meta),
    output,
  };
}
