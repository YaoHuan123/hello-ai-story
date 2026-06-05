/**
 * 一次性：源码文件名与 import 对齐权威 step id（step{id}Name.ts）。
 * 用法：node scripts/align-video-step-filenames.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "video");

const RENAMES = [
  ["shared/llm/steps/materialPolish20.ts", "shared/llm/steps/step10MaterialPolish.ts"],
  ["shared/llm/steps/eraBackdrop.ts", "shared/llm/steps/step20EraBackdrop.ts"],
  ["shared/llm/steps/eraSubsceneSplit105.ts", "shared/llm/steps/step30EraSubsceneSplit.ts"],
  ["shared/llm/steps/eraEnvNarrativePack150.ts", "shared/llm/steps/step40EraEnvNarrativePack.ts"],
  ["shared/llm/steps/eraEnvSceneEmbellish153.ts", "shared/llm/steps/step50EraEnvSceneEmbellish.ts"],
  ["shared/llm/steps/classify77.ts", "shared/llm/steps/step60Classify.ts"],
  ["shared/llm/steps/contextExpand78.ts", "shared/llm/steps/step70ContextExpand.ts"],
  ["shared/llm/steps/segmentRefine79.ts", "shared/llm/steps/step80SegmentRefine.ts"],
  ["biography/llm/steps/subsceneSplit80.ts", "biography/llm/steps/step90SubsceneSplit.ts"],
  ["biography/llm/steps/livingContextRefine85.ts", "biography/llm/steps/step100LivingContextRefine.ts"],
  ["biography/llm/steps/envNarrativePack140.ts", "biography/llm/steps/step110EnvNarrativePack.ts"],
  ["biography/llm/steps/sceneEmbellish143.ts", "biography/llm/steps/step120SceneEmbellish.ts"],
  ["biography/llm/steps/nameUnify120.ts", "biography/llm/steps/step130NameUnify.ts"],
  ["biography/llm/steps/phaseReplace130.ts", "biography/llm/steps/step140PhaseReplace.ts"],
  ["biography/llm/steps/mergeEnvAndEra160.ts", "biography/llm/steps/step150MergeEnvAndEra.ts"],
  ["biography/llm/steps/mergeEnvAndEra160Ai.ts", "biography/llm/steps/step150MergeEnvAndEraAi.ts"],
  ["biography/llm/steps/totalPackVoiceover110.ts", "biography/llm/steps/step160TotalPackVoiceover.ts"],
  ["biography/llm/steps/voiceoverCoherence112.ts", "biography/llm/steps/step170VoiceoverCoherence.ts"],
  ["biography/llm/steps/visualCreate190.ts", "biography/llm/steps/step190VisualCreate.ts"],
  ["biography/llm/steps/geoSignage225.ts", "biography/llm/steps/step230GeoSignage.ts"],
  ["biography/render/totalPackAudioRelation3.ts", "biography/render/step180Tts.ts"],
  ["biography/render/visualExpand200.ts", "biography/render/step200VisualExpand.ts"],
  ["biography/render/addStylePrefix220.ts", "biography/render/step210AddStylePrefix.ts"],
  ["biography/render/styleUserPlaceImages235.ts", "biography/render/step220StyleUserPlaceImages.ts"],
  ["biography/render/textToImage230.ts", "biography/render/step240TextToImage.ts"],
  ["biography/render/videoClips240.ts", "biography/render/step250VideoClips.ts"],
  ["biography/render/mergeVideoClips250.ts", "biography/render/step260MergeVideoClips.ts"],
];

/** old basename (no ext) -> new basename for import paths */
const IMPORT_REPLACEMENTS = Object.fromEntries(
  RENAMES.map(([from, to]) => {
    const oldBase = path.basename(from, ".ts");
    const newBase = path.basename(to, ".ts");
    return [oldBase, newBase];
  }),
);

const CONST_REPLACEMENTS = [
  ["PIPELINE_AI_ERA_EVENTS_FILE", "PIPELINE_ERA_BACKDROP_FILE"],
  ["PIPELINE_ERA_SUBSCENE_SPLIT_105_FILE", "PIPELINE_ERA_SUBSCENE_SPLIT_FILE"],
  ["PIPELINE_ERA_ENV_NARRATIVE_PACK_150_FILE", "PIPELINE_ERA_ENV_NARRATIVE_PACK_FILE"],
  ["PIPELINE_ERA_SCENE_EMBELLISH_153_FILE", "PIPELINE_ERA_SCENE_EMBELLISH_FILE"],
  ["PIPELINE_CLASSIFY_77_FILE", "PIPELINE_CLASSIFY_FILE"],
  ["PIPELINE_CONTEXT_EXPAND_78_FILE", "PIPELINE_CONTEXT_EXPAND_FILE"],
  ["PIPELINE_SEGMENT_REFINE_79_FILE", "PIPELINE_SEGMENT_REFINE_FILE"],
  ["PIPELINE_SUBSCENE_SPLIT_90_FILE", "PIPELINE_SUBSCENE_SPLIT_FILE"],
  ["PIPELINE_LIVING_CONTEXT_REFINE_100_FILE", "PIPELINE_LIVING_CONTEXT_REFINE_FILE"],
  ["PIPELINE_ENV_NARRATIVE_PACK_140_FILE", "PIPELINE_ENV_NARRATIVE_PACK_FILE"],
  ["PIPELINE_SCENE_EMBELLISH_143_FILE", "PIPELINE_SCENE_EMBELLISH_FILE"],
  ["PIPELINE_NAME_UNIFY_120_FILE", "PIPELINE_NAME_UNIFY_FILE"],
  ["PIPELINE_PHASE_REPLACE_140_FILE", "PIPELINE_PHASE_REPLACE_FILE"],
  ["PIPELINE_MERGE_ENV_ERA_150_FILE", "PIPELINE_MERGE_ENV_ERA_FILE"],
  ["PIPELINE_AUDIO_SCENE_RELATION_3_FILE", "PIPELINE_AUDIO_SCENE_RELATION_FILE"],
  ["PIPELINE_SCENE_PACK_WITH_VISUAL_200_FILE", "PIPELINE_SCENE_PACK_WITH_VISUAL_FILE"],
  ["PIPELINE_STYLED_RENDERED_NARRATIVE_220_FILE", "PIPELINE_STYLED_RENDERED_NARRATIVE_FILE"],
  ["PIPELINE_SCENE_PACK_WITH_IMAGES_230_FILE", "PIPELINE_SCENE_PACK_WITH_IMAGES_FILE"],
  ["PIPELINE_VIDEO_CLIP_INDEX_240_FILE", "PIPELINE_VIDEO_CLIP_INDEX_FILE"],
  ["PIPELINE_VISUAL_CREATE_190_FILE", "PIPELINE_VISUAL_CREATE_FILE"],
  ["PIPELINE_GEO_SIGNAGE_REFERENCE_225_FILE", "PIPELINE_GEO_SIGNAGE_REFERENCE_FILE"],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|mjs|js)$/.test(ent.name)) out.push(p);
  }
  return out;
}

for (const [relFrom, relTo] of RENAMES) {
  const from = path.join(root, relFrom);
  const to = path.join(root, relTo);
  if (!fs.existsSync(from)) {
    console.error(`missing: ${relFrom}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  console.log(`renamed ${relFrom} -> ${relTo}`);
}

const scanRoots = [
  path.join(root, ".."),
  path.join(path.dirname(root), "scripts"),
  path.join(path.dirname(root), "test"),
];

const files = scanRoots.flatMap((d) => (fs.existsSync(d) ? walk(d) : []));

for (const file of files) {
  let s = fs.readFileSync(file, "utf-8");
  let changed = false;
  for (const [oldBase, newBase] of Object.entries(IMPORT_REPLACEMENTS)) {
    if (s.includes(oldBase)) {
      s = s.split(oldBase).join(newBase);
      changed = true;
    }
  }
  for (const [oldC, newC] of CONST_REPLACEMENTS) {
    if (s.includes(oldC)) {
      s = s.split(oldC).join(newC);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, s, "utf-8");
    console.log(`updated ${path.relative(path.join(root, ".."), file)}`);
  }
}

console.log("done");
