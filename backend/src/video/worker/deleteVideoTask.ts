import type { InterviewScope } from "../../services/interviewWorkspace.service";
import {
  getVideoTaskPaths,
  openVideoTask,
  readVideoTaskMeta,
  writeVideoTaskMeta,
} from "../shared/orchestrator/videoTaskWorkspace.js";
import { writeVideoTaskDeletedMarker } from "./videoTaskRequest.js";

/**
 * 标记成片任务为已删除（写 `.deleted`）；物理目录由 worker 异步清理。
 * 生成中也可删除：worker 心跳检测到标记后会中止并清目录。
 */
export function deleteVideoTask(scope: InterviewScope, videoTaskId: string): void {
  const handle = openVideoTask(scope, videoTaskId);
  const meta = readVideoTaskMeta(handle.paths);
  if (!meta) {
    throw new Error(`VIDEO_TASK_NOT_FOUND: 成片任务「${videoTaskId}」不存在或 meta 无效`);
  }

  const deletedAt = new Date().toISOString();
  writeVideoTaskMeta(handle.paths, {
    ...meta,
    deletedAt,
    updatedAt: deletedAt,
  });
  writeVideoTaskDeletedMarker(scope, videoTaskId);
}
