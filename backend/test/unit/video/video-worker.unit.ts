/**
 * 视频 worker smoke：schedule → worker once（stub 模式）。
 */
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { createInterview } from "../../../src/services/interviewWorkspace.service";
import { createUserWorkspace } from "../../../src/services/workspace.service";
import { testUserId } from "../../helpers/testAccount";
import type { AnsweredSection } from "../../../src/topic/types";
import { runTextPipeline } from "../../../dist/text/orchestrator/runTextPipeline.js";
import { readVideoTaskMeta, getVideoTaskPaths } from "../../../dist/video/shared/orchestrator/videoTaskWorkspace.js";
import { readVideoTaskRequest } from "../../../dist/video/worker/videoTaskRequest.js";
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
  const userId = testUserId("video-worker");
  createUserWorkspace(userId);
  const interview = createInterview(userId, { title: "worker测试" });
  const scope = { userId, interviewId: interview.id };
  seedCommittedSections(scope, FIXTURE);
  await runTextPipeline(scope, { createTask: true, mode: "stub", sections: FIXTURE });

  const scheduled = scheduleStudioVideoTask(scope, {
    polishMode: "stub",
    throughStep: "iv_script",
  });

  check("scheduled status queued", scheduled.status === "queued");

  const request = readVideoTaskRequest(scope, scheduled.videoTaskId);
  check("request.json written", request?.kind === "create_video_studio");

  const workerResult = await runVideoWorkerOnce();
  check("worker processed task", workerResult.processed === true);
  check("worker matched task id", workerResult.taskId === scheduled.videoTaskId);

  const meta = readVideoTaskMeta(getVideoTaskPaths(scope, scheduled.videoTaskId));
  check("video meta success", meta?.status === "success");

  if (failed > 0) {
    console.error(`\ntest:video:worker FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:video:worker OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
