/**
 * 成片 pipeline run-summary trace smoke。
 * 用法：npm run build && npm run test:video:pipeline-trace
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  VIDEO_PIPELINE_RUN_SUMMARY_REL,
  VideoPipelineRunTracer,
} from "../../../dist/video/shared/orchestrator/videoPipelineTrace.js";

async function main(): Promise<void> {
  const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "video-pipeline-trace-"));
  process.env.VIDEO_PIPELINE_TRACE = "on";

  const tracer = new VideoPipelineRunTracer(taskRoot, "task-test");
  await tracer.runStep("10", async () => ({
    stepId: "10",
    skipped: false,
    savedAt: new Date().toISOString(),
  }));
  try {
    await tracer.runStep("120", async () => {
      throw new Error("ENV_SCENE_EMBELLISH_120_INVALID: parse failed");
    });
  } catch {
    /* expected */
  }

  const summaryPath = path.join(taskRoot, VIDEO_PIPELINE_RUN_SUMMARY_REL);
  assert.ok(fs.existsSync(summaryPath));
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8")) as {
    status: string;
    failedStepId?: string;
    steps: Array<{ stepId: string; ok: boolean }>;
  };
  assert.equal(summary.status, "failed");
  assert.equal(summary.failedStepId, "120");
  assert.equal(summary.steps.length, 2);
  assert.equal(summary.steps[1]?.ok, false);

  fs.rmSync(taskRoot, { recursive: true, force: true });
  console.log("test:video:pipeline-trace OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
