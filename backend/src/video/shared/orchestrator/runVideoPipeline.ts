import type { InterviewScope } from "../../../services/interviewWorkspace.service";
import type { AnsweredSection } from "../../../topic/types";
import type { MaterialPolishMode } from "../input/sectionsVideoInput.js";
import { isPrepStepId } from "../constants/prepStepIds.js";
import { runWithVideoLlmTrace, videoLlmTraceDirForTask } from "../llm/videoLlmTrace.js";
import type { PrepStepResult } from "./prepPipelineSteps.js";
import {
  runSharedPrepPipeline,
  type SharedPrepPipelineResult,
  type Step10Result,
  type VideoPrepProfile,
} from "./runSharedPrepPipeline.js";
import {
  readVideoTaskMeta,
  writeVideoTaskMeta,
  type VideoTaskHandle,
  type VideoTaskMeta,
} from "./videoTaskWorkspace.js";
import { compareVideoPipelineSteps, isAtOrAfterStep } from "./stepOrder.js";

/** 一条按顺序执行的步骤泳道：相同 ctx 下逐个跑 stepIds。 */
export type VideoPipelineLane<L extends { stepId: string }> = {
  stepIds: readonly string[];
  runStep: (stepId: string) => Promise<L>;
};

export type RunVideoPipelineOptions<L extends { stepId: string }> = {
  polishMode?: MaterialPolishMode;
  textTaskId?: string;
  sections?: AnsweredSection[];
  /** 调试：只跑到该步（含）即停。可为 prep（10–80）或后续泳道步。 */
  throughStep?: string;
  /** 从该步（含）开始跑；此前 prep/泳道步跳过（须已有落盘产物）。 */
  fromStep?: string;
  /** prep 裁剪：`studio` 跳过时代背景 20–50。默认 `full`。 */
  prepProfile?: VideoPrepProfile;
  onStepComplete?: (result: PrepStepResult | Step10Result | L) => void;
  /** 由 prep 结果构造后续泳道（mode 专有 ctx 在此闭包内绑定）。 */
  buildLanes: (prep: SharedPrepPipelineResult) => Array<VideoPipelineLane<L>>;
};

export type RunVideoPipelineResult<L extends { stepId: string }> = {
  scope: InterviewScope;
  taskId: string;
  taskRoot: string;
  status: VideoTaskMeta["status"];
  stepResults: Array<PrepStepResult | Step10Result | L>;
};

function appendCompletedSteps(meta: VideoTaskMeta, stepIds: string[]): VideoTaskMeta {
  const merged = [...meta.completedSteps];
  for (const id of stepIds) {
    if (!merged.includes(id)) merged.push(id);
  }
  return { ...meta, updatedAt: new Date().toISOString(), completedSteps: merged };
}

/**
 * 成片编排骨架：shared prep（10–80）→ 调用方泳道，统一处理任务状态机
 * （running → success/failed）、completedSteps 落盘、throughStep 提前停。
 *
 * 调用方负责：创建/打开 task handle、前置校验、构造泳道及其 ctx。
 */
export async function runVideoPipelineWithPrep<L extends { stepId: string }>(
  handle: VideoTaskHandle,
  opts: RunVideoPipelineOptions<L>,
): Promise<RunVideoPipelineResult<L>> {
  const existingMeta = readVideoTaskMeta(handle.paths);
  if (!existingMeta) throw new Error(`VIDEO_TASK_META_MISSING: ${handle.taskId}`);

  let meta: VideoTaskMeta = { ...existingMeta, status: "running", lastError: undefined, updatedAt: new Date().toISOString() };
  writeVideoTaskMeta(handle.paths, meta);

  const stepResults: Array<PrepStepResult | Step10Result | L> = [];

  const finishSuccess = (current: VideoTaskMeta): RunVideoPipelineResult<L> => {
    const next: VideoTaskMeta = { ...current, status: "success" };
    writeVideoTaskMeta(handle.paths, next);
    return {
      scope: handle.scope,
      taskId: handle.taskId,
      taskRoot: handle.paths.taskRoot,
      status: next.status,
      stepResults,
    };
  };

  try {
    return await runWithVideoLlmTrace(videoLlmTraceDirForTask(handle.paths.taskRoot), async () => {
      const fromStep = opts.fromStep?.trim();
      const skipPrep = Boolean(fromStep && compareVideoPipelineSteps(fromStep, "80") > 0);

      let prep: SharedPrepPipelineResult;
      if (skipPrep) {
        prep = { stepResults: [], downstream: { polishedTemplateInstanceSummaries: {} } };
      } else {
        const prepThrough = isPrepStepId(opts.throughStep) ? opts.throughStep : undefined;
        prep = await runSharedPrepPipeline(handle, {
          polishMode: opts.polishMode,
          textTaskId: opts.textTaskId,
          sections: opts.sections,
          throughStep: prepThrough,
          prepProfile: opts.prepProfile,
          onStepComplete: opts.onStepComplete,
        });
        stepResults.push(...prep.stepResults);
        meta = appendCompletedSteps(meta, prep.stepResults.map((r) => r.stepId));
        writeVideoTaskMeta(handle.paths, meta);

        if (isPrepStepId(opts.throughStep) && prep.stepResults.some((r) => r.stepId === opts.throughStep)) {
          return finishSuccess(meta);
        }
      }

      for (const lane of opts.buildLanes(prep)) {
        for (const stepId of lane.stepIds) {
          if (fromStep && !isAtOrAfterStep(stepId, fromStep)) {
            continue;
          }
          const result = await lane.runStep(stepId);
          stepResults.push(result);
          opts.onStepComplete?.(result);
          meta = appendCompletedSteps(meta, [stepId]);
          writeVideoTaskMeta(handle.paths, meta);
          if (opts.throughStep === stepId) return finishSuccess(meta);
        }
      }

      return finishSuccess(meta);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    meta = { ...meta, status: "failed", lastError: message, updatedAt: new Date().toISOString() };
    writeVideoTaskMeta(handle.paths, meta);
    throw err;
  }
}
