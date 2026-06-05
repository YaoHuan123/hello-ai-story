/** 传记成片 pipeline 文件名（prep 部分见 shared）。 */

import { stepPipelineFilename, VIDEO_PIPELINE_STEPS } from "./stepIds.js";

export {
  PIPELINE_SUBDIR,
  MATERIAL_COMBINED_POLISHED_FILE,
  PIPELINE_ERA_BACKDROP_FILE,
  PIPELINE_ERA_SUBSCENE_SPLIT_FILE,
  PIPELINE_ERA_ENV_NARRATIVE_PACK_FILE,
  PIPELINE_ERA_SCENE_EMBELLISH_FILE,
  PIPELINE_CLASSIFY_FILE,
  PIPELINE_CONTEXT_EXPAND_FILE,
  PIPELINE_SEGMENT_REFINE_FILE,
} from "../../shared/constants/prepFilenames.js";

export const VIDEO_TASK_MEDIA_DIR = "媒体";
export const AUDIO_OUTPUT_DIR = `${VIDEO_TASK_MEDIA_DIR}/音频文件夹`;
export const IMAGE_OUTPUT_DIR = `${VIDEO_TASK_MEDIA_DIR}/图片文件夹`;
export const VIDEO_CLIP_OUTPUT_DIR = `${VIDEO_TASK_MEDIA_DIR}/视频片段文件夹`;
export const VIDEO_OUTPUT_DIR = "成品";
export const MERGED_VIDEO_FILENAME = "完整视频.mp4";
export const MERGE_VIDEO_INDEX_FILENAME = "合并完整视频索引.json";

export const PIPELINE_SUBSCENE_SPLIT_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.SUBSCENE_SPLIT,
  "AI拆分子场景后的个人事件",
);
export const PIPELINE_LIVING_CONTEXT_REFINE_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.LIVING_CONTEXT,
  "AI交叉验证优化后的个人事件",
);
export const PIPELINE_ENV_NARRATIVE_PACK_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.ENV_NARRATIVE,
  "AI制作的个人事件的场景包",
);
export const PIPELINE_SCENE_EMBELLISH_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.SCENE_EMBELLISH,
  "AI补充了时代地域特色的个人事件场景包",
);
export const PIPELINE_NAME_UNIFY_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.NAME_UNIFY,
  "AI为场景包的个人事件中的人物统一称呼",
);
export const PIPELINE_PHASE_REPLACE_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.PHASE_REPLACE,
  "AI为场景包中的个人事件中的人物划分年龄阶段",
);
export const PIPELINE_MERGE_ENV_ERA_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.MERGE,
  "合并时代背景事件场景包和个人事件场景包",
);
export const PIPELINE_VOICEOVER_PACK_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.VOICEOVER,
  "包含旁白的场景包",
);
export const PIPELINE_VOICEOVER_COHERENT_PACK_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.VOICEOVER_COHERENCE,
  "包含旁白连贯优化后的场景包",
);
export const PIPELINE_AUDIO_SCENE_RELATION_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.TTS,
  "音频的存储位置和对应的场景关系",
);
export const PIPELINE_VISUAL_CREATE_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.VISUAL_CREATE,
  "人物阶段的视觉效果",
);
export const PIPELINE_SCENE_PACK_WITH_VISUAL_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.VISUAL_EXPAND,
  "包含人物视觉效果的场景包",
);
export const PIPELINE_STYLED_RENDERED_NARRATIVE_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.STYLE_PREFIX,
  "包含视频风格的展开后的场景包",
);
export const PIPELINE_GEO_SIGNAGE_REFERENCE_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.GEO_SIGNAGE,
  "实景路名与地标参考",
);
export const PIPELINE_SCENE_PACK_WITH_IMAGES_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.TEXT2IMG,
  "包含图片位置的场景包",
);
export const PIPELINE_VIDEO_CLIP_INDEX_FILE = stepPipelineFilename(
  VIDEO_PIPELINE_STEPS.VIDEO_CLIPS,
  "视频片段和场景包的位置的索引",
);
