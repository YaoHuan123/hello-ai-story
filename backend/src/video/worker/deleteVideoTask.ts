import fs from "node:fs";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import { openVideoTask, readVideoTaskMeta } from "../shared/orchestrator/videoTaskWorkspace.js";
import {
  isFreshVideoQueueHeartbeat,
  readVideoQueueTask,
  videoQueueTaskPath,
} from "./videoTaskQueue.js";

/** 删除成片任务目录及对应队列文件；正在生成时不可删。 */
export function deleteVideoTask(scope: InterviewScope, videoTaskId: string): void {
  const handle = openVideoTask(scope, videoTaskId);
  const meta = readVideoTaskMeta(handle.paths);
  if (!meta) {
    throw new Error(`VIDEO_TASK_NOT_FOUND: 成片任务「${videoTaskId}」不存在或 meta 无效`);
  }

  const queue = readVideoQueueTask(scope, videoTaskId);
  const queueRunning =
    queue?.status === "running" && isFreshVideoQueueHeartbeat(queue.heartbeatAt);
  if (meta.status === "running" || queueRunning) {
    throw new Error("VIDEO_TASK_DELETE_BUSY: 视频正在生成，请稍后再删");
  }

  const queuePath = videoQueueTaskPath(scope, videoTaskId);
  if (fs.existsSync(queuePath)) {
    fs.unlinkSync(queuePath);
  }
  if (fs.existsSync(handle.paths.taskRoot)) {
    fs.rmSync(handle.paths.taskRoot, { recursive: true, force: true });
  }
}
