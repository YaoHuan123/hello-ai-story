import fs from "node:fs";
import path from "node:path";
import {
  mergeVideoClipsToFullVideo,
  parseVideoClipIndexesFromPipeline,
} from "../../biography/render/step260MergeVideoClips.js";
import { readJsonObjectFile } from "../../shared/orchestrator/pipelineDisk.js";
import type { VideoTaskPaths } from "../../shared/orchestrator/videoTaskWorkspace.js";
import { ensurePosterJpegBesideMergedMp4 } from "../../shared/render/mergedVideoPoster.js";
import { MERGED_VIDEO_REL, studioClipIndexRel } from "../constants/studioFilenames.js";

const ERR = "INTERVIEW_STUDIO_MERGE_INVALID";

export function runStudioMergeStep(paths: VideoTaskPaths): Promise<{
  mergedVideoRelativePath: string;
  mergedVideoFilePath: string;
  clipCount: number;
}> {
  const clipIndexRel = studioClipIndexRel();
  const clipIndexAbs = path.join(paths.taskRoot, clipIndexRel.split("/").join(path.sep));
  const raw = readJsonObjectFile(clipIndexAbs);
  const clips = parseVideoClipIndexesFromPipeline(raw);
  if (clips.length === 0) {
    throw new Error(`${ERR}: 无访谈视频片段可合并`);
  }

  const r = mergeVideoClipsToFullVideo({
    workspaceRoot: paths.taskRoot,
    clips,
    outputVideoRelativePath: MERGED_VIDEO_REL,
  });

  try {
    fs.unlinkSync(r.concatListPath);
  } catch {
    /* ignore */
  }

  const mergedVideoFilePath = path.join(paths.taskRoot, MERGED_VIDEO_REL.split("/").join(path.sep));
  try {
    ensurePosterJpegBesideMergedMp4(mergedVideoFilePath);
  } catch {
    /* 封面失败不阻断成片 */
  }
  return Promise.resolve({
    mergedVideoRelativePath: MERGED_VIDEO_REL,
    mergedVideoFilePath,
    clipCount: clips.length,
  });
}
