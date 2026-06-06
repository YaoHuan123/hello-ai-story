import fs from "node:fs";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { getTextTaskPaths, openTextTask } from "./orchestrator/textTaskWorkspace.js";
import { listTextTasks } from "./textTaskQuery.js";

export type StoryArticleSource = {
  taskId: string;
  article: string;
  skippedModel?: boolean;
};

export type StoryTextTaskOption = {
  taskId: string;
  createdAt: string;
  articleLength: number;
};

function readArticleFromTask(scope: InterviewScope, taskId: string): StoryArticleSource | null {
  const paths = getTextTaskPaths(scope, taskId);
  if (!fs.existsSync(paths.articlePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(paths.articlePath, "utf-8")) as Record<string, unknown>;
    const article = typeof raw.article === "string" ? raw.article.trim() : "";
    if (!article) return null;
    return {
      taskId,
      article,
      ...(typeof raw.skippedModel === "boolean" ? { skippedModel: raw.skippedModel } : {}),
    };
  } catch {
    return null;
  }
}

/** 取采访下最近一次成功文本任务的正式文章（按 createdAt 降序）。 */
export function getLatestStoryArticle(scope: InterviewScope): StoryArticleSource | null {
  for (const task of listTextTasks(scope)) {
    if (task.status !== "success") continue;
    const hit = readArticleFromTask(scope, task.taskId);
    if (hit) return hit;
  }
  return null;
}

/** 按 taskId 读取故事正文；任务不存在或无文章时抛错。 */
export function getStoryArticleByTaskId(scope: InterviewScope, taskId: string): StoryArticleSource {
  const handle = openTextTask(scope, taskId);
  const hit = readArticleFromTask(scope, handle.taskId);
  if (!hit) {
    throw new Error(`STORY_ARTICLE_MISSING: 文本任务「${taskId}」尚无可用故事正文`);
  }
  return hit;
}

/** 列出可选用作成片素材的成功文本任务（按 createdAt 降序）。 */
export function listStoryTextTaskOptions(scope: InterviewScope): StoryTextTaskOption[] {
  const out: StoryTextTaskOption[] = [];
  for (const task of listTextTasks(scope)) {
    if (task.status !== "success") continue;
    const hit = readArticleFromTask(scope, task.taskId);
    if (!hit) continue;
    out.push({
      taskId: task.taskId,
      createdAt: task.createdAt,
      articleLength: hit.article.length,
    });
  }
  return out;
}

/** 指定文本任务或默认取最近一次成功故事。 */
export function resolveStoryArticle(scope: InterviewScope, textTaskId?: string): StoryArticleSource {
  const id = textTaskId?.trim();
  if (id) return getStoryArticleByTaskId(scope, id);
  const latest = getLatestStoryArticle(scope);
  if (!latest) {
    throw new Error("VIDEO_PIPELINE_NO_STORY_TEXT: 请先在「创作文本」生成故事文本");
  }
  return latest;
}

export function assertStoryTextReady(scope: InterviewScope, textTaskId?: string): void {
  resolveStoryArticle(scope, textTaskId);
}
