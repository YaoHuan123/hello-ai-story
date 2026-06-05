/**
 * 成片任务查询：listVideoTasks / getVideoTaskProgress。
 */
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { createInterview } from "../../../src/services/interviewWorkspace.service";
import { createUserWorkspace } from "../../../src/services/workspace.service";
import type { AnsweredSection } from "../../../src/topic/types";
import { createStudioVideoTask } from "../../../dist/video/studio/orchestrator/runStudioVideoPipeline.js";
import {
  getVideoTaskProgress,
  listVideoTasks,
} from "../../../dist/video/worker/videoTaskQuery.js";
import { scheduleStudioVideoTask } from "../../../dist/video/worker/videoTaskScheduler.js";
import { runVideoWorkerOnce } from "../../../dist/video/worker/videoTaskWorker.js";

loadEnv();
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
  const userId = `video-query-test-${Date.now()}`;
  createUserWorkspace(userId);
  const interview = createInterview(userId, { title: "query测试" });
  const scope = { userId, interviewId: interview.id };
  seedCommittedSections(scope, FIXTURE);

  const pending = createStudioVideoTask(scope);
  check("list empty-ish: only pending task", listVideoTasks(scope).length === 1);

  const pendingProgress = getVideoTaskProgress(scope, pending.taskId);
  check("pending meta status", pendingProgress.status === "pending");
  check("pending has no queue", pendingProgress.queue === null);

  const scheduled = scheduleStudioVideoTask(scope, {
    hostVoice: "stub-host",
    guestVoice: "stub-guest",
    polishMode: "stub",
    throughStep: "iv_script",
  });

  const listed = listVideoTasks(scope);
  check("list includes scheduled task", listed.some((t) => t.taskId === scheduled.videoTaskId));
  check("list sorted desc", listed[0]?.taskId === scheduled.videoTaskId);

  const queuedProgress = getVideoTaskProgress(scope, scheduled.videoTaskId);
  check("queued meta status", queuedProgress.status === "queued");
  check("queued queue status", queuedProgress.queue?.status === "queued");
  check("queue kind studio", queuedProgress.queue?.kind === "create_video_studio");

  await runVideoWorkerOnce();

  const doneProgress = getVideoTaskProgress(scope, scheduled.videoTaskId);
  check("success meta status", doneProgress.status === "success");
  check("success queue status", doneProgress.queue?.status === "success");
  check("completedSteps non-empty", (doneProgress.completedSteps?.length ?? 0) > 0);

  if (failed > 0) {
    console.error(`\ntest:video:query FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:video:query OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
