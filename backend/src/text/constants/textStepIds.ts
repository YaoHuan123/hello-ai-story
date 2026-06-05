/** 文本成片流水线步骤（当前仅一步：sections → 正式文章）。 */

export const TEXT_PIPELINE_STEPS = {
  ARTICLE: "tx_article",
} as const;

export type TextPipelineStepId = (typeof TEXT_PIPELINE_STEPS)[keyof typeof TEXT_PIPELINE_STEPS];

export const TEXT_PIPELINE_STEP_IDS: readonly TextPipelineStepId[] = [TEXT_PIPELINE_STEPS.ARTICLE];
