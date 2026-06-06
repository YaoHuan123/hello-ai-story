import fs from "node:fs";
import path from "node:path";
import type { AnsweredSection } from "../../../topic/types";
import { MATERIAL_COMBINED_POLISHED_FILE } from "../constants/prepFilenames.js";
import {
  runMaterialPolishFromSections,
  type MaterialPolishMode,
} from "../llm/steps/step10MaterialPolish.js";
import { runStoryArticlePolishFromSections } from "../llm/steps/step10StoryArticlePolish.js";
import {
  buildDownstreamPipelineJson,
  filterSectionsForVideo,
  type TurnReasonItem,
} from "./sectionsFilter.js";

export type { TurnReasonItem, MaterialPolishMode };
export { buildDownstreamPipelineJson, buildMaterialPolishLlmInput, buildStubPolishedFromSections, classifyPipelineForLlm, filterSectionsForVideo, joinSectionQaSource } from "./sectionsFilter.js";

/** 将 step-10 产物写入任务 `输入/` 目录（文件名与老成片链一致）。 */
export function writePolishedInputFile(inputDir: string, polished: Record<string, string>): string {
  fs.mkdirSync(inputDir, { recursive: true });
  const outPath = path.join(inputDir, MATERIAL_COMBINED_POLISHED_FILE);
  const tmp = `${outPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(polished, null, 2), "utf-8");
  fs.renameSync(tmp, outPath);
  return outPath;
}

/**
 * sections → step-10（或 stub）→ 供 step 60 / 20 使用的 pipeline JSON。
 * 4.4 任务编排可直接调用。
 */
export async function polishSectionsForVideoPipeline(
  sections: AnsweredSection[],
  opts?: {
    mode?: MaterialPolishMode;
    turnReasonAnswers?: TurnReasonItem[];
    inputDir?: string;
  },
): Promise<{
  polishedTemplateInstanceSummaries: Record<string, string>;
  downstreamPipeline: ReturnType<typeof buildDownstreamPipelineJson>;
  sectionCount: number;
  polishedInputPath?: string;
}> {
  const filtered = filterSectionsForVideo(sections);
  const { polishedTemplateInstanceSummaries } = await runMaterialPolishFromSections(filtered, {
    mode: opts?.mode,
  });

  const downstreamPipeline = buildDownstreamPipelineJson({
    polishedTemplateInstanceSummaries,
    turnReasonAnswers: opts?.turnReasonAnswers,
  });

  let polishedInputPath: string | undefined;
  if (opts?.inputDir) {
    polishedInputPath = writePolishedInputFile(opts.inputDir, polishedTemplateInstanceSummaries);
  }

  return {
    polishedTemplateInstanceSummaries,
    downstreamPipeline,
    sectionCount: filtered.length,
    polishedInputPath,
  };
}

/**
 * 故事正文 → step-10（或 stub）→ 供 step 60 / 20 使用的 pipeline JSON。
 */
export async function polishStoryArticleForVideoPipeline(
  sections: AnsweredSection[],
  storyArticle: string,
  opts?: {
    mode?: MaterialPolishMode;
    turnReasonAnswers?: TurnReasonItem[];
    inputDir?: string;
  },
): Promise<{
  polishedTemplateInstanceSummaries: Record<string, string>;
  downstreamPipeline: ReturnType<typeof buildDownstreamPipelineJson>;
  sectionCount: number;
  polishedInputPath?: string;
}> {
  const filtered = filterSectionsForVideo(sections);
  const { polishedTemplateInstanceSummaries } = await runStoryArticlePolishFromSections(
    filtered,
    storyArticle,
    { mode: opts?.mode },
  );

  const downstreamPipeline = buildDownstreamPipelineJson({
    polishedTemplateInstanceSummaries,
    turnReasonAnswers: opts?.turnReasonAnswers,
  });

  let polishedInputPath: string | undefined;
  if (opts?.inputDir) {
    polishedInputPath = writePolishedInputFile(opts.inputDir, polishedTemplateInstanceSummaries);
  }

  return {
    polishedTemplateInstanceSummaries,
    downstreamPipeline,
    sectionCount: filtered.length,
    polishedInputPath,
  };
}
