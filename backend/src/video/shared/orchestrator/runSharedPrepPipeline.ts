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
import { filterSectionsForVideo, polishSectionsForVideoPipeline } from "../input/sectionsVideoInput.js";
import type { MaterialPolishMode } from "../input/sectionsVideoInput.js";
import { writeJsonAtomic } from "./pipelineDisk.js";
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
  downstream: Awaited<ReturnType<typeof polishSectionsForVideoPipeline>>["downstreamPipeline"];
};

export type RunSharedPrepOptions = {
  polishMode?: MaterialPolishMode;
  sections?: AnsweredSection[];
  throughStep?: (typeof VIDEO_PREP_ALL_STEP_IDS)[number];
  /** `studio` 跳过时代背景 20–50，仅跑 10 + 60–80。默认 `full`。 */
  prepProfile?: VideoPrepProfile;
  onStepComplete?: (result: PrepStepResult | Step10Result) => void;
};

function shouldStop(throughStep: string | undefined, stepId: string): boolean {
  return throughStep === stepId;
}

async function runLane(
  stepIds: readonly string[],
  ctx: Parameters<typeof runPrepPipelineStep>[1],
  throughStep: RunSharedPrepOptions["throughStep"],
  onStepComplete?: RunSharedPrepOptions["onStepComplete"],
): Promise<PrepStepResult[]> {
  const results: PrepStepResult[] = [];
  for (const stepId of stepIds) {
    const result = await runPrepPipelineStep(stepId, ctx);
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

  const polished = await polishSectionsForVideoPipeline(filtered, {
    mode: opts?.polishMode,
    inputDir: handle.paths.inputDir,
  });

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
    );
    stepResults.push(...personalResults);
  } else {
    const [eraResults, personalResults] = await Promise.all([
      runLane(VIDEO_PREP_ERA_LANE_STEP_IDS, ctx, opts?.throughStep, opts?.onStepComplete),
      runLane(VIDEO_PREP_PERSONAL_LANE_STEP_IDS, ctx, opts?.throughStep, opts?.onStepComplete),
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
