import fs from "node:fs";
import { getInterviewDisplayLocale } from "../content/displayLocale";
import { translateArticleForDisplay } from "../content/translate/runtime";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { openTextTask } from "./orchestrator/textTaskWorkspace";

export type TextVideoCostEstimate = {
  tierCount: number;
  usdPerTier: number;
  estimatedUsd: number;
  usedLegacyFallback: boolean;
};

export type TextArticleDisplayPayload = {
  taskId: string;
  savedAt?: string;
  sectionCount?: number;
  skippedModel?: boolean;
  videoCostEstimate?: TextVideoCostEstimate;
  article: string;
};

function parseVideoCostEstimate(raw: unknown): TextVideoCostEstimate | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.tierCount !== "number" ||
    typeof row.usdPerTier !== "number" ||
    typeof row.estimatedUsd !== "number"
  ) {
    return undefined;
  }
  return {
    tierCount: row.tierCount,
    usdPerTier: row.usdPerTier,
    estimatedUsd: row.estimatedUsd,
    usedLegacyFallback: row.usedLegacyFallback === true,
  };
}

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

  const videoCostEstimate = parseVideoCostEstimate(raw.videoCostEstimate);

  return {
    taskId,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : undefined,
    sectionCount: typeof raw.sectionCount === "number" ? raw.sectionCount : undefined,
    skippedModel: typeof raw.skippedModel === "boolean" ? raw.skippedModel : undefined,
    ...(videoCostEstimate ? { videoCostEstimate } : {}),
    article: displayArticle,
  };
}
