/**
 * 传记 / 演播室共用的 prep 步骤（10→80，步长 10）。
 */
export const VIDEO_PREP_STEPS = {
  POLISH: "10",
  ERA_BACKDROP: "20",
  ERA_SUBSCENE: "30",
  ERA_ENV_PACK: "40",
  ERA_EMBELLISH: "50",
  CLASSIFY: "60",
  CONTEXT_EXPAND: "70",
  SEGMENT_REFINE: "80",
} as const;

export type VideoPrepStepId = (typeof VIDEO_PREP_STEPS)[keyof typeof VIDEO_PREP_STEPS];

export const VIDEO_PREP_ERA_LANE_STEP_IDS = [
  VIDEO_PREP_STEPS.ERA_BACKDROP,
  VIDEO_PREP_STEPS.ERA_SUBSCENE,
  VIDEO_PREP_STEPS.ERA_ENV_PACK,
  VIDEO_PREP_STEPS.ERA_EMBELLISH,
] as const;

export const VIDEO_PREP_PERSONAL_LANE_STEP_IDS = [
  VIDEO_PREP_STEPS.CLASSIFY,
  VIDEO_PREP_STEPS.CONTEXT_EXPAND,
  VIDEO_PREP_STEPS.SEGMENT_REFINE,
] as const;

export const VIDEO_PREP_LANE_STEP_IDS = [
  ...VIDEO_PREP_ERA_LANE_STEP_IDS,
  ...VIDEO_PREP_PERSONAL_LANE_STEP_IDS,
] as const;

export const VIDEO_PREP_ALL_STEP_IDS = [
  VIDEO_PREP_STEPS.POLISH,
  ...VIDEO_PREP_LANE_STEP_IDS,
] as const;

/** 演播室 prep：10 + 个人线 60–80（跳过时代背景 20–50）。 */
export const VIDEO_PREP_STUDIO_STEP_IDS = [
  VIDEO_PREP_STEPS.POLISH,
  ...VIDEO_PREP_PERSONAL_LANE_STEP_IDS,
] as const;

export type VideoPrepProfile = "full" | "studio";

/** 判定 stepId 是否属于时代背景 prep 泳道（20–50）。 */
export function isEraPrepStepId(stepId: string): boolean {
  return (VIDEO_PREP_ERA_LANE_STEP_IDS as readonly string[]).includes(stepId);
}

/** 判定某 stepId 是否属于 shared prep（10–80）。供编排器决定是否转发给 prep 管道。 */
export function isPrepStepId(
  stepId: string | undefined,
): stepId is (typeof VIDEO_PREP_ALL_STEP_IDS)[number] {
  return stepId !== undefined && (VIDEO_PREP_ALL_STEP_IDS as readonly string[]).includes(stepId);
}

export function stepPipelineFilename(stepId: string, description: string): string {
  return `step-${stepId}_${description}.json`;
}

export function stepPromptFilename(stepId: string, slug: string): string {
  return `step-${stepId}_${slug}.md`;
}
