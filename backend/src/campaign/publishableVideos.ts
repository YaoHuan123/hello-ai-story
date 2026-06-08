import type { DatabaseSync } from "node:sqlite";
import { listInterviews, readInterviewMeta, type InterviewScope } from "../services/interviewWorkspace.service";
import { listVideoTaskArtifacts } from "../video/worker/videoTaskArtifacts.js";
import { listVideoTasks } from "../video/worker/videoTaskQuery.js";
import type { PublishableVideoItem } from "./types";

function defaultVideoTitle(interviewTitle: string | undefined, taskId: string): string {
  const base = interviewTitle?.trim() || "我的视频";
  return `${base} · ${taskId.slice(0, 8)}`;
}

function isTaskAlreadyPublished(db: DatabaseSync, interviewId: string, taskId: string): boolean {
  const row = db
    .prepare("SELECT id FROM published_videos WHERE interview_id = ? AND task_id = ? LIMIT 1")
    .get(interviewId, taskId) as { id: string } | undefined;
  return Boolean(row);
}

/** 列出用户可发布到激励计划的成片（status=success 且成品视频存在、未发布过）。 */
export function listPublishableVideos(db: DatabaseSync, userId: string): PublishableVideoItem[] {
  const out: PublishableVideoItem[] = [];

  for (const interview of listInterviews(userId)) {
    const scope: InterviewScope = { userId, interviewId: interview.id };
    for (const task of listVideoTasks(scope)) {
      if (task.status !== "success") continue;
      if (isTaskAlreadyPublished(db, interview.id, task.taskId)) continue;
      try {
        const artifacts = listVideoTaskArtifacts(scope, task.taskId);
        if (!artifacts.primaryVideo.available) continue;
      } catch {
        continue;
      }
      out.push({
        interviewId: interview.id,
        interviewTitle: interview.title?.trim() || undefined,
        taskId: task.taskId,
        productionMode: task.productionMode,
        createdAt: task.createdAt,
        title: defaultVideoTitle(interview.title, task.taskId),
      });
    }
  }

  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

export function resolveVideoForQuiz(
  db: DatabaseSync,
  userId: string,
  interviewId: string,
  taskId: string,
): PublishableVideoItem {
  const id = interviewId.trim();
  const tid = taskId.trim();
  if (!id || !tid) {
    throw new Error("VIDEO_REQUIRED");
  }

  const meta = readInterviewMeta({ userId, interviewId: id });
  if (!meta) {
    throw new Error("VIDEO_NOT_FOUND");
  }

  const scope: InterviewScope = { userId, interviewId: id };
  const tasks = listVideoTasks(scope);
  const task = tasks.find((t) => t.taskId === tid);
  if (!task || task.status !== "success") {
    throw new Error("VIDEO_NOT_READY");
  }

  const artifacts = listVideoTaskArtifacts(scope, tid);
  if (!artifacts.primaryVideo.available) {
    throw new Error("VIDEO_NOT_READY");
  }

  return {
    interviewId: id,
    interviewTitle: meta.title?.trim() || undefined,
    taskId: tid,
    productionMode: task.productionMode,
    createdAt: task.createdAt,
    title: defaultVideoTitle(meta.title, tid),
  };
}

export function resolvePublishableVideo(
  db: DatabaseSync,
  userId: string,
  interviewId: string,
  taskId: string,
): PublishableVideoItem {
  const id = interviewId.trim();
  const tid = taskId.trim();
  if (!id || !tid) {
    throw new Error("VIDEO_REQUIRED");
  }

  const meta = readInterviewMeta({ userId, interviewId: id });
  if (!meta) {
    throw new Error("VIDEO_NOT_FOUND");
  }

  const scope: InterviewScope = { userId, interviewId: id };
  const tasks = listVideoTasks(scope);
  const task = tasks.find((t) => t.taskId === tid);
  if (!task || task.status !== "success") {
    throw new Error("VIDEO_NOT_READY");
  }
  if (isTaskAlreadyPublished(db, id, tid)) {
    throw new Error("VIDEO_ALREADY_PUBLISHED");
  }

  const artifacts = listVideoTaskArtifacts(scope, tid);
  if (!artifacts.primaryVideo.available) {
    throw new Error("VIDEO_NOT_READY");
  }

  return {
    interviewId: id,
    interviewTitle: meta.title?.trim() || undefined,
    taskId: tid,
    productionMode: task.productionMode,
    createdAt: task.createdAt,
    title: defaultVideoTitle(meta.title, tid),
  };
}
