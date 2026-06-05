/**
 * 批量更新 step 模块 PROMPT_FILE 与编排 switch case 编号。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const videoSrc = path.join(root, "backend", "src", "video");

const PROMPT_REPLACEMENTS = [
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
  ["create-video/audio-110_voiceover-post-alignment.md", "step-160_voiceover-post-alignment.md"],
  ["audio-110_voiceover-post-alignment.md", "step-160_voiceover-post-alignment.md"],
  ["audio-170_voiceover-coherence.md", "step-170_voiceover-coherence.md"],
  ["visual-190_visual-create.md", "step-190_visual-create.md"],
  ["visual-225_geo-signage-reference.md", "step-230_geo-signage-reference.md"],
  ["visual-230_text-to-image-direct.md", "step-240_text-to-image-direct.md"],
];

/** 旧 stepId -> 新 stepId（编排 switch） */
const CASE_REPLACEMENTS = [
  ['case "250":', 'case "260":'],
  ['case "240":', 'case "250":'],
  ['case "230":', 'case "240":'],
  ['case "225":', 'case "230":'],
  ['case "235":', 'case "220":'],
  ['case "220":', 'case "210":'],
  ['case "3":', 'case "180":'],
  ['case "112":', 'case "170":'],
  ['case "110":', 'case "160":'],
  ['case "160":', 'case "150":'],
  ['case "130":', 'case "140":'],
  ['case "120":', 'case "130":'],
  ['case "143":', 'case "120":'],
  ['case "140":', 'case "110":'],
  ['case "85":', 'case "100":'],
  ['case "80":', 'case "90":'],
  ['case "79":', 'case "80":'],
  ['case "78":', 'case "70":'],
  ['case "77":', 'case "60":'],
  ['case "153":', 'case "50":'],
  ['case "150":', 'case "40":'],
  ['case "105":', 'case "30":'],
  ['case "100":', 'case "20":'],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

for (const file of walk(videoSrc)) {
  let text = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const [from, to] of PROMPT_REPLACEMENTS) {
    if (text.includes(from)) {
      text = text.split(from).join(to);
      changed = true;
    }
  }
  if (file.endsWith("biographyPipelineSteps.ts")) {
    for (const [from, to] of CASE_REPLACEMENTS) {
      if (text.includes(from)) {
        text = text.split(from).join(to);
        changed = true;
      }
    }
    text = text.replace(/stepId: "220"/g, 'stepId: "220"'); // styleUserPlace - already 220 after case remap
    text = text.replace(/return \{ stepId: "220", skipped: r\.skipped/g, 'return { stepId: "220", skipped: r.skipped');
  }
  if (changed) {
    fs.writeFileSync(file, text);
    console.log("updated:", path.relative(root, file));
  }
}

console.log("done");
