import path from "node:path";
import type { AnsweredSection } from "../../../topic/types";
import type { InterviewScope } from "../../../services/interviewWorkspace.service";
import { getSections } from "../../../services/answeredSections.service";
import {
  VIDEO_PREP_ERA_LANE_STEP_IDS,
  VIDEO_PREP_PERSONAL_LANE_STEP_IDS,
  VIDEO_PREP_STEPS,
  VIDEO_PREP_ALL_STEP_IDS,
  VIDEO_PREP_STUDIO_STEP_IDS,
  isEraPrepStepId,
  type VideoPrepProfile,
} from "../constants/prepStepIds.js";
import { resolveStoryArticle } from "../../../text/storyArticleSource.js";
import { STORY_ARTICLE_SOURCE_FILE } from "../constants/prepFilenames.js";
import { filterSectionsForVideo, polishStoryArticleForVideoPipeline } from "../input/sectionsVideoInput.js";
import type { MaterialPolishMode } from "../input/sectionsVideoInput.js";
import { writeJsonAtomic } from "./pipelineDisk.js";
import type { VideoPipelineRunTracer } from "./videoPipelineTrace.js";
import {
  runPrepPipelineStep,
  type PrepStepResult,
} from "./prepPipelineSteps.js";
import {
  SECTIONS_SNAPSHOT_FILE,
  type VideoTaskHandle,
  writeVideoTaskMeta,
  readVideoTaskMeta,
} from "./videoTaskWorkspace.js";

export type Step10Result = {
  stepId: typeof VIDEO_PREP_STEPS.POLISH;
  skipped: boolean;
  savedAt: string;
  sectionCount: number;
  polishedInputPath?: string;
};

export type SharedPrepPipelineResult = {
  stepResults: Array<PrepStepResult | Step10Result>;
  downstream: Awaited<ReturnType<typeof polishStoryArticleForVideoPipeline>>["downstreamPipeline"];
};

export type RunSharedPrepOptions = {
  polishMode?: MaterialPolishMode;
  /** 成片所依据的文本任务；省略时用最近一次成功故事。 */
  textTaskId?: string;
  sections?: AnsweredSection[];
  throughStep?: (typeof VIDEO_PREP_ALL_STEP_IDS)[number];
  /** `studio` 跳过时代背景 20–50，仅跑 10 + 60–80。默认 `full`。 */
  prepProfile?: VideoPrepProfile;
  onStepComplete?: (result: PrepStepResult | Step10Result) => void;
  tracer?: VideoPipelineRunTracer;
};

function shouldStop(throughStep: string | undefined, stepId: string): boolean {
  return throughStep === stepId;
}

async function runLane(
  stepIds: readonly string[],
  ctx: Parameters<typeof runPrepPipelineStep>[1],
  throughStep: RunSharedPrepOptions["throughStep"],
  onStepComplete?: RunSharedPrepOptions["onStepComplete"],
  tracer?: VideoPipelineRunTracer,
): Promise<PrepStepResult[]> {
  const results: PrepStepResult[] = [];
  for (const stepId of stepIds) {
    const run = () => runPrepPipelineStep(stepId, ctx);
    const result = tracer ? await tracer.runStep(stepId, run) : await run();
    results.push(result);
    onStepComplete?.(result);
    if (shouldStop(throughStep, stepId)) break;
  }
  return results;
}

/** 共享 prep：step-10 → 并行（20–50 + 60–80）；`prepProfile=studio` 时仅 10 + 60–80。 */
export async function runSharedPrepPipeline(
  handle: VideoTaskHandle,
  opts?: RunSharedPrepOptions,
): Promise<SharedPrepPipelineResult> {
  const sections = opts?.sections ?? getSections(handle.scope);
  const filtered = filterSectionsForVideo(sections);
  if (filtered.length === 0) {
    throw new Error("VIDEO_PIPELINE_NO_SECTIONS: 采访尚无有效已答小节，无法启动成片");
  }

  const stepResults: Array<PrepStepResult | Step10Result> = [];
  const savedAt = new Date().toISOString();
  writeJsonAtomic(path.join(handle.paths.inputDir, SECTIONS_SNAPSHOT_FILE), sections);

  const story = resolveStoryArticle(handle.scope, opts?.textTaskId);

  writeJsonAtomic(path.join(handle.paths.inputDir, STORY_ARTICLE_SOURCE_FILE), {
    textTaskId: story.taskId,
    articleLength: story.article.length,
    ...(story.skippedModel !== undefined ? { skippedModel: story.skippedModel } : {}),
  });

  const polishStartMs = Date.now();
  const polished = await polishStoryArticleForVideoPipeline(sections, story.article, {
    mode: opts?.polishMode,
    inputDir: handle.paths.inputDir,
  });
  if (opts?.tracer?.enabled()) {
    opts.tracer.recordStep({
      stepId: VIDEO_PREP_STEPS.POLISH,
      durationMs: Date.now() - polishStartMs,
      ok: true,
      skipped: polished.sectionCount === 0,
      outputRelativePath: polished.polishedInputPath,
    });
  }

  const step10: Step10Result = {
    stepId: VIDEO_PREP_STEPS.POLISH,
    skipped: polished.sectionCount === 0,
    savedAt,
    sectionCount: polished.sectionCount,
    polishedInputPath: polished.polishedInputPath,
  };
  stepResults.push(step10);
  opts?.onStepComplete?.(step10);

  if (shouldStop(opts?.throughStep, VIDEO_PREP_STEPS.POLISH)) {
    return { stepResults, downstream: polished.downstreamPipeline };
  }

  const prepProfile = opts?.prepProfile ?? "full";
  if (prepProfile === "studio" && opts?.throughStep && isEraPrepStepId(opts.throughStep)) {
    return { stepResults, downstream: polished.downstreamPipeline };
  }

  const ctx = { paths: handle.paths, downstreamPipeline: polished.downstreamPipeline };
  if (prepProfile === "studio") {
    const personalResults = await runLane(
      VIDEO_PREP_PERSONAL_LANE_STEP_IDS,
      ctx,
      opts?.throughStep,
      opts?.onStepComplete,
      opts?.tracer,
    );
    stepResults.push(...personalResults);
  } else {
    const [eraResults, personalResults] = await Promise.all([
      runLane(VIDEO_PREP_ERA_LANE_STEP_IDS, ctx, opts?.throughStep, opts?.onStepComplete, opts?.tracer),
      runLane(VIDEO_PREP_PERSONAL_LANE_STEP_IDS, ctx, opts?.throughStep, opts?.onStepComplete, opts?.tracer),
    ]);
    stepResults.push(...eraResults, ...personalResults);
  }

  return { stepResults, downstream: polished.downstreamPipeline };
}

export {
  VIDEO_PREP_ERA_LANE_STEP_IDS,
  VIDEO_PREP_PERSONAL_LANE_STEP_IDS,
  VIDEO_PREP_ALL_STEP_IDS,
  VIDEO_PREP_STUDIO_STEP_IDS,
  VIDEO_PREP_STEPS,
  type VideoPrepProfile,
};
