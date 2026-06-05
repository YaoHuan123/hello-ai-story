/**
 * 演播室集成测试：从 iv_script 产物续跑 iv_tts 的 seed fixture。
 *
 * 目录结构：
 *   test/fixtures/video-studio-through-iv-script/
 *     pipeline/              ← step-60/70/80 + interview-studio/iv-script
 *     输入/                  ← sections-snapshot、润色 JSON
 *
 * 导出：node scripts/export-video-studio-seed.mjs <taskRoot>
 */
import fs from "node:fs";
import path from "node:path";
import {
  PIPELINE_CLASSIFY_FILE,
  PIPELINE_CONTEXT_EXPAND_FILE,
  PIPELINE_SEGMENT_REFINE_FILE,
  PIPELINE_SUBDIR,
  MATERIAL_COMBINED_POLISHED_FILE,
} from "../../../dist/video/shared/constants/prepFilenames.js";
import {
  STUDIO_SCRIPT_FILE,
  STUDIO_SCRIPT_REL,
} from "../../../dist/video/studio/constants/studioFilenames.js";
import { STUDIO_PIPELINE_STEPS } from "../../../dist/video/studio/constants/studioStepIds.js";
import { SECTIONS_SNAPSHOT_FILE } from "../../../dist/video/shared/orchestrator/videoTaskWorkspace.js";

export const VIDEO_STUDIO_SEED_THROUGH_STEP = STUDIO_PIPELINE_STEPS.SCRIPT;
export const VIDEO_STUDIO_DEFAULT_FROM_STEP = STUDIO_PIPELINE_STEPS.TTS;

export const VIDEO_STUDIO_SEED_MIN_PIPELINE_FILES = [
  PIPELINE_SEGMENT_REFINE_FILE,
  STUDIO_SCRIPT_REL,
] as const;

export const VIDEO_STUDIO_SEED_PIPELINE_FILES = [
  PIPELINE_CLASSIFY_FILE,
  PIPELINE_CONTEXT_EXPAND_FILE,
  PIPELINE_SEGMENT_REFINE_FILE,
  STUDIO_SCRIPT_REL,
] as const;

const THIS_DIR = path.dirname(__filename);
export const DEFAULT_VIDEO_STUDIO_SEED_ROOT = path.join(
  THIS_DIR,
  "../../fixtures/video-studio-through-iv-script",
);

export function resolveVideoStudioSeedRoot(): string {
  const env = (process.env.VIDEO_STUDIO_SEED_DIR ?? "").trim();
  return env || DEFAULT_VIDEO_STUDIO_SEED_ROOT;
}

export function videoStudioSeedPipelineDir(seedRoot = resolveVideoStudioSeedRoot()): string {
  return path.join(seedRoot, PIPELINE_SUBDIR);
}

export function isVideoStudioSeedReady(seedRoot = resolveVideoStudioSeedRoot()): boolean {
  const pipelineDir = videoStudioSeedPipelineDir(seedRoot);
  return VIDEO_STUDIO_SEED_MIN_PIPELINE_FILES.every((f) => fs.existsSync(path.join(pipelineDir, f)));
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function copyVideoStudioSeedToTask(taskRoot: string, seedRoot = resolveVideoStudioSeedRoot()): void {
  if (!isVideoStudioSeedReady(seedRoot)) {
    throw new Error(
      `VIDEO_STUDIO_SEED_MISSING: seed 不完整。请先 node scripts/export-video-studio-seed.mjs <taskRoot>`,
    );
  }
  const seedPipeline = videoStudioSeedPipelineDir(seedRoot);
  const targetPipeline = path.join(taskRoot, PIPELINE_SUBDIR);
  fs.mkdirSync(targetPipeline, { recursive: true });
  for (const file of VIDEO_STUDIO_SEED_PIPELINE_FILES) {
    const src = path.join(seedPipeline, file);
    if (fs.existsSync(src)) {
      const dest = path.join(targetPipeline, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
  const seedInput = path.join(seedRoot, "输入");
  if (fs.existsSync(seedInput)) {
    copyDirRecursive(seedInput, path.join(taskRoot, "输入"));
  }
}

export { studioCompletedStepsBefore } from "../../../dist/video/shared/orchestrator/stepOrder.js";

export const VIDEO_STUDIO_SEED_INPUT_FILES = [SECTIONS_SNAPSHOT_FILE, MATERIAL_COMBINED_POLISHED_FILE] as const;

export function studioSeedScriptBasename(): string {
  return STUDIO_SCRIPT_FILE;
}
