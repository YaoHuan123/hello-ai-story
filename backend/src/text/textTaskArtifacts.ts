import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { TEXT_ARTICLE_OUTPUT_FILE, TEXT_TASK_OUTPUT_DIR } from "./constants/textFilenames.js";
import { openTextTask, readTextTaskMeta } from "./orchestrator/textTaskWorkspace.js";

export type TextArtifactItem = {
  kind: "article";
  relativePath: string;
  sizeBytes: number;
  mimeType: string;
  hasArticle: boolean;
  articleLength?: number;
};

export type TextTaskArtifacts = {
  taskId: string;
  productionMode: "biography_formal_article";
  article: {
    available: boolean;
    relativePath: string;
    sizeBytes?: number;
    articleLength?: number;
    skippedModel?: boolean;
  };
  items: TextArtifactItem[];
};

/** 文本任务产物清单（正式文章 JSON）。 */
export function listTextTaskArtifacts(scope: InterviewScope, taskId: string): TextTaskArtifacts {
  const handle = openTextTask(scope, taskId);
  const meta = readTextTaskMeta(handle.paths);
  if (!meta) {
    throw new Error(`TEXT_TASK_NOT_FOUND: 文本任务「${taskId}」不存在或 meta 无效`);
  }

  const rel = path.posix.join(TEXT_TASK_OUTPUT_DIR, TEXT_ARTICLE_OUTPUT_FILE);
  const abs = handle.paths.articlePath;
  let articleLength: number | undefined;
  let skippedModel: boolean | undefined;
  let hasArticle = false;
  let sizeBytes: number | undefined;

  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    sizeBytes = fs.statSync(abs).size;
    try {
      const raw = JSON.parse(fs.readFileSync(abs, "utf-8")) as Record<string, unknown>;
      const article = typeof raw.article === "string" ? raw.article : "";
      hasArticle = article.trim().length > 0;
      if (hasArticle) articleLength = article.length;
      if (typeof raw.skippedModel === "boolean") skippedModel = raw.skippedModel;
    } catch {
      hasArticle = false;
    }
  }

  const item: TextArtifactItem = {
    kind: "article",
    relativePath: rel,
    sizeBytes: sizeBytes ?? 0,
    mimeType: "application/json",
    hasArticle,
    ...(articleLength != null ? { articleLength } : {}),
  };

  return {
    taskId: handle.taskId,
    productionMode: meta.productionMode,
    article: {
      available: hasArticle,
      relativePath: rel,
      ...(sizeBytes != null ? { sizeBytes } : {}),
      ...(articleLength != null ? { articleLength } : {}),
      ...(skippedModel != null ? { skippedModel } : {}),
    },
    items: fs.existsSync(abs) ? [item] : [],
  };
}

/** 打开文本产物 JSON 文件（供下载）；正文接口仍用 /article。 */
export function openTextArtifactFile(
  scope: InterviewScope,
  taskId: string,
): { absPath: string; filename: string } {
  const handle = openTextTask(scope, taskId);
  const abs = handle.paths.articlePath;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error("TEXT_ARTIFACT_NOT_FOUND: 正式文章尚未生成");
  }
  return { absPath: abs, filename: TEXT_ARTICLE_OUTPUT_FILE };
}
