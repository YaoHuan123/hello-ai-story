/**
 * 导出符号与错误码对齐权威 step id（去掉旧编号后缀）。
 * 用法：node scripts/rename-video-step-symbols.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 长名优先，避免子串误替换 */
const REPLACEMENTS = [
  // prep 10
  ["MaterialPolish20PipelineJson", "MaterialPolishPipelineJson"],
  ["MaterialPolish20Result", "MaterialPolishResult"],
  ["MaterialPolish20Mode", "MaterialPolishMode"],
  ["MATERIAL_POLISH_20", "MATERIAL_POLISH_10"],

  // prep 30 era subscene
  ["parseEraSubsceneSplitTimelineSegmentsFrom150Raw", "parseEraSubsceneSplitTimelineSegmentsFromPackRaw"],
  ["parseEraSubsceneSplitTimelineSegmentsFrom105Raw", "parseEraSubsceneSplitTimelineSegmentsFromRaw"],
  ["buildEraSubsceneSplit105PipelineFromFiles", "buildEraSubsceneSplitPipelineFromFiles"],
  ["runEraSubsceneSplit105FromPipelineJson", "runEraSubsceneSplitFromPipelineJson"],
  ["applyInputTimeLabelsToEraSubscene105Result", "applyInputTimeLabelsToEraSubsceneResult"],
  ["EraSubsceneSplit105PipelineOutput", "EraSubsceneSplitPipelineOutput"],
  ["EraSubsceneSplit105PipelineInput", "EraSubsceneSplitPipelineInput"],
  ["EraSubsceneSplit105Item", "EraSubsceneSplitItem"],
  ["ERA_SUBSCENE_SPLIT_105_INVALID", "ERA_SUBSCENE_SPLIT_30_INVALID"],
  ["era_subscene_split_105", "era_subscene_split_30"],

  // prep 40/50
  ["parseEraEnvNarrativeSegmentsPackFrom150Raw", "parseEraEnvNarrativeSegmentsPackFromRaw"],
  ["runEraEnvNarrativePack150FromSubsceneSplit", "runEraEnvNarrativePackFromSubsceneSplit"],
  ["runEraEnvNarrativePack150FromSegments", "runEraEnvNarrativePackFromSegments"],
  ["EraEnvNarrativePack150Output", "EraEnvNarrativePackOutput"],
  ["EraEnvNarrativePack150Input", "EraEnvNarrativePackInput"],
  ["runEraEnvSceneEmbellish153FromSubsceneSplit", "runEraEnvSceneEmbellishFromSubsceneSplit"],
  ["runEraEnvSceneEmbellish153FromPipelineJson", "runEraEnvSceneEmbellishFromPipelineJson"],
  ["EraEnvSceneEmbellish153Output", "EraEnvSceneEmbellishOutput"],
  ["EraEnvSceneEmbellish153Input", "EraEnvSceneEmbellishInput"],
  ["ERA_ENV_SCENE_EMBELLISH_153", "ERA_ENV_SCENE_EMBELLISH_50"],
  ["slimPackForEraEnv153", "slimPackForEraEnvSceneEmbellish"],

  // prep 60-80
  ["derivePolishedSummariesFromClassify77Raw", "derivePolishedSummariesFromClassifyRaw"],
  ["buildSegmentRefine79PipelineFromFiles", "buildSegmentRefinePipelineFromFiles"],
  ["runSegmentRefine79FromPipelineJson", "runSegmentRefineFromPipelineJson"],
  ["runContextExpand78FromPipelineJson", "runContextExpandFromPipelineJson"],
  ["wrapContextExpand78CallError", "wrapContextExpandCallError"],
  ["runClassify77FromPipelineJson", "runClassifyFromPipelineJson"],
  ["ContextExpand78PipelineInput", "ContextExpandPipelineInput"],
  ["Classify77PipelineJson", "ClassifyPipelineJson"],
  ["Classify77Result", "ClassifyResult"],
  ["assertClassify77Shape", "assertClassifyShape"],
  ["SEGMENT_REFINE_79_INVALID", "SEGMENT_REFINE_80_INVALID"],
  ["CONTEXT_EXPAND_78_INVALID", "CONTEXT_EXPAND_70_INVALID"],
  ["CLASSIFY_77_INVALID", "CLASSIFY_60_INVALID"],
  ["classify_77", "classify_60"],
  ["inputSegmentRefine79File", "inputSegmentRefineFile"],
  ["loadSegmentRefine79Events", "loadSegmentRefineEvents"],
  ["inputExpand78File", "inputContextExpandFile"],

  // bio 90-120
  ["buildEnvNarrativePack140PipelineFromCrossValidate85File", "buildEnvNarrativePackPipelineFromCrossValidateFile"],
  ["buildLivingContextRefine85PipelineFromFiles", "buildLivingContextRefinePipelineFromFiles"],
  ["runLivingContextRefine85FromPipelineJson", "runLivingContextRefineFromPipelineJson"],
  ["LivingContextRefine85OutputItem", "LivingContextRefineOutputItem"],
  ["LivingContextRefine85PipelineInput", "LivingContextRefinePipelineInput"],
  ["buildSubsceneSplit80PipelineFromFiles", "buildSubsceneSplitPipelineFromFiles"],
  ["runSubsceneSplit80FromPipelineJson", "runSubsceneSplitFromPipelineJson"],
  ["parseEnvNarrativeSegmentsPackFrom140Raw", "parseEnvNarrativeSegmentsPackFromRaw"],
  ["runEnvNarrativePack140FromPipelineJson", "runEnvNarrativePackFromPipelineJson"],
  ["runEnvNarrativePack140ForSlice", "runEnvNarrativePackForSlice"],
  ["EnvNarrativePack140PipelineJson", "EnvNarrativePackPipelineJson"],
  ["runSceneEmbellish143FromPipelineJson", "runSceneEmbellishFromPipelineJson"],
  ["runSceneEmbellish143ForSlice", "runSceneEmbellishForSlice"],
  ["SceneEmbellish143Output", "SceneEmbellishOutput"],
  ["SceneEmbellish143Input", "SceneEmbellishInput"],
  ["ENV_NARRATIVE_PACK_140_INVALID", "ENV_NARRATIVE_PACK_110_INVALID"],
  ["ENV_SCENE_EMBELLISH_143_INVALID", "ENV_SCENE_EMBELLISH_120_INVALID"],
  ["LIVING_CONTEXT_REFINE_85", "LIVING_CONTEXT_REFINE_100"],
  ["SUBSCENE_SPLIT_80", "SUBSCENE_SPLIT_90"],
  ["env_narrative_pack_140", "env_narrative_pack_110"],
  ["SubsceneSplit80PipelineInput", "SubsceneSplitPipelineInput"],
  ["SubsceneSplit80Item", "SubsceneSplitItem"],

  // bio 130-150
  ["runPhaseReplace130FromPipelineJson", "runPhaseReplaceFromPipelineJson"],
  ["runPhaseReplace130ForSlice", "runPhaseReplaceForSlice"],
  ["runNameUnify120FromPipelineJson", "runNameUnifyFromPipelineJson"],
  ["runMergeEnvAndEra160FromPipelineJson", "runMergeEnvAndEraFromPipelineJson"],
  ["parseMergedNarrativeSegmentsFromMerge160Raw", "parseMergedNarrativeSegmentsFromMergeRaw"],
  ["PhaseReplace130Output", "PhaseReplaceOutput"],
  ["PhaseReplace130Input", "PhaseReplaceInput"],
  ["NameUnify120Output", "NameUnifyOutput"],
  ["NameUnify120Input", "NameUnifyInput"],
  ["NAME_UNIFY_120_INVALID", "NAME_UNIFY_130_INVALID"],
  ["PHASE_REPLACE_130", "PHASE_REPLACE_140"],
  ["buildMerge160AiPayload", "buildMergeEnvAndEraAiPayload"],
  ["MERGE_ENV_ERA_160", "MERGE_ENV_ERA_150"],

  // bio 160-170 voiceover
  ["runTotalPackVoiceover110FromMergedSegments", "runTotalPackVoiceoverFromMergedSegments"],
  ["runVoiceoverCoherence112FromMerged", "runVoiceoverCoherenceFromMerged"],
  ["VoiceoverCoherence112FilePayload", "VoiceoverCoherenceFilePayload"],
  ["voiceoverCoherence112Model", "voiceoverCoherenceModel"],
  ["TOTAL_PACK_VOICEOVER_110_ALIGNMENT_INVALID", "TOTAL_PACK_VOICEOVER_160_ALIGNMENT_INVALID"],
  ["TOTAL_PACK_VOICEOVER_110_INVALID", "TOTAL_PACK_VOICEOVER_160_INVALID"],
  ["runVoiceover110AlignmentModelCheck", "runVoiceoverAlignmentModelCheck"],
  ["buildVoiceover110AlignmentPayload", "buildVoiceoverAlignmentPayload"],
  ["assertVoiceover110AlignmentResult", "assertVoiceoverAlignmentResult"],
  ["assertVoiceover110Shape", "assertVoiceoverShape"],
  ["splitMergedFor110PipelineJson", "splitMergedForVoiceoverPipelineJson"],
  ["EmotionalInnerSignalItemFor110", "EmotionalInnerSignalItem"],
  ["AdjacencyHintItemFor110", "AdjacencyHintItem"],
  ["SegmentSourceFor110", "VoiceoverSegmentSource"],
  ["EraBackdropSegmentFor110", "EraBackdropVoiceoverSegment"],
  ["total_pack_voiceover_110_alignment", "total_pack_voiceover_160_alignment"],
  ["total_pack_voiceover_110", "total_pack_voiceover_160"],
  ["VOICEOVER_COHERENCE_112_INVALID", "VOICEOVER_COHERENCE_170_INVALID"],

  // bio 190-230
  ["runVisualCreate190FromMergedSegments", "runVisualCreateFromMergedSegments"],
  ["collectGeoSignage225InputScenes", "collectGeoSignageInputScenes"],
  ["runGeoSignage225Generation", "runGeoSignageGeneration"],
  ["parseVisualEntries190Raw", "parseVisualEntriesRaw"],
  ["assertVisualCreate190Shape", "assertVisualCreateShape"],
  ["VisualCreate190Input", "VisualCreateInput"],
  ["GeoSignage225FilePayload", "GeoSignageFilePayload"],
  ["GeoSignage225InputScene", "GeoSignageInputScene"],
  ["GeoSignage225SceneRow", "GeoSignageSceneRow"],
  ["VisualEntry190", "VisualEntry"],
  ["GEO_SIGNAGE_225_INVALID", "GEO_SIGNAGE_230_INVALID"],
  ["GEO_SIGNAGE_225_MODEL", "GEO_SIGNAGE_230_MODEL"],
  ["visual_create_190", "visual_create_190"],

  // render 180-260
  ["runStyleUserPlaceImages235Optional", "runStyleUserPlaceImagesOptional"],
  ["parseVideoClipIndexesFrom240", "parseVideoClipIndexesFromPipeline"],
  ["parseImageIndexesFrom230", "parseImageIndexesFromPipeline"],
  ["parseAudioRelationsFrom3", "parseAudioRelationsFromPipeline"],
  ["TOTAL_PACK_AUDIO_RELATION_3_INVALID", "TOTAL_PACK_AUDIO_RELATION_180_INVALID"],
  ["writeText2img230Manifest", "writeText2imgManifest"],
  ["isText2img230OutputComplete", "isText2imgOutputComplete"],
  ["text2img230ForceFullEnabled", "text2imgForceFullEnabled"],
  ["Text2img230ManifestItem", "Text2imgManifestItem"],
  ["text2img230Concurrency", "text2imgConcurrency"],
  ["videoClips240Concurrency", "videoClipsConcurrency"],
  ["TEXT2IMG_230_INVALID", "TEXT2IMG_240_INVALID"],
  ["VIDEO_CLIPS_240_INVALID", "VIDEO_CLIPS_250_INVALID"],
  ["MERGE_VIDEO_250_INVALID", "MERGE_VIDEO_260_INVALID"],

  ["SegmentRefine79PipelineInput", "SegmentRefinePipelineInput"],
  ["runMaterialPolish20FromSections", "runMaterialPolishFromSections"],
  ["runMaterialPolish20", "runMaterialPolish"],
  ["callMaterialPolish20Llm", "callMaterialPolishLlm"],
  ["assertLivingContextRefine85Shape", "assertLivingContextRefineShape"],
  ["assertSubsceneSplit80Shape", "assertSubsceneSplitShape"],
  ["rawSegmentRefine79", "rawSegmentRefine"],
  ["rawClassify77", "rawClassify"],
  ["rawExpand78", "rawContextExpand"],
  ["SEGMENT_REFINE_79_TIMELINE_INTERLEAVE", "SEGMENT_REFINE_80_TIMELINE_INTERLEAVE"],
  ["VOICEOVER_COHERENCE_112_MODEL", "VOICEOVER_COHERENCE_170_MODEL"],
  ["voiceover_coherence_112", "voiceover_coherence_170"],
  ["era_env_scene_embellish_153_subscene", "era_env_scene_embellish_50_subscene"],
  ["era_env_scene_embellish_153_pack", "era_env_scene_embellish_50_pack"],
  ["scene_embellish_143", "scene_embellish_120"],
  ["geo_signage_225", "geo_signage_230"],
  ["segment_refine_79", "segment_refine_80"],
  ["polish_20", "polish_10"],
  ["步骤 112 ", "步骤 170 "],
  ["步骤 153 ", "步骤 50 "],
  ["步骤 140/143/120", "步骤 110/120"],
  ["步骤 153 / 合并 160", "步骤 50 / 合并 150"],
  ["120 / 140 / 130 / 105 / 150 / 153 / 80 / 85 / 225", "120 / 140 / 130 / 30 / 40 / 50 / 80 / 100 / 230"],
  ["将 225 产物", "将 230 产物"],
  ["读取 225 产物", "读取 230 产物"],
  ["audio-112_", "audio-170_"],
  ["步骤 78 落盘与步骤 60", "步骤 70 落盘与步骤 60"],
  ["从 77 派生", "从 60 派生"],
  ["步骤 225 ", "步骤 230 "],
  ["步骤 143 ", "步骤 120 "],
  ["步骤 140 ", "步骤 110 "],
  ["步骤 110 ", "步骤 160 "],
  ["步骤 105 ", "步骤 30 "],
  ["步骤 79 ", "步骤 80 "],
  ["步骤 77 ", "步骤 60 "],
  ["重试步骤 110", "重试步骤 160"],
  ["步骤 110，", "步骤 160，"],
  ["步骤 160 合并", "步骤 150 合并"],
  ["步骤 110（", "步骤 160（"],
  ["merge-160_", "merge-150_"],
  ["步骤 85 ", "步骤 100 "],
  ["步骤 85 输出", "步骤 100 输出"],
  ["步骤 85 落盘", "步骤 100 落盘"],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      walk(p, out);
    } else if (/\.(ts|mjs)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

const scanDirs = [
  path.join(backendRoot, "src", "video"),
  path.join(backendRoot, "test", "unit", "video"),
  path.join(backendRoot, "scripts"),
];

for (const dir of scanDirs) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    if (file.endsWith("rename-video-step-symbols.mjs")) continue;
    let s = fs.readFileSync(file, "utf-8");
    let changed = false;
    for (const [from, to] of REPLACEMENTS) {
      if (from === to) continue;
      if (s.includes(from)) {
        s = s.split(from).join(to);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(file, s, "utf-8");
      console.log(`updated ${path.relative(backendRoot, file)}`);
    }
  }
}

console.log("done");
