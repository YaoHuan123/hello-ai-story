/**
 * 演播室成片编排 smoke：shared prep stub + iv_script stub。
 * 用法：npm run build && npm run test:video:studio
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { resolveVideoTestLocale } from "../../fixtures/interviewScope";
import { createInterview } from "../../../src/services/interviewWorkspace.service";
import { createUserWorkspace } from "../../../src/services/workspace.service";
import { testUserId } from "../../helpers/testAccount";
import type { AnsweredSection } from "../../../src/topic/types";
import { runTextPipeline } from "../../../dist/text/orchestrator/runTextPipeline.js";
import { createStudioVideoTask, runStudioVideoPipeline } from "../../../dist/video/studio/orchestrator/runStudioVideoPipeline.js";
import { SECTIONS_SNAPSHOT_FILE } from "../../../dist/video/shared/orchestrator/videoTaskWorkspace.js";
import { STUDIO_SCRIPT_FILE } from "../../../dist/video/studio/constants/studioFilenames.js";

loadEnv();
process.env.TEXT_ARTICLE_STUB = "1";
process.env.STUDIO_SCRIPT_STUB = "1";
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
  const userId = testUserId("video-studio");
  createUserWorkspace(userId);
  const interview = createInterview(userId, { title: "演播室测试", locale: resolveVideoTestLocale() });
  const scope = { userId, interviewId: interview.id };
  seedCommittedSections(scope, FIXTURE);

  await runTextPipeline(scope, { createTask: true, mode: "stub", sections: FIXTURE });

  const voicesOk = Boolean(
    (process.env.TTS_VOICE_ZH_MALE ?? process.env.VIDEO_DEMO_TTS_VOICE ?? "").trim() &&
      (process.env.TTS_VOICE_ZH_FEMALE ?? process.env.VIDEO_DEMO_HOST_VOICE ?? "").trim(),
  );
  if (!voicesOk) {
    console.warn("[SKIP] 未配置 TTS_VOICE_ZH_MALE / TTS_VOICE_ZH_FEMALE（iv_tts 需合法 zh_/en_ 音色）。");
    process.exit(0);
  }

  const handle = createStudioVideoTask(scope);
  check("create studio task meta", fs.existsSync(handle.paths.metaPath));

  const result = await runStudioVideoPipeline(scope, {
    taskId: handle.taskId,
    polishMode: "stub",
    throughStep: "iv_duration_align",
  });

  check("pipeline success", result.status === "success");
  check("step-10 in results", result.stepResults.some((r) => r.stepId === "10"));
  check("step-80 in results", result.stepResults.some((r) => r.stepId === "80"));
  check("no era prep steps", !result.stepResults.some((r) => ["20", "30", "40", "50"].includes(r.stepId)));
  check("iv_script in results", result.stepResults.some((r) => r.stepId === "iv_script"));
  check("iv_tts in results", result.stepResults.some((r) => r.stepId === "iv_tts"));
  check("iv_duration_align in results", result.stepResults.some((r) => r.stepId === "iv_duration_align"));

  const snapshotPath = path.join(handle.paths.inputDir, SECTIONS_SNAPSHOT_FILE);
  const scriptPath = path.join(handle.paths.pipelineDir, "interview-studio", STUDIO_SCRIPT_FILE);
  const audioPath = path.join(handle.paths.pipelineDir, "interview-studio", "interview-audio", "turn-0000.mp3");
  check("sections snapshot written", fs.existsSync(snapshotPath));
  check("studio script written", fs.existsSync(scriptPath));
  check("studio turn audio under pipeline/", fs.existsSync(audioPath));

  if (failed > 0) {
    console.error(`\ntest:video:studio FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:video:studio OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
