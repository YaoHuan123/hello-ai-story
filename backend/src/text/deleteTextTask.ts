import fs from "node:fs";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { openTextTask, readTextTaskMeta } from "./orchestrator/textTaskWorkspace.js";

/** 删除文本任务目录；生成中不可删。 */
export function deleteTextTask(scope: InterviewScope, taskId: string): void {
  const handle = openTextTask(scope, taskId);
  const meta = readTextTaskMeta(handle.paths);
  if (!meta) {
    throw new Error(`TEXT_TASK_NOT_FOUND: 文本任务「${taskId}」不存在或 meta 无效`);
  }
  if (meta.status === "running") {
    throw new Error("TEXT_TASK_DELETE_BUSY: 故事文本正在生成，请稍后再删");
  }
  if (fs.existsSync(handle.paths.taskRoot)) {
    fs.rmSync(handle.paths.taskRoot, { recursive: true, force: true });
  }
}
