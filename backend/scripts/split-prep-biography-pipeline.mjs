import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = path.join(root, "src/video/biography/orchestrator/biographyPipelineSteps.ts");
const src = fs.readFileSync(srcPath, "utf8");

const prepHeader = `import path from "node:path";
import {
  PIPELINE_AI_ERA_EVENTS_FILE,
  PIPELINE_CLASSIFY_77_FILE,
  PIPELINE_CONTEXT_EXPAND_78_FILE,
  PIPELINE_ERA_ENV_NARRATIVE_PACK_150_FILE,
  PIPELINE_ERA_SCENE_EMBELLISH_153_FILE,
  PIPELINE_ERA_SUBSCENE_SPLIT_105_FILE,
  PIPELINE_SEGMENT_REFINE_79_FILE,
  PIPELINE_SUBDIR,
  MATERIAL_COMBINED_POLISHED_FILE,
} from "../constants/prepFilenames.js";
import type { ClassifyPipelineJson } from "../llm/steps/classify77.js";
import { runClassifyFromPipelineJson } from "../llm/steps/classify77.js";
import {
  derivePolishedSummariesFromClassifyRaw,
  runContextExpandFromPipelineJson,
} from "../llm/steps/contextExpand78.js";
import {
  buildSegmentRefinePipelineFromFiles,
  runSegmentRefineFromPipelineJson,
} from "../llm/steps/segmentRefine79.js";
import type { EraSubsceneSplitItem } from "../llm/steps/eraSubsceneSplit105.js";
import {
  buildEraSubsceneSplitPipelineFromFiles,
  runEraSubsceneSplitFromPipelineJson,
} from "../llm/steps/eraSubsceneSplit105.js";
import {
  parseEraSubsceneSplitTimelineSegmentsFromRaw,
  runEraEnvNarrativePackFromSubsceneSplit,
} from "../llm/steps/eraEnvNarrativePack150.js";
import {
  parseEraSubsceneSplitTimelineSegmentsFromPackRaw,
  runEraEnvSceneEmbellishFromSubsceneSplit,
} from "../llm/steps/eraEnvSceneEmbellish153.js";
import { runEraBackdropFromPipelineJson } from "../llm/steps/eraBackdrop.js";
import { isoNow, readJsonObjectFile, writeJsonAtomic } from "./pipelineDisk.js";
import type { VideoTaskPaths } from "./videoTaskWorkspace.js";

export type PrepStepResult = {
  stepId: string;
  skipped: boolean;
  savedAt: string;
  outputRelativePath?: string;
};

export type PrepRunContext = {
  paths: VideoTaskPaths;
  downstreamPipeline: ClassifyPipelineJson;
};

function relPipeline(filename: string): string {
  return \`\${PIPELINE_SUBDIR}/\${filename}\`;
}

export async function runPrepPipelineStep(
  stepId: string,
  ctx: PrepRunContext,
): Promise<PrepStepResult> {
  const { paths, downstreamPipeline } = ctx;
  const { pipelineDir } = paths;
  const savedAt = isoNow();

  switch (stepId) {
`;

const bioHeader = `import path from "node:path";
import fs from "node:fs";
import {
  PIPELINE_AI_ERA_EVENTS_FILE,
  PIPELINE_CLASSIFY_77_FILE,
  PIPELINE_ENV_NARRATIVE_PACK_140_FILE,
  PIPELINE_ERA_SCENE_EMBELLISH_153_FILE,
  PIPELINE_GEO_SIGNAGE_REFERENCE_225_FILE,
  PIPELINE_LIVING_CONTEXT_REFINE_100_FILE,
  PIPELINE_MERGE_ENV_ERA_150_FILE,
  PIPELINE_NAME_UNIFY_120_FILE,
  PIPELINE_PHASE_REPLACE_140_FILE,
  PIPELINE_SCENE_EMBELLISH_143_FILE,
  PIPELINE_SEGMENT_REFINE_79_FILE,
  PIPELINE_SUBDIR,
  PIPELINE_SUBSCENE_SPLIT_90_FILE,
  PIPELINE_VISUAL_CREATE_190_FILE,
  PIPELINE_VOICEOVER_COHERENT_PACK_FILE,
  PIPELINE_VOICEOVER_PACK_FILE,
  PIPELINE_AUDIO_SCENE_RELATION_3_FILE,
  PIPELINE_SCENE_PACK_WITH_VISUAL_200_FILE,
  PIPELINE_STYLED_RENDERED_NARRATIVE_220_FILE,
  PIPELINE_SCENE_PACK_WITH_IMAGES_230_FILE,
  PIPELINE_VIDEO_CLIP_INDEX_240_FILE,
  AUDIO_OUTPUT_DIR,
  IMAGE_OUTPUT_DIR,
  VIDEO_CLIP_OUTPUT_DIR,
  VIDEO_OUTPUT_DIR,
  MERGED_VIDEO_FILENAME,
  MERGE_VIDEO_INDEX_FILENAME,
} from "../constants/pipelineFilenames.js";
import type { ClassifyPipelineJson } from "../../shared/llm/steps/classify77.js";
import {
  buildSubsceneSplitPipelineFromFiles,
  runSubsceneSplitFromPipelineJson,
} from "../llm/steps/subsceneSplit80.js";
import {
  buildLivingContextRefinePipelineFromFiles,
  runLivingContextRefineFromPipelineJson,
} from "../llm/steps/livingContextRefine85.js";
import {
  buildEnvNarrativePackPipelineFromCrossValidateFile,
  runEnvNarrativePackFromPipelineJson,
  type CrossValidatedTimelineItem,
} from "../llm/steps/envNarrativePack140.js";
import { runSceneEmbellishFromPipelineJson } from "../llm/steps/sceneEmbellish143.js";
import { runNameUnifyFromPipelineJson } from "../llm/steps/nameUnify120.js";
import { runPhaseReplaceFromPipelineJson } from "../llm/steps/phaseReplace130.js";
import { runMergeEnvAndEraFromPipelineJson } from "../llm/steps/mergeEnvAndEra160Ai.js";
import type { MergedNarrativeSegmentItem } from "../llm/steps/mergeEnvAndEra160.js";
import type { EraSubsceneSplitItem } from "../../shared/llm/steps/eraSubsceneSplit105.js";
import {
  parseMergedNarrativeSegmentsFromMergeRaw,
  runTotalPackVoiceoverFromMergedSegments,
} from "../llm/steps/totalPackVoiceover110.js";
import { runVoiceoverCoherenceFromMerged } from "../llm/steps/voiceoverCoherence112.js";
import { runVisualCreateFromMergedSegments } from "../llm/steps/visualCreate190.js";
import {
  collectGeoSignageInputScenes,
  loadSignageReferenceMap,
  runGeoSignageGeneration,
} from "../llm/steps/geoSignage225.js";
import { synthesizeAudioRelationsFromMergedSegments } from "../render/totalPackAudioRelation3.js";
import { expandMergedSegmentsWithVisual, parseVisualEntriesRaw } from "../render/visualExpand200.js";
import { addStylePrefix220 } from "../render/addStylePrefix220.js";
import { generateSceneImagesFromMergedNarrative } from "../render/textToImage230.js";
import {
  buildSubtitleBySegmentFromVoiceoverPackRaw,
  generateVideoClipsFromImageAndAudio,
  parseAudioRelationsFromPipeline,
  parseImageIndexesFromPipeline,
} from "../render/videoClips240.js";
import { mergeVideoClipsToFullVideo, parseVideoClipIndexesFromPipeline } from "../render/mergeVideoClips250.js";
import { runStyleUserPlaceImagesOptional } from "../render/styleUserPlaceImages235.js";
import {
  defaultVideoStylesConfigPath,
  loadVideoStyles,
} from "../llm/steps/videoStyles.js";
import {
  VIDEO_BIOGRAPHY_LANE_STEP_IDS,
  VIDEO_BIOGRAPHY_MERGE_LANE_STEP_IDS,
  VIDEO_BIOGRAPHY_PIPELINE_STEP_IDS,
  VIDEO_PIPELINE_STEPS,
} from "../constants/stepIds.js";
import { isoNow, readJsonObjectFile, sortTimelineBySegmentIndex, writeJsonAtomic } from "../../shared/orchestrator/pipelineDisk.js";
import type { VideoTaskPaths } from "../../shared/orchestrator/videoTaskWorkspace.js";

export type BiographyVideoStepResult = {
  stepId: string;
  skipped: boolean;
  savedAt: string;
  outputRelativePath?: string;
};

export type BiographyRunContext = {
  paths: VideoTaskPaths;
  downstreamPipeline: ClassifyPipelineJson;
  ttsVoice?: string;
  styleConfigPath?: string;
};

function relPipeline(filename: string): string {
  return \`\${PIPELINE_SUBDIR}/\${filename}\`;
}

function asCrossValidatedTimelineSegments(raw: unknown): CrossValidatedTimelineItem[] {
  return Array.isArray(raw) ? (raw as CrossValidatedTimelineItem[]) : [];
}

export async function runBiographyPipelineStep(
  stepId: string,
  ctx: BiographyRunContext,
): Promise<BiographyVideoStepResult> {
  const { paths, downstreamPipeline } = ctx;
  const { pipelineDir } = paths;
  const savedAt = isoNow();

  switch (stepId) {
`;

const switchStart = src.indexOf('switch (stepId) {');
const switchBody = src.slice(switchStart);
const prepEnd = switchBody.indexOf('case "90":');
const prepCases = switchBody.slice(switchBody.indexOf('case "20":'), prepEnd);
const bioCases = switchBody.slice(prepEnd);

const prepFooter = `
    default:
      throw new Error(\`PREP_PIPELINE_UNKNOWN_STEP: \${stepId}\`);
  }
}
`;

const bioFooter = `
    default:
      throw new Error(\`BIOGRAPHY_PIPELINE_UNKNOWN_STEP: \${stepId}\`);
  }
}

export const BIOGRAPHY_ERA_LANE_STEP_IDS = [] as const;
export const BIOGRAPHY_PERSONAL_LANE_STEP_IDS = [] as const;
export const BIOGRAPHY_MERGE_LANE_STEP_IDS = VIDEO_BIOGRAPHY_MERGE_LANE_STEP_IDS;
export const BIOGRAPHY_LLM_PIPELINE_STEP_IDS = VIDEO_BIOGRAPHY_LANE_STEP_IDS;
export const BIOGRAPHY_PIPELINE_STEP_IDS = VIDEO_BIOGRAPHY_PIPELINE_STEP_IDS;
export type BiographyLlmPipelineStepId = (typeof BIOGRAPHY_LLM_PIPELINE_STEP_IDS)[number];
export type BiographyPipelineStepId = (typeof BIOGRAPHY_PIPELINE_STEP_IDS)[number];
`;

fs.writeFileSync(
  path.join(root, "src/video/shared/orchestrator/prepPipelineSteps.ts"),
  prepHeader + prepCases + prepFooter,
);
fs.writeFileSync(
  path.join(root, "src/video/biography/orchestrator/biographyPipelineSteps.ts"),
  bioHeader + bioCases.replace(
    `export const BIOGRAPHY_ERA_LANE_STEP_IDS = VIDEO_ERA_LANE_STEP_IDS;
export const BIOGRAPHY_PERSONAL_LANE_STEP_IDS = VIDEO_PERSONAL_LANE_STEP_IDS;
export const BIOGRAPHY_MERGE_LANE_STEP_IDS = VIDEO_MERGE_LANE_STEP_IDS;
export const BIOGRAPHY_LLM_PIPELINE_STEP_IDS = VIDEO_PIPELINE_LLM_RENDER_ORDER;
export const BIOGRAPHY_PIPELINE_STEP_IDS = VIDEO_PIPELINE_ALL_STEP_IDS;
export { VIDEO_PIPELINE_STEPS };`,
    "",
  ) + bioFooter,
);

console.log("split done");
