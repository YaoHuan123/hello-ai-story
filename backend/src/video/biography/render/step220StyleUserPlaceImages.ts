import path from "node:path";
import { readJsonObjectFile, writeJsonAtomic, isoNow } from "../../shared/orchestrator/pipelineDisk.js";
import type { VideoTaskPaths } from "../../shared/orchestrator/videoTaskWorkspace.js";

/** 步骤 220：用户实景图风格化（hello story2 暂无素材墙，无索引时跳过）。 */
export async function runStyleUserPlaceImagesOptional(paths: VideoTaskPaths): Promise<{
  stepId: "220";
  skipped: boolean;
  savedAt: string;
  reason?: string;
}> {
  const savedAt = isoNow();
  const indexPath = path.join(paths.pipelineDir, "experiment-place-styled-images.json");
  const raw = readJsonObjectFile(indexPath);
  const items = raw.items;
  if (!Array.isArray(items) || items.length === 0) {
    writeJsonAtomic(indexPath, {
      savedAt,
      skipped: true,
      reason: "NO_PLACE_IMAGES",
      items: [],
    });
    return { stepId: "220", skipped: true, savedAt, reason: "NO_PLACE_IMAGES" };
  }
  return { stepId: "220", skipped: true, savedAt, reason: "NOT_IMPLEMENTED" };
}
