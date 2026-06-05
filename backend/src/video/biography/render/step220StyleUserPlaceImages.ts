import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "../../../services/interviewWorkspace.service";
import {
  listInterviewPlaceImages,
  resolveInterviewPlaceImageAbs,
} from "../../../services/interviewPlaceImages.service.js";
import { readJsonObjectFile, writeJsonAtomic, isoNow } from "../../shared/orchestrator/pipelineDisk.js";
import type { VideoTaskPaths } from "../../shared/orchestrator/videoTaskWorkspace.js";
import {
  defaultVideoStylesConfigPath,
  resolveStyleConfig,
  resolveSelectedStyle,
  styleToImageRestylePrompt,
} from "../llm/steps/videoStyles.js";
import { restyleImagePngFromBuffer } from "./step240TextToImage.js";

const STYLED_SUBDIR = "styled-place-images";
const OUTPUT_INDEX_FILE = "experiment-place-styled-images.json";

export type PlaceStyledImageItem = {
  id: string;
  sourceImageId: string;
  placeKey: string;
  sourceRelativePath: string;
  styledRelativePath: string;
  styleId: string;
  styleName: string;
  savedAt: string;
  error?: string;
};

/** 步骤 220：用户实景图风格化；无采访级地点图时跳过。 */
export async function runStyleUserPlaceImagesOptional(params: {
  scope: InterviewScope;
  paths: VideoTaskPaths;
  styleConfigPath?: string;
  styleId?: string;
}): Promise<{
  stepId: "220";
  skipped: boolean;
  savedAt: string;
  reason?: string;
  outputRelativePath?: string;
}> {
  const savedAt = isoNow();
  const indexPath = path.join(params.paths.pipelineDir, OUTPUT_INDEX_FILE);
  const sourceIndex = listInterviewPlaceImages(params.scope);
  if (sourceIndex.items.length === 0) {
    writeJsonAtomic(indexPath, {
      savedAt,
      skipped: true,
      reason: "NO_PLACE_IMAGES",
      items: [],
    });
    return { stepId: "220", skipped: true, savedAt, reason: "NO_PLACE_IMAGES" };
  }

  const styleConfigPath = params.styleConfigPath?.trim() || defaultVideoStylesConfigPath();
  const styleConfig = resolveStyleConfig(styleConfigPath, params.styleId);
  const style = resolveSelectedStyle(styleConfig);
  const stylePrompt = styleToImageRestylePrompt(style);

  const styledDirAbs = path.join(params.paths.pipelineDir, STYLED_SUBDIR);
  fs.mkdirSync(styledDirAbs, { recursive: true });

  const prev = readJsonObjectFile(indexPath);
  const prevItems = Array.isArray(prev.items) ? (prev.items as PlaceStyledImageItem[]) : [];
  const prevBySource = new Map(prevItems.map((x) => [x.sourceImageId, x]));

  const nextItems: PlaceStyledImageItem[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const row of sourceIndex.items) {
    const srcAbs = resolveInterviewPlaceImageAbs(params.scope, row);
    if (!fs.existsSync(srcAbs)) {
      failedCount += 1;
      nextItems.push({
        id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        sourceImageId: row.id,
        placeKey: row.placeKey,
        sourceRelativePath: row.relativePath,
        styledRelativePath: "",
        styleId: style.id,
        styleName: style.name,
        savedAt: isoNow(),
        error: "SOURCE_IMAGE_MISSING",
      });
      continue;
    }

    try {
      const srcBuf = fs.readFileSync(srcAbs);
      const png = await restyleImagePngFromBuffer({
        prompt: stylePrompt,
        sourceBuffer: srcBuf,
        mimeType: row.mimeType,
      });
      const prevRow = prevBySource.get(row.id);
      const id = prevRow?.id || `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const fileName = `${row.placeKey.replace(/[^\w\u4e00-\u9fff-]+/g, "_").slice(0, 40)}-${id}.png`;
      const styledRelativePath = `${STYLED_SUBDIR}/${fileName}`;
      fs.writeFileSync(path.join(params.paths.pipelineDir, styledRelativePath), png);
      successCount += 1;
      nextItems.push({
        id,
        sourceImageId: row.id,
        placeKey: row.placeKey,
        sourceRelativePath: row.relativePath,
        styledRelativePath,
        styleId: style.id,
        styleName: style.name,
        savedAt: isoNow(),
      });
    } catch (e) {
      failedCount += 1;
      const msg = e instanceof Error ? e.message : String(e);
      nextItems.push({
        id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        sourceImageId: row.id,
        placeKey: row.placeKey,
        sourceRelativePath: row.relativePath,
        styledRelativePath: "",
        styleId: style.id,
        styleName: style.name,
        savedAt: isoNow(),
        error: msg.slice(0, 500),
      });
    }
  }

  writeJsonAtomic(indexPath, {
    savedAt,
    skipped: false,
    styleId: style.id,
    styleName: style.name,
    total: sourceIndex.items.length,
    successCount,
    failedCount,
    items: nextItems,
  });

  return {
    stepId: "220",
    skipped: successCount === 0,
    savedAt,
    reason: successCount === 0 ? "ALL_RESTYLE_FAILED" : undefined,
    outputRelativePath: `pipeline/${OUTPUT_INDEX_FILE}`,
  };
}
