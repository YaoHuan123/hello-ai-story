import crypto from "node:crypto";
import path from "node:path";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import {
  assertInterviewExists,
  getInterviewRootDir,
} from "../../services/interviewWorkspace.service";
import {
  TEXT_ARTICLE_OUTPUT_FILE,
  TEXT_SECTIONS_SNAPSHOT_FILE,
  TEXT_TASK_INPUT_DIR,
  TEXT_TASK_OUTPUT_DIR,
} from "../constants/textFilenames.js";
import { isoNow, readJsonObjectFile, writeJsonAtomic } from "../../video/shared/orchestrator/pipelineDisk.js";

export const TEXT_TASKS_DIR = "文本";
export const TEXT_TASK_META_FILE = "meta.json";

export type TextProductionMode = "biography_formal_article";

export type TextTaskStatus = "pending" | "running" | "success" | "failed";

export type TextTaskMeta = {
  id: string;
  interviewId: string;
  productionMode: TextProductionMode;
  status: TextTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedSteps: string[];
  lastError?: string;
};

export type TextTaskPaths = {
  taskRoot: string;
  inputDir: string;
  outputDir: string;
  metaPath: string;
  articlePath: string;
};

export type TextTaskHandle = {
  scope: InterviewScope;
  taskId: string;
  paths: TextTaskPaths;
};

export function getTextTaskRoot(scope: InterviewScope, taskId: string): string {
  return path.join(getInterviewRootDir(scope), TEXT_TASKS_DIR, taskId.trim());
}

export function getTextTaskPaths(scope: InterviewScope, taskId: string): TextTaskPaths {
  const taskRoot = getTextTaskRoot(scope, taskId);
  return {
    taskRoot,
    inputDir: path.join(taskRoot, TEXT_TASK_INPUT_DIR),
    outputDir: path.join(taskRoot, TEXT_TASK_OUTPUT_DIR),
    metaPath: path.join(taskRoot, TEXT_TASK_META_FILE),
    articlePath: path.join(taskRoot, TEXT_TASK_OUTPUT_DIR, TEXT_ARTICLE_OUTPUT_FILE),
  };
}

export function readTextTaskMeta(paths: TextTaskPaths): TextTaskMeta | null {
  const raw = readJsonObjectFile(paths.metaPath);
  if (typeof raw.id !== "string" || typeof raw.interviewId !== "string") {
    return null;
  }
  return raw as unknown as TextTaskMeta;
}

export function writeTextTaskMeta(paths: TextTaskPaths, meta: TextTaskMeta): void {
  writeJsonAtomic(paths.metaPath, meta);
}

export function createTextTask(scope: InterviewScope): TextTaskHandle {
  assertInterviewExists(scope);
  const taskId = crypto.randomUUID();
  const paths = getTextTaskPaths(scope, taskId);
  const now = new Date().toISOString();
  const meta: TextTaskMeta = {
    id: taskId,
    interviewId: scope.interviewId,
    productionMode: "biography_formal_article",
    status: "pending",
    createdAt: now,
    updatedAt: now,
    completedSteps: [],
  };
  writeTextTaskMeta(paths, meta);
  return { scope, taskId, paths };
}

export function openTextTask(scope: InterviewScope, taskId: string): TextTaskHandle {
  assertInterviewExists(scope);
  const paths = getTextTaskPaths(scope, taskId);
  const meta = readTextTaskMeta(paths);
  if (!meta) {
    throw new Error(`TEXT_TASK_NOT_FOUND: 文本任务「${taskId}」不存在或 meta 无效`);
  }
  if (meta.interviewId !== scope.interviewId) {
    throw new Error("TEXT_TASK_SCOPE_MISMATCH: 任务不属于当前采访");
  }
  return { scope, taskId, paths };
}

export function resolveTextTask(scope: InterviewScope, taskId?: string): TextTaskHandle {
  return taskId ? openTextTask(scope, taskId) : createTextTask(scope);
}

export type TextArticleFile = {
  savedAt: string;
  inputSectionsSnapshotFile: string;
  sectionCount: number;
  article: string;
  skippedModel: boolean;
};

export function writeTextArticleFile(
  paths: TextTaskPaths,
  payload: Omit<TextArticleFile, "savedAt">,
): void {
  writeJsonAtomic(paths.articlePath, { savedAt: isoNow(), ...payload });
}
