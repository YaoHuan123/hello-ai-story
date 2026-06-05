/**
 * 将 prompts/create-video 下提示词重命名为 step-{id}_ 前缀（与 stepIds.ts 对齐）。
 * 用法：node scripts/rename-video-step-prompts.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const promptDir = path.join(__dirname, "..", "..", "prompts", "create-video");

/** [oldBasename, newBasename] */
const RENAMES = [
  ["entry-20_material-polish.md", "step-10_material-polish.md"],
  ["era-100_era-backdrop-segments.md", "step-20_era-backdrop-segments.md"],
  ["era-105_era-subscene-split.md", "step-30_era-subscene-split.md"],
  ["era-150_era-env-narrative-pack.md", "step-40_era-env-narrative-pack.md"],
  ["era-153_era-env-scene-embellish.md", "step-50_era-env-scene-embellish.md"],
  ["env-77_classify.md", "step-60_classify.md"],
  ["env-78_context-expand-events.md", "step-70_context-expand-events.md"],
  ["env-79_segment-refine.md", "step-80_segment-refine.md"],
  ["env-80_subscene-split.md", "step-90_subscene-split.md"],
  ["env-85_living-context-refine.md", "step-100_living-context-refine.md"],
  ["env-140_env-narrative-pack.md", "step-110_env-narrative-pack.md"],
  ["env-143_env-scene-embellish.md", "step-120_env-scene-embellish.md"],
  ["merge-120_name-unify.md", "step-130_name-unify.md"],
  ["merge-130_phase-replace.md", "step-140_phase-replace.md"],
  ["merge-150_merge-env-and-era-ai.md", "step-150_merge-env-and-era-ai.md"],
  ["audio-110_env-voiceover.md", "step-160_env-voiceover.md"],
  ["audio-110_voiceover-post-alignment.md", "step-160_voiceover-post-alignment.md"],
  ["audio-170_voiceover-coherence.md", "step-170_voiceover-coherence.md"],
  ["visual-190_visual-create.md", "step-190_visual-create.md"],
  ["visual-200_visual-expand.md", "step-200_visual-expand.md"],
  ["visual-220_包含视频风格的展开后的场景包.md", "step-210_style-prefix.md"].filter(Boolean),
  ["visual-225_geo-signage-reference.md", "step-230_geo-signage-reference.md"],
  ["visual-230_text-to-image-direct.md", "step-240_text-to-image-direct.md"],
];

// fix wrong entry - visual-220 doesn't exist with that name
const MAP = [
  ["entry-20_material-polish.md", "step-10_material-polish.md"],
  ["era-100_era-backdrop-segments.md", "step-20_era-backdrop-segments.md"],
  ["era-105_era-subscene-split.md", "step-30_era-subscene-split.md"],
  ["era-150_era-env-narrative-pack.md", "step-40_era-env-narrative-pack.md"],
  ["era-153_era-env-scene-embellish.md", "step-50_era-env-scene-embellish.md"],
  ["env-77_classify.md", "step-60_classify.md"],
  ["env-78_context-expand-events.md", "step-70_context-expand-events.md"],
  ["env-79_segment-refine.md", "step-80_segment-refine.md"],
  ["env-80_subscene-split.md", "step-90_subscene-split.md"],
  ["env-85_living-context-refine.md", "step-100_living-context-refine.md"],
  ["env-140_env-narrative-pack.md", "step-110_env-narrative-pack.md"],
  ["env-143_env-scene-embellish.md", "step-120_env-scene-embellish.md"],
  ["merge-120_name-unify.md", "step-130_name-unify.md"],
  ["merge-130_phase-replace.md", "step-140_phase-replace.md"],
  ["merge-150_merge-env-and-era-ai.md", "step-150_merge-env-and-era-ai.md"],
  ["audio-110_env-voiceover.md", "step-160_env-voiceover.md"],
  ["audio-110_voiceover-post-alignment.md", "step-160_voiceover-post-alignment.md"],
  ["audio-170_voiceover-coherence.md", "step-170_voiceover-coherence.md"],
  ["visual-190_visual-create.md", "step-190_visual-create.md"],
  ["visual-225_geo-signage-reference.md", "step-230_geo-signage-reference.md"],
  ["visual-230_text-to-image-direct.md", "step-240_text-to-image-direct.md"],
];

for (const [from, to] of MAP) {
  const src = path.join(promptDir, from);
  const dst = path.join(promptDir, to);
  if (!fs.existsSync(src)) {
    console.warn(`skip missing: ${from}`);
    continue;
  }
  if (fs.existsSync(dst)) {
    fs.unlinkSync(dst);
  }
  fs.renameSync(src, dst);
  console.log(`${from} -> ${to}`);
}
