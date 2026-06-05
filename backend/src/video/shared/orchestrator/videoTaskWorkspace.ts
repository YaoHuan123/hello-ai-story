import crypto from "node:crypto";
import path from "node:path";
import type { InterviewScope } from "../../../services/interviewWorkspace.service";
import {
  assertInterviewExists,
  getInterviewRootDir,
} from "../../../services/interviewWorkspace.service";
import { PIPELINE_SUBDIR } from "../constants/prepFilenames.js";
import { readJsonObjectFile, writeJsonAtomic } from "./pipelineDisk.js";

export const VIDEO_TASKS_DIR = "成片";
export const VIDEO_TASK_INPUT_DIR = "输入";
export const VIDEO_TASK_META_FILE = "meta.json";
export const SECTIONS_SNAPSHOT_FILE = "sections-snapshot.json";

export type VideoProductionMode = "biography_narration" | "interview_studio";

export type VideoTaskStatus = "pending" | "queued" | "running" | "success" | "failed";

export type VideoTaskMeta = {
  id: string;
  interviewId: string;
  productionMode: VideoProductionMode;
  status: VideoTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedSteps: string[];
  lastError?: string;
};

export type VideoTaskPaths = {
  taskRoot: string;
  inputDir: string;
  pipelineDir: string;
  metaPath: string;
};

export type VideoTaskHandle = {
  scope: InterviewScope;
  taskId: string;
  paths: VideoTaskPaths;
};

export function getVideoTaskRoot(scope: InterviewScope, taskId: string): string {
  return path.join(getInterviewRootDir(scope), VIDEO_TASKS_DIR, taskId.trim());
}

export function getVideoTaskPaths(scope: InterviewScope, taskId: string): VideoTaskPaths {
  const taskRoot = getVideoTaskRoot(scope, taskId);
  return {
    taskRoot,
    inputDir: path.join(taskRoot, VIDEO_TASK_INPUT_DIR),
    pipelineDir: path.join(taskRoot, PIPELINE_SUBDIR),
    metaPath: path.join(taskRoot, VIDEO_TASK_META_FILE),
  };
}

export function readVideoTaskMeta(paths: VideoTaskPaths): VideoTaskMeta | null {
  const raw = readJsonObjectFile(paths.metaPath);
  if (typeof raw.id !== "string" || typeof raw.interviewId !== "string") {
    return null;
  }
  return raw as unknown as VideoTaskMeta;
}

export function writeVideoTaskMeta(paths: VideoTaskPaths, meta: VideoTaskMeta): void {
  writeJsonAtomic(paths.metaPath, meta);
}

function createVideoTask(scope: InterviewScope, productionMode: VideoProductionMode): VideoTaskHandle {
  assertInterviewExists(scope);
  const taskId = crypto.randomUUID();
  const paths = getVideoTaskPaths(scope, taskId);
  const now = new Date().toISOString();
  const meta: VideoTaskMeta = {
    id: taskId,
    interviewId: scope.interviewId,
    productionMode,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    completedSteps: [],
  };
  writeVideoTaskMeta(paths, meta);
  return { scope, taskId, paths };
}

export function createBiographyVideoTask(scope: InterviewScope): VideoTaskHandle {
  return createVideoTask(scope, "biography_narration");
}

export function createStudioVideoTask(scope: InterviewScope): VideoTaskHandle {
  return createVideoTask(scope, "interview_studio");
}

export function openVideoTask(scope: InterviewScope, taskId: string): VideoTaskHandle {
  assertInterviewExists(scope);
  const paths = getVideoTaskPaths(scope, taskId);
  const meta = readVideoTaskMeta(paths);
  if (!meta) {
    throw new Error(`VIDEO_TASK_NOT_FOUND: 成片任务「${taskId}」不存在或 meta 无效`);
  }
  if (meta.interviewId !== scope.interviewId) {
    throw new Error(`VIDEO_TASK_SCOPE_MISMATCH: 任务不属于当前采访`);
  }
  return { scope, taskId, paths };
}

export function resolveVideoTask(
  scope: InterviewScope,
  productionMode: VideoProductionMode,
  taskId?: string,
): VideoTaskHandle {
  if (taskId) {
    return openVideoTask(scope, taskId);
  }
  return productionMode === "interview_studio"
    ? createStudioVideoTask(scope)
    : createBiographyVideoTask(scope);
}

export function resolveBiographyVideoTask(scope: InterviewScope, taskId?: string): VideoTaskHandle {
  return resolveVideoTask(scope, "biography_narration", taskId);
}

export function resolveStudioVideoTask(scope: InterviewScope, taskId?: string): VideoTaskHandle {
  return resolveVideoTask(scope, "interview_studio", taskId);
}
