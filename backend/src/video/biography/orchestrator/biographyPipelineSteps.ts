import path from "node:path";
import fs from "node:fs";
import {
  PIPELINE_ERA_BACKDROP_FILE,
  PIPELINE_CLASSIFY_FILE,
  PIPELINE_ENV_NARRATIVE_PACK_FILE,
  PIPELINE_ERA_SCENE_EMBELLISH_FILE,
  PIPELINE_GEO_SIGNAGE_REFERENCE_FILE,
  PIPELINE_LIVING_CONTEXT_REFINE_FILE,
  PIPELINE_MERGE_ENV_ERA_FILE,
  PIPELINE_NAME_UNIFY_FILE,
  PIPELINE_PHASE_REPLACE_FILE,
  PIPELINE_SCENE_EMBELLISH_FILE,
  PIPELINE_SEGMENT_REFINE_FILE,
  PIPELINE_SUBDIR,
  PIPELINE_SUBSCENE_SPLIT_FILE,
  PIPELINE_VISUAL_CREATE_FILE,
  PIPELINE_VOICEOVER_COHERENT_PACK_FILE,
  PIPELINE_VOICEOVER_PACK_FILE,
  PIPELINE_AUDIO_SCENE_RELATION_FILE,
  PIPELINE_SCENE_PACK_WITH_VISUAL_FILE,
  PIPELINE_STYLED_RENDERED_NARRATIVE_FILE,
  PIPELINE_SCENE_PACK_WITH_IMAGES_FILE,
  PIPELINE_VIDEO_CLIP_INDEX_FILE,
  AUDIO_OUTPUT_DIR,
  IMAGE_OUTPUT_DIR,
  VIDEO_CLIP_OUTPUT_DIR,
  VIDEO_OUTPUT_DIR,
  MERGED_VIDEO_FILENAME,
  MERGE_VIDEO_INDEX_FILENAME,
} from "../constants/pipelineFilenames.js";
import type { ClassifyPipelineJson } from "../../shared/llm/steps/step60Classify.js";
import {
  buildSubsceneSplitPipelineFromFiles,
  runSubsceneSplitFromPipelineJson,
} from "../llm/steps/step90SubsceneSplit.js";
import {
  buildLivingContextRefinePipelineFromFiles,
  runLivingContextRefineFromPipelineJson,
} from "../llm/steps/step100LivingContextRefine.js";
import {
  buildEnvNarrativePackPipelineFromCrossValidateFile,
  runEnvNarrativePackFromPipelineJson,
  type CrossValidatedTimelineItem,
} from "../llm/steps/step110EnvNarrativePack.js";
import { runSceneEmbellishFromPipelineJson } from "../llm/steps/step120SceneEmbellish.js";
import { runNameUnifyFromPipelineJson } from "../llm/steps/step130NameUnify.js";
import { runPhaseReplaceFromPipelineJson } from "../llm/steps/step140PhaseReplace.js";
import { runMergeEnvAndEraFromPipelineJson } from "../llm/steps/step150MergeEnvAndEraAi.js";
import type { MergedNarrativeSegmentItem } from "../llm/steps/step150MergeEnvAndEra.js";
import type { EraSubsceneSplitItem } from "../../shared/llm/steps/step30EraSubsceneSplit.js";
import {
  parseMergedNarrativeSegmentsFromMergeRaw,
  runTotalPackVoiceoverFromMergedSegments,
} from "../llm/steps/step160TotalPackVoiceover.js";
import { runVoiceoverCoherenceFromMerged } from "../llm/steps/step170VoiceoverCoherence.js";
import { runVisualCreateFromMergedSegments } from "../llm/steps/step190VisualCreate.js";
import {
  collectGeoSignageInputScenes,
  loadSignageReferenceMap,
  runGeoSignageGeneration,
} from "../llm/steps/step230GeoSignage.js";
import { synthesizeAudioRelationsFromMergedSegments } from "../render/step180Tts.js";
import { expandMergedSegmentsWithVisual, parseVisualEntriesRaw } from "../render/step200VisualExpand.js";
import { step210AddStylePrefix } from "../render/step210AddStylePrefix.js";
import { generateSceneImagesFromMergedNarrative } from "../render/step240TextToImage.js";
import {
  buildSubtitleBySegmentFromVoiceoverPackRaw,
  generateVideoClipsFromImageAndAudio,
  parseAudioRelationsFromPipeline,
  parseImageIndexesFromPipeline,
} from "../render/step250VideoClips.js";
import { mergeVideoClipsToFullVideo, parseVideoClipIndexesFromPipeline } from "../render/step260MergeVideoClips.js";
import { runStyleUserPlaceImagesOptional } from "../render/step220StyleUserPlaceImages.js";
import {
  defaultVideoStylesConfigPath,
  resolveStyleConfig,
} from "../llm/steps/videoStyles.js";
import {
  VIDEO_BIOGRAPHY_MERGE_LANE_STEP_IDS,
  VIDEO_BIOGRAPHY_PIPELINE_STEP_IDS,
  VIDEO_BIOGRAPHY_POST_PREP_PERSONAL_LANE_STEP_IDS,
  VIDEO_PIPELINE_STEPS,
} from "../constants/stepIds.js";
import { isoNow, readJsonObjectFile, sortTimelineBySegmentIndex, writeJsonAtomic } from "../../shared/orchestrator/pipelineDisk.js";
import type { InterviewScope } from "../../../services/interviewWorkspace.service";
import type { VideoTaskPaths } from "../../shared/orchestrator/videoTaskWorkspace.js";

export type BiographyVideoStepResult = {
  stepId: string;
  skipped: boolean;
  savedAt: string;
  outputRelativePath?: string;
};

export type BiographyRunContext = {
  scope: InterviewScope;
  paths: VideoTaskPaths;
  downstreamPipeline: ClassifyPipelineJson;
  ttsVoice?: string;
  styleConfigPath?: string;
  styleId?: string;
};

function relPipeline(filename: string): string {
  return `${PIPELINE_SUBDIR}/${filename}`;
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
case "90": {
      const rawSeg = readJsonObjectFile(path.join(pipelineDir, PIPELINE_SEGMENT_REFINE_FILE));
      const pipeline = buildSubsceneSplitPipelineFromFiles(rawSeg);
      let subsceneSplitTimelineSegments: Awaited<ReturnType<typeof runSubsceneSplitFromPipelineJson>> = [];
      const skipped = pipeline.splitDedupedTimelineSegments.length === 0;
      if (!skipped) {
        subsceneSplitTimelineSegments = await runSubsceneSplitFromPipelineJson(pipeline);
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_SUBSCENE_SPLIT_FILE), {
        savedAt,
        inputSegmentRefineFile: relPipeline(PIPELINE_SEGMENT_REFINE_FILE),
        polishedContextSummaries: pipeline.polishedContextSummaries,
        subsceneSplitTimelineSegments,
        skippedModel: skipped,
        segmentCount: subsceneSplitTimelineSegments.length,
        contextSummaryKeyCount: Object.keys(pipeline.polishedContextSummaries).length,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_SUBSCENE_SPLIT_FILE) };
    }

    case "100": {
      const rawSeg = readJsonObjectFile(path.join(pipelineDir, PIPELINE_SUBSCENE_SPLIT_FILE));
      const rawClassify = readJsonObjectFile(path.join(pipelineDir, PIPELINE_CLASSIFY_FILE));
      const pipeline = buildLivingContextRefinePipelineFromFiles(rawSeg, rawClassify);
      let crossValidatedTimelineSegments: Awaited<ReturnType<typeof runLivingContextRefineFromPipelineJson>> = [];
      const skipped = pipeline.subsceneSplitTimelineSegments.length === 0;
      if (!skipped) {
        crossValidatedTimelineSegments = await runLivingContextRefineFromPipelineJson(pipeline);
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_LIVING_CONTEXT_REFINE_FILE), {
        savedAt,
        inputSubsceneSplitFile: relPipeline(PIPELINE_SUBSCENE_SPLIT_FILE),
        skippedModel: skipped,
        crossValidatedTimelineSegments,
        polishedContextSummaries: pipeline.polishedContextSummaries,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_LIVING_CONTEXT_REFINE_FILE) };
    }

    case "110": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_LIVING_CONTEXT_REFINE_FILE));
      const pipeline = buildEnvNarrativePackPipelineFromCrossValidateFile(raw);
      const stabilized = sortTimelineBySegmentIndex(pipeline.crossValidatedTimelineSegments);
      let crossValidatedTimelineSegments: CrossValidatedTimelineItem[] = [];
      let envNarrativeSegmentsPack: Awaited<
        ReturnType<typeof runEnvNarrativePackFromPipelineJson>
      >["envNarrativeSegmentsPack"] = [];
      const skipped = stabilized.length === 0;
      if (!skipped) {
        const result = await runEnvNarrativePackFromPipelineJson({
          ...pipeline,
          crossValidatedTimelineSegments: stabilized,
        });
        crossValidatedTimelineSegments = result.crossValidatedTimelineSegments;
        envNarrativeSegmentsPack = result.envNarrativeSegmentsPack;
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_ENV_NARRATIVE_PACK_FILE), {
        savedAt,
        inputCrossValidateFile: relPipeline(PIPELINE_LIVING_CONTEXT_REFINE_FILE),
        skippedModel: skipped,
        crossValidatedTimelineSegments,
        envNarrativeSegmentsPack,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_ENV_NARRATIVE_PACK_FILE) };
    }

    case "120": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_ENV_NARRATIVE_PACK_FILE));
      const crossValidatedTimelineSegments = asCrossValidatedTimelineSegments(raw.crossValidatedTimelineSegments);
      let outputSegments: CrossValidatedTimelineItem[] = [];
      const skipped = crossValidatedTimelineSegments.length === 0;
      if (!skipped) {
        const result = await runSceneEmbellishFromPipelineJson({ crossValidatedTimelineSegments });
        outputSegments = result.crossValidatedTimelineSegments;
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_SCENE_EMBELLISH_FILE), {
        savedAt,
        inputFile: relPipeline(PIPELINE_ENV_NARRATIVE_PACK_FILE),
        skippedModel: skipped,
        segmentCount: outputSegments.length,
        crossValidatedTimelineSegments: outputSegments,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_SCENE_EMBELLISH_FILE) };
    }

    case "130": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_SCENE_EMBELLISH_FILE));
      const crossValidatedTimelineSegments = asCrossValidatedTimelineSegments(raw.crossValidatedTimelineSegments);
      let outputSegments: CrossValidatedTimelineItem[] = [];
      const skipped = crossValidatedTimelineSegments.length === 0;
      if (!skipped) {
        const result = await runNameUnifyFromPipelineJson({ crossValidatedTimelineSegments });
        outputSegments = result.crossValidatedTimelineSegments;
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_NAME_UNIFY_FILE), {
        savedAt,
        inputFile: relPipeline(PIPELINE_SCENE_EMBELLISH_FILE),
        skippedModel: skipped,
        segmentCount: outputSegments.length,
        crossValidatedTimelineSegments: outputSegments,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_NAME_UNIFY_FILE) };
    }

    case "140": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_NAME_UNIFY_FILE));
      const crossValidatedTimelineSegments = asCrossValidatedTimelineSegments(raw.crossValidatedTimelineSegments);
      let outputSegments: CrossValidatedTimelineItem[] = [];
      const skipped = crossValidatedTimelineSegments.length === 0;
      if (!skipped) {
        const result = await runPhaseReplaceFromPipelineJson({ crossValidatedTimelineSegments });
        outputSegments = result.crossValidatedTimelineSegments;
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_PHASE_REPLACE_FILE), {
        savedAt,
        inputFile: relPipeline(PIPELINE_NAME_UNIFY_FILE),
        skippedModel: skipped,
        segmentCount: outputSegments.length,
        crossValidatedTimelineSegments: outputSegments,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_PHASE_REPLACE_FILE) };
    }

    case "150": {
      const rawEra = readJsonObjectFile(path.join(pipelineDir, PIPELINE_ERA_SCENE_EMBELLISH_FILE));
      const rawTimeline = readJsonObjectFile(path.join(pipelineDir, PIPELINE_PHASE_REPLACE_FILE));
      const eraPack = Array.isArray(rawEra.eraSubsceneSplitTimelineSegments)
        ? (rawEra.eraSubsceneSplitTimelineSegments as EraSubsceneSplitItem[])
        : [];
      const timelinePack = sortTimelineBySegmentIndex(
        asCrossValidatedTimelineSegments(rawTimeline.crossValidatedTimelineSegments),
      );
      const skipped = timelinePack.length === 0;
      let mergedNarrativeSegments: MergedNarrativeSegmentItem[] = [];
      if (!skipped) {
        mergedNarrativeSegments = await runMergeEnvAndEraFromPipelineJson({
          timelineSegments: timelinePack,
          eraSegments: eraPack,
        });
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_MERGE_ENV_ERA_FILE), {
        savedAt,
        inputEraSceneFile: relPipeline(PIPELINE_ERA_SCENE_EMBELLISH_FILE),
        inputTimelineSceneFile: relPipeline(PIPELINE_PHASE_REPLACE_FILE),
        skippedMerge: skipped,
        timelineSegmentCount: timelinePack.length,
        eraSegmentCount: eraPack.length,
        mergedCount: mergedNarrativeSegments.length,
        mergedNarrativeSegments,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_MERGE_ENV_ERA_FILE) };
    }

    case "160": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_MERGE_ENV_ERA_FILE));
      const mergedNarrativeSegments = parseMergedNarrativeSegmentsFromMergeRaw(
        raw,
        "TOTAL_PACK_VOICEOVER_160_INVALID",
      );
      const skipped = mergedNarrativeSegments.length === 0;
      let updatedMerged = mergedNarrativeSegments;
      if (!skipped) {
        updatedMerged = await runTotalPackVoiceoverFromMergedSegments(mergedNarrativeSegments);
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_VOICEOVER_PACK_FILE), {
        savedAt,
        inputFile: relPipeline(PIPELINE_MERGE_ENV_ERA_FILE),
        skippedModel: skipped,
        mergedNarrativeSegments: updatedMerged,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_VOICEOVER_PACK_FILE) };
    }

    case "170": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_VOICEOVER_PACK_FILE));
      const mergedNarrativeSegments = parseMergedNarrativeSegmentsFromMergeRaw(
        raw,
        "VOICEOVER_COHERENCE_170_INVALID",
      );
      const inputFile = relPipeline(PIPELINE_VOICEOVER_PACK_FILE);
      const r = await runVoiceoverCoherenceFromMerged({
        mergedNarrativeSegments,
        savedAt,
        inputFile,
      });
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_VOICEOVER_COHERENT_PACK_FILE), r.payload);
      return {
        stepId,
        skipped: r.payload.skippedModel,
        savedAt: r.payload.savedAt,
        outputRelativePath: relPipeline(PIPELINE_VOICEOVER_COHERENT_PACK_FILE),
      };
    }

    case "180": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_VOICEOVER_COHERENT_PACK_FILE));
      const mergedNarrativeSegments = parseMergedNarrativeSegmentsFromMergeRaw(
        raw,
        "TOTAL_PACK_AUDIO_RELATION_180_INVALID",
      );
      const skipped = mergedNarrativeSegments.length === 0;
      let sceneAudioRelations: Awaited<
        ReturnType<typeof synthesizeAudioRelationsFromMergedSegments>
      >["relations"] = [];
      if (!skipped) {
        const voice = ctx.ttsVoice?.trim();
        if (!voice) {
          throw new Error(
            "TOTAL_PACK_AUDIO_RELATION_180_INVALID: 步骤 180 须提供非空 ttsVoice（runBiographyVideoPipeline 选项）",
          );
        }
        const r = await synthesizeAudioRelationsFromMergedSegments(mergedNarrativeSegments, AUDIO_OUTPUT_DIR, {
          ttsVoice: voice,
        });
        sceneAudioRelations = r.relations;
        for (const item of sceneAudioRelations) {
          const audio = r.audioFiles.get(item.relativePath);
          if (!audio) {
            throw new Error(`TOTAL_PACK_AUDIO_RELATION_180_INVALID: 未找到音频：${item.relativePath}`);
          }
          const audioAbs = path.join(paths.taskRoot, item.relativePath);
          fs.mkdirSync(path.dirname(audioAbs), { recursive: true });
          fs.writeFileSync(audioAbs, audio);
        }
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_AUDIO_SCENE_RELATION_FILE), {
        savedAt,
        inputFile: relPipeline(PIPELINE_VOICEOVER_COHERENT_PACK_FILE),
        audioDir: AUDIO_OUTPUT_DIR,
        skippedModel: skipped,
        clipCount: sceneAudioRelations.length,
        sceneAudioRelations,
        ttsVoice: ctx.ttsVoice?.trim() ?? null,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_AUDIO_SCENE_RELATION_FILE) };
    }

    case "190": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_MERGE_ENV_ERA_FILE));
      const mergedNarrativeSegments = parseMergedNarrativeSegmentsFromMergeRaw(raw, "VISUAL_CREATE_190_INVALID");
      const skipped = mergedNarrativeSegments.length === 0;
      let visualEntries: Awaited<ReturnType<typeof runVisualCreateFromMergedSegments>> = [];
      if (!skipped) {
        visualEntries = await runVisualCreateFromMergedSegments({ mergedNarrativeSegments });
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_VISUAL_CREATE_FILE), {
        savedAt,
        inputFile: relPipeline(PIPELINE_MERGE_ENV_ERA_FILE),
        skippedModel: skipped,
        visualCount: visualEntries.length,
        visualEntries,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_VISUAL_CREATE_FILE) };
    }

    case "200": {
      const raw160 = readJsonObjectFile(path.join(pipelineDir, PIPELINE_MERGE_ENV_ERA_FILE));
      const raw190 = readJsonObjectFile(path.join(pipelineDir, PIPELINE_VISUAL_CREATE_FILE));
      const mergedNarrativeSegments = parseMergedNarrativeSegmentsFromMergeRaw(raw160, "VISUAL_EXPAND_200_INVALID");
      const visualEntries = parseVisualEntriesRaw(raw190, "VISUAL_EXPAND_200_INVALID");
      const skipped = mergedNarrativeSegments.length === 0;
      let expandedMerged = mergedNarrativeSegments;
      if (!skipped && visualEntries.length > 0) {
        expandedMerged = expandMergedSegmentsWithVisual(mergedNarrativeSegments, visualEntries);
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_SCENE_PACK_WITH_VISUAL_FILE), {
        savedAt,
        inputFile: relPipeline(PIPELINE_MERGE_ENV_ERA_FILE),
        inputVisualFile: relPipeline(PIPELINE_VISUAL_CREATE_FILE),
        skippedReplace: skipped || visualEntries.length === 0,
        mergedCount: expandedMerged.length,
        mergedNarrativeSegments: expandedMerged,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_SCENE_PACK_WITH_VISUAL_FILE) };
    }

    case "210": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_SCENE_PACK_WITH_VISUAL_FILE));
      const mergedNarrativeSegments = Array.isArray(raw.mergedNarrativeSegments)
        ? (raw.mergedNarrativeSegments as MergedNarrativeSegmentItem[])
        : [];
      const styleConfigPath = ctx.styleConfigPath ?? defaultVideoStylesConfigPath();
      const styleConfig = resolveStyleConfig(styleConfigPath, ctx.styleId);
      const skipped = mergedNarrativeSegments.length === 0;
      let styledMerged = mergedNarrativeSegments;
      let styleId = "";
      let styleName = "";
      let stylePrefix = "";
      if (!skipped) {
        const r = step210AddStylePrefix({ mergedNarrativeSegments, styleConfig });
        styledMerged = r.mergedNarrativeSegments;
        styleId = r.style.id;
        styleName = r.style.name;
        stylePrefix = r.stylePrefix;
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_STYLED_RENDERED_NARRATIVE_FILE), {
        savedAt,
        inputFile: relPipeline(PIPELINE_SCENE_PACK_WITH_VISUAL_FILE),
        inputStyleConfig: styleConfigPath,
        styleId,
        styleName,
        stylePrefix,
        skippedStyle: skipped,
        mergedCount: styledMerged.length,
        mergedNarrativeSegments: styledMerged,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_STYLED_RENDERED_NARRATIVE_FILE) };
    }

    case "220": {
      const r = await runStyleUserPlaceImagesOptional({
        scope: ctx.scope,
        paths,
        styleConfigPath: ctx.styleConfigPath,
        styleId: ctx.styleId,
      });
      return {
        stepId: "220",
        skipped: r.skipped,
        savedAt: r.savedAt,
        ...(r.outputRelativePath ? { outputRelativePath: r.outputRelativePath } : {}),
      };
    }

    case "230": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_STYLED_RENDERED_NARRATIVE_FILE));
      const mergedNarrativeSegments = Array.isArray(raw.mergedNarrativeSegments)
        ? (raw.mergedNarrativeSegments as MergedNarrativeSegmentItem[])
        : [];
      const inputFile = relPipeline(PIPELINE_STYLED_RENDERED_NARRATIVE_FILE);
      const inputScenes = collectGeoSignageInputScenes(mergedNarrativeSegments);
      const r = await runGeoSignageGeneration({ inputScenes, savedAt, inputFile });
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_GEO_SIGNAGE_REFERENCE_FILE), r.payload);
      return {
        stepId,
        skipped: r.payload.skippedModel,
        savedAt: r.payload.savedAt,
        outputRelativePath: relPipeline(PIPELINE_GEO_SIGNAGE_REFERENCE_FILE),
      };
    }

    case "240": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_STYLED_RENDERED_NARRATIVE_FILE));
      const mergedNarrativeSegments = Array.isArray(raw.mergedNarrativeSegments)
        ? (raw.mergedNarrativeSegments as MergedNarrativeSegmentItem[])
        : [];
      const outPath = path.join(pipelineDir, PIPELINE_SCENE_PACK_WITH_IMAGES_FILE);
      const model = (process.env.TEXT2IMG_MODEL ?? "doubao-seedream-5-0-260128").trim() || "doubao-seedream-5-0-260128";
      const signageMap = loadSignageReferenceMap(pipelineDir);
      const skipped = mergedNarrativeSegments.length === 0;
      let imageCount = 0;
      if (!skipped) {
        const r = await generateSceneImagesFromMergedNarrative({
          mergedNarrativeSegments,
          imageRelativeDir: IMAGE_OUTPUT_DIR,
          workspaceRoot: paths.taskRoot,
          outPath,
          savedAt,
          inputFile: relPipeline(PIPELINE_STYLED_RENDERED_NARRATIVE_FILE),
          model,
          imageDir: IMAGE_OUTPUT_DIR,
          signageByScene: signageMap,
        });
        imageCount = r.images.length;
      } else {
        writeJsonAtomic(outPath, {
          savedAt,
          inputFile: relPipeline(PIPELINE_STYLED_RENDERED_NARRATIVE_FILE),
          model,
          imageDir: IMAGE_OUTPUT_DIR,
          imageCount: 0,
          skippedModel: true,
          text2imgInProgress: false,
          imageIndexes: [],
        });
      }
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_SCENE_PACK_WITH_IMAGES_FILE) };
    }

    case "250": {
      const rawImage = readJsonObjectFile(path.join(pipelineDir, PIPELINE_SCENE_PACK_WITH_IMAGES_FILE));
      const rawAudio = readJsonObjectFile(path.join(pipelineDir, PIPELINE_AUDIO_SCENE_RELATION_FILE));
      const imageIndexes = parseImageIndexesFromPipeline(rawImage);
      const audioIndexes = parseAudioRelationsFromPipeline(rawAudio);
      const rawVo = readJsonObjectFile(path.join(pipelineDir, PIPELINE_VOICEOVER_COHERENT_PACK_FILE));
      let subtitleBySegment = new Map<number, string[]>();
      if (Object.keys(rawVo).length > 0) {
        try {
          subtitleBySegment = buildSubtitleBySegmentFromVoiceoverPackRaw(rawVo);
        } catch {
          subtitleBySegment = new Map();
        }
      }
      const skipped = imageIndexes.length === 0;
      let videoClipIndexes: Awaited<ReturnType<typeof generateVideoClipsFromImageAndAudio>> = [];
      if (!skipped) {
        videoClipIndexes = await generateVideoClipsFromImageAndAudio({
          workspaceRoot: paths.taskRoot,
          imageIndexes,
          audioIndexes,
          videoRelativeDir: VIDEO_CLIP_OUTPUT_DIR,
          subtitleBySegment,
        });
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_VIDEO_CLIP_INDEX_FILE), {
        savedAt,
        inputImageIndexFile: relPipeline(PIPELINE_SCENE_PACK_WITH_IMAGES_FILE),
        inputAudioIndexFile: relPipeline(PIPELINE_AUDIO_SCENE_RELATION_FILE),
        videoDir: VIDEO_CLIP_OUTPUT_DIR,
        clipCount: videoClipIndexes.length,
        skippedModel: skipped,
        videoClipIndexes,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_VIDEO_CLIP_INDEX_FILE) };
    }

    case "260": {
      const rawClip = readJsonObjectFile(path.join(pipelineDir, PIPELINE_VIDEO_CLIP_INDEX_FILE));
      const clips = parseVideoClipIndexesFromPipeline(rawClip);
      const skipped = clips.length === 0;
      const mergedVideoRel = path.posix.join(VIDEO_OUTPUT_DIR, MERGED_VIDEO_FILENAME);
      let segmentOrder: number[] = [];
      if (!skipped) {
        const r = mergeVideoClipsToFullVideo({
          workspaceRoot: paths.taskRoot,
          clips,
          outputVideoRelativePath: mergedVideoRel,
        });
        segmentOrder = r.segmentOrder;
        try {
          fs.unlinkSync(r.concatListPath);
        } catch {
          /* ignore */
        }
      }
      const outIdxPath = path.join(paths.taskRoot, VIDEO_OUTPUT_DIR, MERGE_VIDEO_INDEX_FILENAME);
      writeJsonAtomic(outIdxPath, {
        savedAt,
        inputClipIndexFile: relPipeline(PIPELINE_VIDEO_CLIP_INDEX_FILE),
        mergedVideoRelativePath: skipped ? "" : mergedVideoRel,
        clipCount: clips.length,
        skippedModel: skipped,
        segmentOrder,
      });
      return {
        stepId,
        skipped,
        savedAt,
        outputRelativePath: path.posix.join(VIDEO_OUTPUT_DIR, MERGE_VIDEO_INDEX_FILENAME),
      };
    }

    default:
      throw new Error(`BIOGRAPHY_PIPELINE_UNKNOWN_STEP: ${stepId}`);
  }
}

export const BIOGRAPHY_MERGE_LANE_STEP_IDS = VIDEO_BIOGRAPHY_MERGE_LANE_STEP_IDS;
export const BIOGRAPHY_PIPELINE_STEP_IDS = VIDEO_BIOGRAPHY_PIPELINE_STEP_IDS;
export { VIDEO_PIPELINE_STEPS, VIDEO_BIOGRAPHY_POST_PREP_PERSONAL_LANE_STEP_IDS };
export type BiographyPipelineStepId = (typeof BIOGRAPHY_PIPELINE_STEP_IDS)[number];
