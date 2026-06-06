import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import { VIDEO_OUTPUT_DIR } from "../biography/constants/pipelineFilenames.js";
import { MERGED_VIDEO_REL } from "../studio/constants/studioFilenames.js";
import { VIDEO_POSTER_JPEG_FILENAME } from "../shared/constants/mediaFilenames.js";
import { ensurePosterJpegBesideMergedMp4, posterJpegAbsBesideMergedVideo } from "../shared/render/mergedVideoPoster.js";
import { openVideoTask, readVideoTaskMeta } from "../shared/orchestrator/videoTaskWorkspace.js";
import { resolveVideoArtifactAbsPath } from "./videoTaskArtifacts.js";

export const VIDEO_POSTER_REL = `${VIDEO_OUTPUT_DIR}/${VIDEO_POSTER_JPEG_FILENAME}`;

/** 成片存在且可生成/读取 poster 时返回绝对路径；否则 null。 */
export function resolveVideoTaskCoverAbs(scope: InterviewScope, taskId: string): string | null {
  const handle = openVideoTask(scope, taskId);
  const meta = readVideoTaskMeta(handle.paths);
  if (!meta || meta.status !== "success") {
    return null;
  }

  let mergedAbs: string;
  try {
    mergedAbs = resolveVideoArtifactAbsPath(handle.paths.taskRoot, MERGED_VIDEO_REL);
  } catch {
    return null;
  }
  if (!fs.existsSync(mergedAbs) || !fs.statSync(mergedAbs).isFile()) {
    return null;
  }

  const posterAbs = posterJpegAbsBesideMergedVideo(mergedAbs);
  if (!fs.existsSync(posterAbs) || !fs.statSync(posterAbs).isFile()) {
    try {
      ensurePosterJpegBesideMergedMp4(mergedAbs);
    } catch {
      return null;
    }
  }
  return fs.existsSync(posterAbs) && fs.statSync(posterAbs).isFile() ? posterAbs : null;
}

export function openVideoTaskCoverFile(
  scope: InterviewScope,
  taskId: string,
): { absPath: string; mimeType: string; filename: string } {
  const abs = resolveVideoTaskCoverAbs(scope, taskId);
  if (!abs) {
    throw new Error("VIDEO_COVER_NOT_FOUND: 成片封面尚未生成");
  }
  return { absPath: abs, mimeType: "image/jpeg", filename: VIDEO_POSTER_JPEG_FILENAME };
}
