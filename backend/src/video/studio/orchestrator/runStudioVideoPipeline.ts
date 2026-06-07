import { resolveStudioTtsVoices } from "../../../content/interviewTtsVoices";
import type { InterviewScope } from "../../../services/interviewWorkspace.service";
import type { Step10Result } from "../../shared/orchestrator/runSharedPrepPipeline.js";
import { VIDEO_PREP_STEPS } from "../../shared/constants/prepStepIds.js";
import {
  createStudioVideoTask,
  resolveStudioVideoTask,
  type VideoTaskHandle,
  type VideoTaskMeta,
} from "../../shared/orchestrator/videoTaskWorkspace.js";
import type { PrepStepResult } from "../../shared/orchestrator/prepPipelineSteps.js";
import { runVideoPipelineWithPrep } from "../../shared/orchestrator/runVideoPipeline.js";
import type { AnsweredSection } from "../../../topic/types";
import type { MaterialPolishMode } from "../../shared/input/sectionsVideoInput.js";
import {
  STUDIO_PIPELINE_STEP_IDS,
  runStudioPipelineStep,
  type StudioPipelineStepId,
  type StudioPipelineStepResult,
} from "./studioPipelineSteps.js";
import type { InterviewQaGranularity } from "../llm/studioScript.js";

export type RunStudioVideoPipelineOptions = {
  taskId?: string;
  createTask?: boolean;
  textTaskId?: string;
  polishMode?: MaterialPolishMode;
  sections?: AnsweredSection[];
  qaGranularity?: InterviewQaGranularity;
  throughStep?: typeof VIDEO_PREP_STEPS.POLISH | StudioPipelineStepId;
  /** 从该步（含）开始跑；此前 prep/泳道步跳过（须已有落盘产物）。 */
  fromStep?: typeof VIDEO_PREP_STEPS.POLISH | StudioPipelineStepId;
  onStepComplete?: (result: StudioPipelineStepResult | Step10Result | PrepStepResult) => void;
};

export type StudioVideoPipelineResult = {
  scope: InterviewScope;
  taskId: string;
  taskRoot: string;
  status: VideoTaskMeta["status"];
  stepResults: Array<StudioPipelineStepResult | Step10Result | PrepStepResult>;
};

/**
 * 演播室成片：prep (10 + 60→80，跳过时代 20–50) → iv_script → iv_tts → iv_duration_align → iv_clips → iv_merge
 */
export async function runStudioVideoPipeline(
  scope: InterviewScope,
  opts: RunStudioVideoPipelineOptions,
): Promise<StudioVideoPipelineResult> {
  const { hostVoice, guestVoice } = resolveStudioTtsVoices(scope);

  const handle = opts.createTask
    ? createStudioVideoTask(scope)
    : resolveStudioVideoTask(scope, opts.taskId);

  return runVideoPipelineWithPrep<StudioPipelineStepResult>(handle, {
    polishMode: opts.polishMode,
    textTaskId: opts.textTaskId,
    sections: opts.sections,
    throughStep: opts.throughStep,
    fromStep: opts.fromStep,
    prepProfile: "studio",
    onStepComplete: opts.onStepComplete,
    buildLanes: () => {
      const ctx = { scope, paths: handle.paths, hostVoice, guestVoice, qaGranularity: opts.qaGranularity };
      return [
        {
          stepIds: STUDIO_PIPELINE_STEP_IDS,
          runStep: (stepId: string) => runStudioPipelineStep(stepId as StudioPipelineStepId, ctx),
        },
      ];
    },
  });
}

export {
  STUDIO_PIPELINE_STEP_IDS,
  createStudioVideoTask,
  resolveStudioVideoTask,
  type VideoTaskHandle,
  type VideoTaskMeta as StudioVideoTaskMeta,
};
