/** 演播室成片流水线步骤（prep 由 shared 负责，此处为 iv_* 链）。 */

export const STUDIO_PIPELINE_STEPS = {
  SCRIPT: "iv_script",
  TTS: "iv_tts",
  DURATION_ALIGN: "iv_duration_align",
  CLIPS: "iv_clips",
  MERGE: "iv_merge",
} as const;

export type StudioPipelineStepId = (typeof STUDIO_PIPELINE_STEPS)[keyof typeof STUDIO_PIPELINE_STEPS];

export const STUDIO_PIPELINE_STEP_IDS: readonly StudioPipelineStepId[] = [
  STUDIO_PIPELINE_STEPS.SCRIPT,
  STUDIO_PIPELINE_STEPS.TTS,
  STUDIO_PIPELINE_STEPS.DURATION_ALIGN,
  STUDIO_PIPELINE_STEPS.CLIPS,
  STUDIO_PIPELINE_STEPS.MERGE,
];
