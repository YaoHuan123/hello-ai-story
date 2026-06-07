import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import type { AnsweredSection } from "../../topic/types";
import { getSections } from "../../services/answeredSections.service";
import { TEXT_PIPELINE_STEPS } from "../constants/textStepIds.js";
import { TEXT_ARTICLE_OUTPUT_FILE, TEXT_SECTIONS_SNAPSHOT_FILE, TEXT_TASK_INPUT_DIR, TEXT_TASK_OUTPUT_DIR } from "../constants/textFilenames.js";
import { generateFormalArticleFromSections, type TextArticleMode } from "../llm/generateArticle.js";
import { writeJsonAtomic } from "../../video/shared/orchestrator/pipelineDisk.js";
import {
  createTextTask,
  readTextTaskMeta,
  resolveTextTask,
  writeTextArticleFile,
  writeTextTaskMeta,
  type TextTaskHandle,
  type TextTaskMeta,
} from "./textTaskWorkspace.js";

export type TextPipelineStepResult = {
  stepId: typeof TEXT_PIPELINE_STEPS.ARTICLE;
  savedAt: string;
  outputRelativePath: string;
  sectionCount: number;
  articleLength: number;
  skippedModel: boolean;
};

export type RunTextPipelineOptions = {
  taskId?: string;
  createTask?: boolean;
  sections?: AnsweredSection[];
  mode?: TextArticleMode;
  onStepComplete?: (result: TextPipelineStepResult) => void;
};

export type TextPipelineResult = {
  scope: InterviewScope;
  taskId: string;
  taskRoot: string;
  status: TextTaskMeta["status"];
  stepResults: TextPipelineStepResult[];
  articlePath: string;
};

/**
 * 文本成片：读取 `已答/sections.json` → tx_article（LLM 合成一篇正式传记文章）。
 */
export async function runTextPipeline(
  scope: InterviewScope,
  opts?: RunTextPipelineOptions,
): Promise<TextPipelineResult> {
  return runTextPipelineInner(scope, opts);
}

async function runTextPipelineInner(
  scope: InterviewScope,
  opts?: RunTextPipelineOptions,
): Promise<TextPipelineResult> {
  const handle = opts?.createTask ? createTextTask(scope) : resolveTextTask(scope, opts?.taskId);

  const sections = opts?.sections ?? getSections(scope);
  if (sections.length === 0) {
    throw new Error("TEXT_PIPELINE_NO_SECTIONS: 采访尚无已答小节，无法生成文章");
  }

  let meta = readTextTaskMeta(handle.paths);
  if (!meta) {
    throw new Error(`TEXT_TASK_META_MISSING: ${handle.taskId}`);
  }

  meta = {
    ...meta,
    status: "running",
    lastError: undefined,
    updatedAt: new Date().toISOString(),
  };
  writeTextTaskMeta(handle.paths, meta);

  fs.mkdirSync(handle.paths.inputDir, { recursive: true });
  fs.mkdirSync(handle.paths.outputDir, { recursive: true });
  writeJsonAtomic(path.join(handle.paths.inputDir, TEXT_SECTIONS_SNAPSHOT_FILE), sections);

  try {
    const { article, skippedModel } = await generateFormalArticleFromSections(sections, {
      mode: opts?.mode,
    });

    writeTextArticleFile(handle.paths, {
      inputSectionsSnapshotFile: `${TEXT_TASK_INPUT_DIR}/${TEXT_SECTIONS_SNAPSHOT_FILE}`,
      sectionCount: sections.length,
      article,
      skippedModel,
    });

    const savedAt = new Date().toISOString();
    const stepResult: TextPipelineStepResult = {
      stepId: TEXT_PIPELINE_STEPS.ARTICLE,
      savedAt,
      outputRelativePath: `${TEXT_TASK_OUTPUT_DIR}/${TEXT_ARTICLE_OUTPUT_FILE}`,
      sectionCount: sections.length,
      articleLength: article.length,
      skippedModel,
    };

    opts?.onStepComplete?.(stepResult);

    const nextMeta: TextTaskMeta = {
      ...meta,
      status: "success",
      updatedAt: savedAt,
      completedSteps: [TEXT_PIPELINE_STEPS.ARTICLE],
    };
    writeTextTaskMeta(handle.paths, nextMeta);

    return {
      scope: handle.scope,
      taskId: handle.taskId,
      taskRoot: handle.paths.taskRoot,
      status: nextMeta.status,
      stepResults: [stepResult],
      articlePath: handle.paths.articlePath,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeTextTaskMeta(handle.paths, {
      ...meta,
      status: "failed",
      lastError: message,
      updatedAt: new Date().toISOString(),
    });
    throw err;
  }
}

export {
  createTextTask,
  resolveTextTask,
  type TextTaskHandle,
  type TextTaskMeta,
};
