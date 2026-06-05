import { stepPipelineFilename, VIDEO_PREP_STEPS } from "./prepStepIds.js";

export const PIPELINE_SUBDIR = "pipeline";

export const PIPELINE_ERA_BACKDROP_FILE = stepPipelineFilename(
  VIDEO_PREP_STEPS.ERA_BACKDROP,
  "AI生成的时代背景事件",
);
export const PIPELINE_ERA_SUBSCENE_SPLIT_FILE = stepPipelineFilename(
  VIDEO_PREP_STEPS.ERA_SUBSCENE,
  "AI拆分子场景后的时代背景事件",
);
export const PIPELINE_ERA_ENV_NARRATIVE_PACK_FILE = stepPipelineFilename(
  VIDEO_PREP_STEPS.ERA_ENV_PACK,
  "AI制作的时代背景事件的场景包",
);
export const PIPELINE_ERA_SCENE_EMBELLISH_FILE = stepPipelineFilename(
  VIDEO_PREP_STEPS.ERA_EMBELLISH,
  "AI补充了时代地域特色的时代背景事件场景包",
);
export const PIPELINE_CLASSIFY_FILE = stepPipelineFilename(
  VIDEO_PREP_STEPS.CLASSIFY,
  "AI分离后的上下文和个人事件",
);
export const PIPELINE_CONTEXT_EXPAND_FILE = stepPipelineFilename(
  VIDEO_PREP_STEPS.CONTEXT_EXPAND,
  "AI根据上下文扩写后的个人事件",
);
export const PIPELINE_SEGMENT_REFINE_FILE = stepPipelineFilename(
  VIDEO_PREP_STEPS.SEGMENT_REFINE,
  "AI分割与去重后的个人事件",
);

export const MATERIAL_COMBINED_POLISHED_FILE = "用户通过模板输入的素材和自述-经过AI润色.json";
