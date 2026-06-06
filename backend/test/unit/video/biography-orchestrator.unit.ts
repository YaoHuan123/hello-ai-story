/**
 * 传记成片编排 smoke：创建任务 + step-10 stub（不跑 LLM 后续步）。
 * 用法：npm run build && npm run test:video:orchestrator
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { createInterview } from "../../../src/services/interviewWorkspace.service";
import { createUserWorkspace } from "../../../src/services/workspace.service";
import type { AnsweredSection } from "../../../src/topic/types";
import { runTextPipeline } from "../../../dist/text/orchestrator/runTextPipeline.js";
import {
  createBiographyVideoTask,
  runBiographyVideoPipeline,
} from "../../../dist/video/biography/orchestrator/runBiographyVideoPipeline.js";
import { SECTIONS_SNAPSHOT_FILE } from "../../../dist/video/shared/orchestrator/videoTaskWorkspace.js";
import { MATERIAL_COMBINED_POLISHED_FILE } from "../../../dist/video/shared/constants/prepFilenames.js";

loadEnv();
process.env.TEXT_ARTICLE_STUB = "1";
process.env.VIDEO_INPUT_STUB = "1";

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
  const userId = `video-orch-test-${Date.now()}`;
  createUserWorkspace(userId);
  const interview = createInterview(userId, { title: "编排测试" });
  const scope = { userId, interviewId: interview.id };
  seedCommittedSections(scope, FIXTURE);

  await runTextPipeline(scope, { createTask: true, mode: "stub", sections: FIXTURE });

  const handle = createBiographyVideoTask(scope);
  check("create task meta", fs.existsSync(handle.paths.metaPath));

  const result = await runBiographyVideoPipeline(scope, {
    taskId: handle.taskId,
    polishMode: "stub",
    throughStep: "10",
  });

  check("pipeline success", result.status === "success");
  check("step-10 in results", result.stepResults.some((r) => r.stepId === "10"));

  const snapshotPath = path.join(handle.paths.inputDir, SECTIONS_SNAPSHOT_FILE);
  const polishedPath = path.join(handle.paths.inputDir, MATERIAL_COMBINED_POLISHED_FILE);
  check("sections snapshot written", fs.existsSync(snapshotPath));
  check("polished input written", fs.existsSync(polishedPath));

  if (failed > 0) {
    console.error(`\ntest:video:orchestrator FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:video:orchestrator OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
