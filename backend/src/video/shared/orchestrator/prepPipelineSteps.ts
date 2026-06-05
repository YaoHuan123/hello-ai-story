import path from "node:path";
import {
  PIPELINE_ERA_BACKDROP_FILE,
  PIPELINE_CLASSIFY_FILE,
  PIPELINE_CONTEXT_EXPAND_FILE,
  PIPELINE_ERA_ENV_NARRATIVE_PACK_FILE,
  PIPELINE_ERA_SCENE_EMBELLISH_FILE,
  PIPELINE_ERA_SUBSCENE_SPLIT_FILE,
  PIPELINE_SEGMENT_REFINE_FILE,
  PIPELINE_SUBDIR,
  MATERIAL_COMBINED_POLISHED_FILE,
} from "../constants/prepFilenames.js";
import type { ClassifyPipelineJson } from "../llm/steps/step60Classify.js";
import { runClassifyFromPipelineJson } from "../llm/steps/step60Classify.js";
import {
  derivePolishedSummariesFromClassifyRaw,
  runContextExpandFromPipelineJson,
} from "../llm/steps/step70ContextExpand.js";
import {
  buildSegmentRefinePipelineFromFiles,
  runSegmentRefineFromPipelineJson,
} from "../llm/steps/step80SegmentRefine.js";
import type { EraSubsceneSplitItem } from "../llm/steps/step30EraSubsceneSplit.js";
import {
  buildEraSubsceneSplitPipelineFromFiles,
  runEraSubsceneSplitFromPipelineJson,
} from "../llm/steps/step30EraSubsceneSplit.js";
import {
  parseEraSubsceneSplitTimelineSegmentsFromRaw,
  runEraEnvNarrativePackFromSubsceneSplit,
} from "../llm/steps/step40EraEnvNarrativePack.js";
import {
  parseEraSubsceneSplitTimelineSegmentsFromPackRaw,
  runEraEnvSceneEmbellishFromSubsceneSplit,
} from "../llm/steps/step50EraEnvSceneEmbellish.js";
import { runEraBackdropFromPipelineJson } from "../llm/steps/step20EraBackdrop.js";
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
  return `${PIPELINE_SUBDIR}/${filename}`;
}

function isPrepStub(): boolean {
  return process.env.VIDEO_INPUT_STUB === "1" || process.env.VIDEO_PREP_STUB === "1";
}

const PREP_STUB_SEGMENT_REFINE = [
  {
    segmentIndex: 1,
    narrative: "测试用户出生于1960年，在平凡家庭中长大，父母重视教育。",
    timeLabel: "1960年代",
    title: "早年",
  },
];

export async function runPrepPipelineStep(
  stepId: string,
  ctx: PrepRunContext,
): Promise<PrepStepResult> {
  const { paths, downstreamPipeline } = ctx;
  const { pipelineDir } = paths;
  const savedAt = isoNow();

  switch (stepId) {
case "20": {
      const polishedKeys = Object.keys(downstreamPipeline.polishedTemplateInstanceSummaries).filter((k) => k.trim());
      let step20EraBackdropSegments: Awaited<ReturnType<typeof runEraBackdropFromPipelineJson>> = [];
      let skipped = polishedKeys.length === 0;
      if (!skipped && !isPrepStub()) {
        step20EraBackdropSegments = await runEraBackdropFromPipelineJson(downstreamPipeline);
      }
      const outPath = path.join(pipelineDir, PIPELINE_ERA_BACKDROP_FILE);
      writeJsonAtomic(outPath, {
        savedAt,
        inputPolishedFile: relPipeline(MATERIAL_COMBINED_POLISHED_FILE),
        polishedEntryCount: polishedKeys.length,
        turnAnswerItemCount: downstreamPipeline.turnReasonAnswers?.items.length ?? 0,
        skippedModel: skipped,
        step20EraBackdropSegments,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_ERA_BACKDROP_FILE) };
    }

    case "30": {
      const inputPath = path.join(pipelineDir, PIPELINE_ERA_BACKDROP_FILE);
      const pipelineInput = buildEraSubsceneSplitPipelineFromFiles(inputPath);
      let eraSubsceneSplitTimelineSegments: EraSubsceneSplitItem[] = [];
      const skipped = pipelineInput.step20EraBackdropSegments.length === 0;
      if (!skipped && !isPrepStub()) {
        const result = await runEraSubsceneSplitFromPipelineJson(pipelineInput);
        eraSubsceneSplitTimelineSegments = result.eraSubsceneSplitTimelineSegments;
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_ERA_SUBSCENE_SPLIT_FILE), {
        savedAt,
        inputFile: relPipeline(PIPELINE_ERA_BACKDROP_FILE),
        skippedModel: skipped,
        segmentCount: eraSubsceneSplitTimelineSegments.length,
        eraSubsceneSplitTimelineSegments,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_ERA_SUBSCENE_SPLIT_FILE) };
    }

    case "40": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_ERA_SUBSCENE_SPLIT_FILE));
      const eraSubsceneSplitTimelineSegments = parseEraSubsceneSplitTimelineSegmentsFromRaw(raw);
      let outputSegments: EraSubsceneSplitItem[] = [];
      const skipped = eraSubsceneSplitTimelineSegments.length === 0;
      if (!skipped && !isPrepStub()) {
        const result = await runEraEnvNarrativePackFromSubsceneSplit({ eraSubsceneSplitTimelineSegments });
        outputSegments = result.eraSubsceneSplitTimelineSegments;
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_ERA_ENV_NARRATIVE_PACK_FILE), {
        savedAt,
        inputFile: relPipeline(PIPELINE_ERA_SUBSCENE_SPLIT_FILE),
        skippedModel: skipped,
        segmentCount: outputSegments.length,
        eraSubsceneSplitTimelineSegments: outputSegments,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_ERA_ENV_NARRATIVE_PACK_FILE) };
    }

    case "50": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_ERA_ENV_NARRATIVE_PACK_FILE));
      const eraSubsceneSplitTimelineSegments = parseEraSubsceneSplitTimelineSegmentsFromPackRaw(raw);
      let outputSegments: EraSubsceneSplitItem[] = [];
      const skipped = eraSubsceneSplitTimelineSegments.length === 0;
      if (!skipped && !isPrepStub()) {
        const result = await runEraEnvSceneEmbellishFromSubsceneSplit({ eraSubsceneSplitTimelineSegments });
        outputSegments = result.eraSubsceneSplitTimelineSegments;
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_ERA_SCENE_EMBELLISH_FILE), {
        savedAt,
        inputFile: relPipeline(PIPELINE_ERA_ENV_NARRATIVE_PACK_FILE),
        skippedModel: skipped,
        segmentCount: outputSegments.length,
        eraSubsceneSplitTimelineSegments: outputSegments,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_ERA_SCENE_EMBELLISH_FILE) };
    }

    case "60": {
      const polishedKeys = Object.keys(downstreamPipeline.polishedTemplateInstanceSummaries).filter((k) => k.trim());
      let templateInstances: Awaited<ReturnType<typeof runClassifyFromPipelineJson>>["templateInstances"] = [];
      let segmentKindById: Awaited<ReturnType<typeof runClassifyFromPipelineJson>>["segmentKindById"] = {};
      const skipped = polishedKeys.length === 0;
      if (!skipped && !isPrepStub()) {
        const r = await runClassifyFromPipelineJson(downstreamPipeline);
        templateInstances = r.templateInstances;
        segmentKindById = r.segmentKindById;
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_CLASSIFY_FILE), {
        savedAt,
        inputPolishedFile: relPipeline(MATERIAL_COMBINED_POLISHED_FILE),
        inputTurnAnswersFile: "",
        polishedEntryCount: polishedKeys.length,
        turnAnswerItemCount: downstreamPipeline.turnReasonAnswers?.items.length ?? 0,
        skippedModel: skipped,
        templateInstances,
        segmentKindById,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_CLASSIFY_FILE) };
    }

    case "70": {
      const raw = readJsonObjectFile(path.join(pipelineDir, PIPELINE_CLASSIFY_FILE));
      const templateInstances = raw.templateInstances;
      const tiLen = Array.isArray(templateInstances) ? templateInstances.length : 0;
      const { polishedEventSummaries, polishedContextSummaries } = derivePolishedSummariesFromClassifyRaw(raw);
      let polishedEventSummariesContextExpanded: Awaited<
        ReturnType<typeof runContextExpandFromPipelineJson>
      > = [];
      const skipped = tiLen === 0;
      if (!skipped && !isPrepStub()) {
        polishedEventSummariesContextExpanded = await runContextExpandFromPipelineJson({
          polishedEventSummaries,
          polishedContextSummaries,
        });
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_CONTEXT_EXPAND_FILE), {
        savedAt,
        inputClassifyFile: relPipeline(PIPELINE_CLASSIFY_FILE),
        polishedEventSummaryCount: Object.keys(polishedEventSummaries).length,
        polishedContextSummaryCount: Object.keys(polishedContextSummaries).length,
        skippedModel: skipped,
        polishedEventSummariesContextExpanded,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_CONTEXT_EXPAND_FILE) };
    }

    case "80": {
      const rawExpand = readJsonObjectFile(path.join(pipelineDir, PIPELINE_CONTEXT_EXPAND_FILE));
      const rawClassify = readJsonObjectFile(path.join(pipelineDir, PIPELINE_CLASSIFY_FILE));
      const pipeline = buildSegmentRefinePipelineFromFiles(rawExpand, rawClassify);
      let splitDedupedTimelineSegments: Awaited<ReturnType<typeof runSegmentRefineFromPipelineJson>> = [];
      const skipped = isPrepStub() ? false : pipeline.polishedEventSummariesContextExpanded.length === 0;
      if (isPrepStub()) {
        splitDedupedTimelineSegments = PREP_STUB_SEGMENT_REFINE as Awaited<
          ReturnType<typeof runSegmentRefineFromPipelineJson>
        >;
      } else if (!skipped) {
        splitDedupedTimelineSegments = await runSegmentRefineFromPipelineJson(pipeline);
      }
      writeJsonAtomic(path.join(pipelineDir, PIPELINE_SEGMENT_REFINE_FILE), {
        savedAt,
        inputContextExpandFile: relPipeline(PIPELINE_CONTEXT_EXPAND_FILE),
        polishedContextSummaries: pipeline.polishedContextSummaries,
        splitDedupedTimelineSegments,
        skippedModel: skipped,
        segmentCount: splitDedupedTimelineSegments.length,
        contextSummaryKeyCount: Object.keys(pipeline.polishedContextSummaries).length,
      });
      return { stepId, skipped, savedAt, outputRelativePath: relPipeline(PIPELINE_SEGMENT_REFINE_FILE) };
    }

    
    default:
      throw new Error(`PREP_PIPELINE_UNKNOWN_STEP: ${stepId}`);
  }
}
