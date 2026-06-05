/**
 * 传记集成测试：从 step 140 产物续跑 150→230 的 seed fixture。
 *
 * 目录结构：
 *   test/fixtures/video-bio-through-140/
 *     pipeline/   ← 各 step 落盘 JSON（含 step-140）
 *     输入/       ← 可选
 *
 * 导出：node scripts/export-video-bio-seed.mjs <taskRoot>
 */
import fs from "node:fs";
import path from "node:path";
import {
  PIPELINE_ERA_BACKDROP_FILE,
  PIPELINE_ERA_SUBSCENE_SPLIT_FILE,
  PIPELINE_ERA_ENV_NARRATIVE_PACK_FILE,
  PIPELINE_ERA_SCENE_EMBELLISH_FILE,
  PIPELINE_CLASSIFY_FILE,
  PIPELINE_CONTEXT_EXPAND_FILE,
  PIPELINE_SEGMENT_REFINE_FILE,
  PIPELINE_SUBDIR,
  MATERIAL_COMBINED_POLISHED_FILE,
} from "../../../dist/video/shared/constants/prepFilenames.js";
import {
  PIPELINE_SUBSCENE_SPLIT_FILE,
  PIPELINE_LIVING_CONTEXT_REFINE_FILE,
  PIPELINE_ENV_NARRATIVE_PACK_FILE,
  PIPELINE_SCENE_EMBELLISH_FILE,
  PIPELINE_NAME_UNIFY_FILE,
  PIPELINE_PHASE_REPLACE_FILE,
} from "../../../dist/video/biography/constants/pipelineFilenames.js";
import {
  VIDEO_PIPELINE_STEPS,
  VIDEO_BIOGRAPHY_PIPELINE_STEP_IDS,
} from "../../../dist/video/biography/constants/stepIds.js";
import { compareVideoPipelineSteps } from "../../../dist/video/shared/orchestrator/stepOrder.js";
import { SECTIONS_SNAPSHOT_FILE } from "../../../dist/video/shared/orchestrator/videoTaskWorkspace.js";

export const VIDEO_BIO_SEED_MIN_PIPELINE_FILES = [
  PIPELINE_ERA_SCENE_EMBELLISH_FILE,
  PIPELINE_PHASE_REPLACE_FILE,
] as const;

export const VIDEO_BIO_SEED_PIPELINE_FILES = [
  PIPELINE_ERA_BACKDROP_FILE,
  PIPELINE_ERA_SUBSCENE_SPLIT_FILE,
  PIPELINE_ERA_ENV_NARRATIVE_PACK_FILE,
  PIPELINE_ERA_SCENE_EMBELLISH_FILE,
  PIPELINE_CLASSIFY_FILE,
  PIPELINE_CONTEXT_EXPAND_FILE,
  PIPELINE_SEGMENT_REFINE_FILE,
  PIPELINE_SUBSCENE_SPLIT_FILE,
  PIPELINE_LIVING_CONTEXT_REFINE_FILE,
  PIPELINE_ENV_NARRATIVE_PACK_FILE,
  PIPELINE_SCENE_EMBELLISH_FILE,
  PIPELINE_NAME_UNIFY_FILE,
  PIPELINE_PHASE_REPLACE_FILE,
] as const;

export const VIDEO_BIO_SEED_THROUGH_STEP = VIDEO_PIPELINE_STEPS.PHASE_REPLACE;
export const VIDEO_BIO_DEFAULT_FROM_STEP = VIDEO_PIPELINE_STEPS.MERGE;

const THIS_DIR = path.dirname(__filename);
export const DEFAULT_VIDEO_BIO_SEED_ROOT = path.join(THIS_DIR, "../../fixtures/video-bio-through-140");

export function resolveVideoBioSeedRoot(): string {
  const env = (process.env.VIDEO_BIO_SEED_DIR ?? "").trim();
  return env || DEFAULT_VIDEO_BIO_SEED_ROOT;
}

export function videoBioSeedPipelineDir(seedRoot = resolveVideoBioSeedRoot()): string {
  return path.join(seedRoot, PIPELINE_SUBDIR);
}

export function isVideoBioSeedReady(seedRoot = resolveVideoBioSeedRoot()): boolean {
  const pipelineDir = videoBioSeedPipelineDir(seedRoot);
  return VIDEO_BIO_SEED_MIN_PIPELINE_FILES.every((f) => fs.existsSync(path.join(pipelineDir, f)));
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

export function copyVideoBioSeedToTask(taskRoot: string, seedRoot = resolveVideoBioSeedRoot()): void {
  if (!isVideoBioSeedReady(seedRoot)) {
    throw new Error(
      `VIDEO_BIO_SEED_MISSING: seed 不完整。请先 node scripts/export-video-bio-seed.mjs <taskRoot>`,
    );
  }
  const seedPipeline = videoBioSeedPipelineDir(seedRoot);
  const targetPipeline = path.join(taskRoot, PIPELINE_SUBDIR);
  fs.mkdirSync(targetPipeline, { recursive: true });
  for (const file of VIDEO_BIO_SEED_PIPELINE_FILES) {
    const src = path.join(seedPipeline, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(targetPipeline, file));
    }
  }
  const seedInput = path.join(seedRoot, "输入");
  if (fs.existsSync(seedInput)) {
    copyDirRecursive(seedInput, path.join(taskRoot, "输入"));
  }
}

export function completedStepsBefore(fromStep: string): string[] {
  return VIDEO_BIOGRAPHY_PIPELINE_STEP_IDS.filter((id) => compareVideoPipelineSteps(id, fromStep) < 0);
}

export const VIDEO_BIO_SEED_INPUT_FILES = [SECTIONS_SNAPSHOT_FILE, MATERIAL_COMBINED_POLISHED_FILE] as const;
