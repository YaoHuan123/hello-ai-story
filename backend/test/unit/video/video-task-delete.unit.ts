/**
 * 成片删除 tombstone：API 打标 → worker 清目录。
 */
import fs from "node:fs";
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { createInterview } from "../../../src/services/interviewWorkspace.service";
import { createUserWorkspace } from "../../../src/services/workspace.service";
import { testUserId } from "../../helpers/testAccount";
import type { AnsweredSection } from "../../../src/topic/types";
import { runTextPipeline } from "../../../dist/text/orchestrator/runTextPipeline.js";
import { getVideoTaskPaths } from "../../../dist/video/shared/orchestrator/videoTaskWorkspace.js";
import { deleteVideoTask } from "../../../dist/video/worker/deleteVideoTask.js";
import {
  getVideoTaskProgress,
  listVideoTasks,
} from "../../../dist/video/worker/videoTaskQuery.js";
import { scheduleStudioVideoTask } from "../../../dist/video/worker/videoTaskScheduler.js";
import { runVideoWorkerOnce } from "../../../dist/video/worker/videoTaskWorker.js";

loadEnv();
process.env.TEXT_ARTICLE_STUB = "1";
process.env.VIDEO_INPUT_STUB = "1";
process.env.STUDIO_SCRIPT_STUB = "1";

const FIXTURE: AnsweredSection[] = [
  {
    name: "基本档案",
    qa: [
      { q: "您怎么称呼？", a: "测试用户" },
      { q: "哪年出生？", a: "1960年" },
    ],
  },
];

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  [ok] ${label}`);
  } else {
    failed += 1;
    const extra = detail !== undefined ? ` | ${JSON.stringify(detail)}` : "";
    console.error(`  [FAIL] ${label}${extra}`);
  }
}

async function main() {
  const userId = testUserId("video-delete");
  createUserWorkspace(userId);
  const interview = createInterview(userId, { title: "delete测试" });
  const scope = { userId, interviewId: interview.id };
  seedCommittedSections(scope, FIXTURE);
  await runTextPipeline(scope, { createTask: true, mode: "stub", sections: FIXTURE });

  const scheduled = scheduleStudioVideoTask(scope, { polishMode: "stub", throughStep: "iv_script" });
  const paths = getVideoTaskPaths(scope, scheduled.videoTaskId);
  check("task dir exists", fs.existsSync(paths.taskRoot));

  deleteVideoTask(scope, scheduled.videoTaskId);
  check("deleted marker exists", fs.existsSync(paths.taskRoot + "/.deleted"));

  let progressErr = "";
  try {
    getVideoTaskProgress(scope, scheduled.videoTaskId);
  } catch (e) {
    progressErr = e instanceof Error ? e.message : String(e);
  }
  check("progress 404 after delete", progressErr.includes("VIDEO_TASK_NOT_FOUND"));
  check("list excludes deleted", !listVideoTasks(scope).some((t) => t.taskId === scheduled.videoTaskId));

  await runVideoWorkerOnce();
  check("worker purged task dir", !fs.existsSync(paths.taskRoot));

  if (failed > 0) {
    console.error(`\ntest:video:delete FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:video:delete OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
