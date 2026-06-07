import fs from "node:fs";
import { getInterviewDisplayLocale } from "../content/displayLocale";
import { translateArticleForDisplay } from "../content/translate/runtime";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { openTextTask } from "./orchestrator/textTaskWorkspace";

export type TextArticleDisplayPayload = {
  taskId: string;
  savedAt?: string;
  sectionCount?: number;
  skippedModel?: boolean;
  article: string;
};

/** 读取磁盘 canonical 文章并按 `meta.locale` 返回展示文案。 */
export async function getTextArticleForDisplay(
  scope: InterviewScope,
  taskId: string,
): Promise<TextArticleDisplayPayload> {
  const handle = openTextTask(scope, taskId);
  if (!fs.existsSync(handle.paths.articlePath)) {
    throw new Error("TEXT_ARTICLE_NOT_FOUND: 正式文章尚未生成");
  }
  const raw = JSON.parse(fs.readFileSync(handle.paths.articlePath, "utf-8")) as Record<string, unknown>;
  const article = typeof raw.article === "string" ? raw.article : "";
  if (!article.trim()) {
    throw new Error("TEXT_ARTICLE_NOT_FOUND: 正式文章尚未生成");
  }

  const locale = getInterviewDisplayLocale(scope);
  const displayArticle = await translateArticleForDisplay(scope, article, locale);

  return {
    taskId,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : undefined,
    sectionCount: typeof raw.sectionCount === "number" ? raw.sectionCount : undefined,
    skippedModel: typeof raw.skippedModel === "boolean" ? raw.skippedModel : undefined,
    article: displayArticle,
  };
}
