import { VIDEO_BIOGRAPHY_LANE_STEP_IDS } from "../../biography/constants/stepIds.js";
import { STUDIO_PIPELINE_STEP_IDS } from "../../studio/constants/studioStepIds.js";
import { VIDEO_PREP_ALL_STEP_IDS } from "../constants/prepStepIds.js";

/** prep 10–80 → studio iv_* → 传记 90–260（后两段在同一任务中互斥，但排序共用）。 */
export const VIDEO_PIPELINE_STEP_ORDER = [
  ...VIDEO_PREP_ALL_STEP_IDS,
  ...STUDIO_PIPELINE_STEP_IDS,
  ...VIDEO_BIOGRAPHY_LANE_STEP_IDS,
] as const;

const ORDER = new Map<string, number>(VIDEO_PIPELINE_STEP_ORDER.map((id, i) => [id, i]));

/** 比较两个 pipeline 步序号；未知步 id 排在已知步之后。 */
export function compareVideoPipelineSteps(a: string, b: string): number {
  const ia = ORDER.get(a);
  const ib = ORDER.get(b);
  if (ia === undefined && ib === undefined) return a.localeCompare(b);
  if (ia === undefined) return 1;
  if (ib === undefined) return -1;
  return ia - ib;
}

export function isAtOrAfterStep(stepId: string, fromStep: string): boolean {
  return compareVideoPipelineSteps(stepId, fromStep) >= 0;
}

export function stepsBefore(fromStep: string): string[] {
  return VIDEO_PIPELINE_STEP_ORDER.filter((id) => compareVideoPipelineSteps(id, fromStep) < 0);
}

/** 演播室 prep 裁剪后、续跑 iv_tts 前应已完成的步（不含时代 20–50）。 */
export const STUDIO_SEED_COMPLETED_THROUGH = "iv_script" as const;

export const STUDIO_PIPELINE_ORDER = [
  "10",
  "60",
  "70",
  "80",
  ...STUDIO_PIPELINE_STEP_IDS,
] as const;

export function studioCompletedStepsBefore(fromStep: string): string[] {
  return STUDIO_PIPELINE_ORDER.filter((id) => compareVideoPipelineSteps(id, fromStep) < 0);
}
