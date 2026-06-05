import {
  STUDIO_PIPELINE_STEP_IDS,
  STUDIO_PIPELINE_STEPS,
  type StudioPipelineStepId,
} from "../constants/studioStepIds.js";
import type { InterviewQaGranularity } from "../llm/studioScript.js";
import { runStudioScriptStep } from "../llm/studioScript.js";
import { runStudioDurationAlignStep } from "../render/durationAlign.js";
import { runStudioClipsStep } from "../render/clipRender.js";
import { runStudioMergeStep } from "../render/mergeClips.js";
import { runStudioTtsStep } from "../render/studioTts.js";
import type { VideoTaskPaths } from "../../shared/orchestrator/videoTaskWorkspace.js";

export type StudioPipelineContext = {
  paths: VideoTaskPaths;
  hostVoice?: string;
  guestVoice?: string;
  qaGranularity?: InterviewQaGranularity;
};

export type StudioPipelineStepResult = {
  stepId: StudioPipelineStepId;
  savedAt: string;
  detail?: Record<string, unknown>;
};

export { STUDIO_PIPELINE_STEP_IDS, STUDIO_PIPELINE_STEPS, type StudioPipelineStepId };

export async function runStudioPipelineStep(
  stepId: string,
  ctx: StudioPipelineContext,
): Promise<StudioPipelineStepResult> {
  const savedAt = new Date().toISOString();

  switch (stepId) {
    case STUDIO_PIPELINE_STEPS.SCRIPT: {
      const r = await runStudioScriptStep(ctx.paths, ctx.qaGranularity ?? "hybrid");
      return {
        stepId: STUDIO_PIPELINE_STEPS.SCRIPT,
        savedAt,
        detail: { turnCount: r.turnCount, skippedModel: r.skippedModel },
      };
    }
    case STUDIO_PIPELINE_STEPS.TTS: {
      const r = await runStudioTtsStep(ctx.paths, ctx.hostVoice, ctx.guestVoice);
      return { stepId: STUDIO_PIPELINE_STEPS.TTS, savedAt, detail: { turnCount: r.turnCount } };
    }
    case STUDIO_PIPELINE_STEPS.DURATION_ALIGN: {
      const r = await runStudioDurationAlignStep(ctx.paths, ctx.hostVoice, ctx.guestVoice);
      return {
        stepId: STUDIO_PIPELINE_STEPS.DURATION_ALIGN,
        savedAt,
        detail: { reused: r.reused, iterationsUsed: r.iterationsUsed },
      };
    }
    case STUDIO_PIPELINE_STEPS.CLIPS: {
      const r = await runStudioClipsStep(ctx.paths);
      return {
        stepId: STUDIO_PIPELINE_STEPS.CLIPS,
        savedAt,
        detail: { clipCount: r.clipCount, clipIndexRel: r.clipIndexRel },
      };
    }
    case STUDIO_PIPELINE_STEPS.MERGE: {
      const r = await runStudioMergeStep(ctx.paths);
      return {
        stepId: STUDIO_PIPELINE_STEPS.MERGE,
        savedAt,
        detail: {
          mergedVideoRelativePath: r.mergedVideoRelativePath,
          clipCount: r.clipCount,
        },
      };
    }
    default:
      throw new Error(`STUDIO_PIPELINE_UNKNOWN_STEP: ${stepId}`);
  }
}
