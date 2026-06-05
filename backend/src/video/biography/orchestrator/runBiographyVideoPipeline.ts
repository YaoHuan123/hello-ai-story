import type { InterviewScope } from "../../../services/interviewWorkspace.service";
import type { AnsweredSection } from "../../../topic/types";
import {
  BIOGRAPHY_MERGE_LANE_STEP_IDS,
  BIOGRAPHY_PIPELINE_STEP_IDS,
  runBiographyPipelineStep,
  type BiographyPipelineStepId,
  type BiographyVideoStepResult,
} from "./biographyPipelineSteps.js";
import {
  VIDEO_BIOGRAPHY_POST_PREP_PERSONAL_LANE_STEP_IDS,
  VIDEO_PREP_STEPS,
} from "../constants/stepIds.js";
import type { MaterialPolishMode } from "../../shared/input/sectionsVideoInput.js";
import {
  resolveBiographyVideoTask,
  createBiographyVideoTask,
  type VideoTaskHandle,
  type VideoTaskMeta,
} from "../../shared/orchestrator/videoTaskWorkspace.js";
import type { Step10Result } from "../../shared/orchestrator/runSharedPrepPipeline.js";
import { runVideoPipelineWithPrep } from "../../shared/orchestrator/runVideoPipeline.js";

export type RunBiographyVideoPipelineOptions = {
  taskId?: string;
  createTask?: boolean;
  polishMode?: MaterialPolishMode;
  ttsVoice?: string;
  styleConfigPath?: string;
  styleId?: string;
  sections?: AnsweredSection[];
  throughStep?: typeof VIDEO_PREP_STEPS.POLISH | BiographyPipelineStepId;
  /** 从该步（含）开始；此前步骤跳过（须已有 pipeline 落盘，常用于集成测试 seed 续跑）。 */
  fromStep?: typeof VIDEO_PREP_STEPS.POLISH | BiographyPipelineStepId;
  onStepComplete?: (result: BiographyVideoStepResult | Step10Result) => void;
};

export type BiographyVideoPipelineResult = {
  scope: InterviewScope;
  taskId: string;
  taskRoot: string;
  status: VideoTaskMeta["status"];
  stepResults: Array<BiographyVideoStepResult | Step10Result>;
};

/**
 * 传记成片编排：shared prep (10→80) → 个人线续 (90→120) → 合并链 (130→260)
 */
export async function runBiographyVideoPipeline(
  scope: InterviewScope,
  opts?: RunBiographyVideoPipelineOptions,
): Promise<BiographyVideoPipelineResult> {
  const handle = opts?.createTask
    ? createBiographyVideoTask(scope)
    : resolveBiographyVideoTask(scope, opts?.taskId);

  const result = await runVideoPipelineWithPrep<BiographyVideoStepResult>(handle, {
    polishMode: opts?.polishMode,
    sections: opts?.sections,
    throughStep: opts?.throughStep,
    fromStep: opts?.fromStep,
    onStepComplete: opts?.onStepComplete,
    buildLanes: (prep) => {
      const ctx = {
        scope: handle.scope,
        paths: handle.paths,
        downstreamPipeline: prep.downstream,
        ttsVoice: opts?.ttsVoice,
        styleConfigPath: opts?.styleConfigPath,
        styleId: opts?.styleId,
      };
      const runStep = (stepId: string) => runBiographyPipelineStep(stepId, ctx);
      return [
        { stepIds: VIDEO_BIOGRAPHY_POST_PREP_PERSONAL_LANE_STEP_IDS, runStep },
        { stepIds: BIOGRAPHY_MERGE_LANE_STEP_IDS, runStep },
      ];
    },
  });

  return {
    scope: result.scope,
    taskId: result.taskId,
    taskRoot: result.taskRoot,
    status: result.status,
    stepResults: result.stepResults as Array<BiographyVideoStepResult | Step10Result>,
  };
}

export {
  BIOGRAPHY_PIPELINE_STEP_IDS,
  BIOGRAPHY_MERGE_LANE_STEP_IDS,
  createBiographyVideoTask,
  type VideoTaskHandle,
  type Step10Result,
};

export const BIOGRAPHY_POST_PREP_PERSONAL = VIDEO_BIOGRAPHY_POST_PREP_PERSONAL_LANE_STEP_IDS;
