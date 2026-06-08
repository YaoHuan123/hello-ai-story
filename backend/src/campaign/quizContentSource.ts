import fs from "node:fs";
import path from "node:path";
import { getSections } from "../services/answeredSections.service";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { assertInterviewExists } from "../services/interviewWorkspace.service";
import { getLatestStoryArticle } from "../text/storyArticleSource.js";
import {
  getVideoTaskPaths,
  SECTIONS_SNAPSHOT_FILE,
} from "../video/shared/orchestrator/videoTaskWorkspace.js";

function sectionsToPlainText(scope: InterviewScope): string | null {
  const sections = getSections(scope);
  if (sections.length === 0) return null;
  const parts: string[] = [];
  for (const sec of sections) {
    const bits = sec.qa.map(({ q, a }) => `${q.trim()} ${a.trim()}`.trim()).filter(Boolean);
    if (bits.length) parts.push(bits.join(" "));
  }
  const text = parts.join("\n\n").trim();
  return text || null;
}

function readVideoTaskSectionsSnapshot(scope: InterviewScope, taskId: string): string | null {
  const paths = getVideoTaskPaths(scope, taskId);
  const snapPath = path.join(paths.inputDir, SECTIONS_SNAPSHOT_FILE);
  if (!fs.existsSync(snapPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(snapPath, "utf-8")) as Array<{
      name?: string;
      qa?: Array<{ q?: string; a?: string }>;
    }>;
    if (!Array.isArray(parsed)) return null;
    const parts: string[] = [];
    for (const sec of parsed) {
      const bits = (sec.qa ?? [])
        .map(({ q, a }) => `${String(q ?? "").trim()} ${String(a ?? "").trim()}`.trim())
        .filter(Boolean);
      if (bits.length) parts.push(bits.join(" "));
    }
    return parts.join("\n\n").trim() || null;
  } catch {
    return null;
  }
}

/** 为观看答题生成提供故事正文（正式文章优先，其次已答 sections）。 */
export function resolveStoryTextForQuiz(
  userId: string,
  interviewId: string,
  taskId: string,
): string {
  const scope: InterviewScope = { userId, interviewId: interviewId.trim() };
  assertInterviewExists(scope);

  const article = getLatestStoryArticle(scope);
  if (article?.article.trim()) {
    return article.article.trim();
  }

  const fromVideoInput = readVideoTaskSectionsSnapshot(scope, taskId.trim());
  if (fromVideoInput) return fromVideoInput;

  const fromSections = sectionsToPlainText(scope);
  if (fromSections) return fromSections;

  throw new Error("QUIZ_CONTENT_MISSING");
}
