import path from "node:path";

export const PIPELINE_INTERVIEW_STUDIO_SUBDIR = "interview-studio";

/** 相对 `paths.pipelineDir`（已是 pipeline/） */
const STUDIO_ROOT = PIPELINE_INTERVIEW_STUDIO_SUBDIR;

export const STUDIO_SCRIPT_FILE = "iv-script_访谈演播室脚本.json";
export const STUDIO_SCRIPT_REL = `${STUDIO_ROOT}/${STUDIO_SCRIPT_FILE}`;

export const STUDIO_TTS_BUNDLE_FILE = "iv-interview-tts-bundle.json";
export const STUDIO_TTS_BUNDLE_REL = `${STUDIO_ROOT}/${STUDIO_TTS_BUNDLE_FILE}`;

export const STUDIO_AUDIO_SUBDIR_REL = `${STUDIO_ROOT}/interview-audio`;

export const STUDIO_CLIP_STYLE_DIR = "video_pack";
const STUDIO_CLIPS_BASE = `${STUDIO_ROOT}/interview-clips`;

export function studioClipSubdirRel(styleDir = STUDIO_CLIP_STYLE_DIR): string {
  return `${STUDIO_CLIPS_BASE}/${styleDir}`;
}

export function studioClipIndexRel(styleDir = STUDIO_CLIP_STYLE_DIR): string {
  return `${STUDIO_ROOT}/iv-clip-index.${styleDir}.json`;
}

export const VIDEO_OUTPUT_DIR = "成品";
export const MERGED_VIDEO_FILENAME = "完整视频.mp4";
export const MERGED_VIDEO_REL = `${VIDEO_OUTPUT_DIR}/${MERGED_VIDEO_FILENAME}`;

export function studioPathUnderPipeline(pipelineDir: string, relPosix: string): string {
  return path.join(pipelineDir, relPosix.split("/").join(path.sep));
}
