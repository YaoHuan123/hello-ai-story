/**
 * 跑 shared prep（真实 LLM，默认至 step-80），trace 落盘 taskRoot/trace/llm/。
 *
 * 用法：
 *   npm run build && npm run test:video:step80
 *   npm run test:video:step10
 *   npx ts-node .../video-prep-trace.integration.ts 60
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { setupUserWithInterview } from "../../fixtures/interviewScope";
import { videoDemoSections } from "../../fixtures/sections.videoDemo";
import {
  createBiographyVideoTask,
  runBiographyVideoPipeline,
} from "../../../dist/video/biography/orchestrator/runBiographyVideoPipeline.js";
import { PIPELINE_SUBDIR } from "../../../dist/video/shared/constants/prepFilenames.js";
import { VIDEO_PREP_STEPS } from "../../../dist/video/shared/constants/prepStepIds.js";
import { VIDEO_LLM_TRACE_SUBDIR } from "../../../dist/video/shared/llm/videoLlmTrace.js";

loadEnv();
process.env.VIDEO_LLM_TRACE = "on";

const throughStep = (process.argv[2] ?? process.env.VIDEO_PREP_THROUGH_STEP ?? "80").trim();
const verbose = process.argv.includes("--verbose") || process.env.VIDEO_PREP_TRACE_VERBOSE === "1";

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY");
    process.exit(0);
  }

  const scope = setupUserWithInterview(`video-prep-${throughStep}-${Date.now()}`, {
    title: `prep至step${throughStep}`,
  });
  seedCommittedSections(scope, videoDemoSections());
  const handle = createBiographyVideoTask(scope);

  console.log(`\n=== 跑 prep 10→${throughStep}（LLM + trace）===`);
  console.log("  taskRoot:", handle.paths.taskRoot);

  const startedAt = Date.now();
  const result = await runBiographyVideoPipeline(scope, {
    taskId: handle.taskId,
    polishMode: "llm",
    throughStep: throughStep as typeof VIDEO_PREP_STEPS.POLISH,
    onStepComplete: (r) => {
      const out = "outputRelativePath" in r ? r.outputRelativePath : undefined;
      console.log(`  [step ${r.stepId}] skipped=${r.skipped}${out ? ` → ${out}` : ""}`);
    },
  });

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  const traceDir = path.join(handle.paths.taskRoot, VIDEO_LLM_TRACE_SUBDIR);
  const pipelineDir = path.join(handle.paths.taskRoot, PIPELINE_SUBDIR);

  console.log("\n=== 结果 ===");
  console.log("  status:", result.status);
  console.log("  耗时:", `${elapsedSec}s`);
  console.log("  traceDir:", traceDir);
  console.log("  pipelineDir:", pipelineDir);

  if (fs.existsSync(pipelineDir)) {
    const pipelineFiles = fs.readdirSync(pipelineDir).filter((f) => f.endsWith(".json")).sort();
    console.log("  pipeline 产物:", pipelineFiles.join(", ") || "(无)");
  }

  if (!fs.existsSync(traceDir)) {
    console.warn("  无 trace 目录");
    process.exit(result.status === "success" ? 0 : 1);
  }

  const files = fs.readdirSync(traceDir).sort();
  const llmCalls = files.filter((f) => f.endsWith("-input.json")).length;
  console.log(`  LLM 调用次数: ${llmCalls}`);

  const manifestPath = path.join(traceDir, "manifest.jsonl");
  if (fs.existsSync(manifestPath)) {
    console.log("\n--- manifest.jsonl ---");
    console.log(fs.readFileSync(manifestPath, "utf-8").trimEnd());
  }

  if (verbose) {
    for (const name of files.filter((f) => f.endsWith("-input.json") || f.endsWith("-output.json"))) {
      console.log(`\n--- ${name} ---`);
      console.log(fs.readFileSync(path.join(traceDir, name), "utf-8"));
    }
  } else {
    console.log("\n  查看单次 LLM I/O：打开 trace/llm/ 下 *-input.json / *-output.json");
    console.log("  打印全部：VIDEO_PREP_TRACE_VERBOSE=1 npm run test:video:step80");
  }

  if (result.status !== "success") process.exit(1);
}

main().catch((e) => {
  console.error(e);
  console.error("\n失败后可 inspect taskRoot 下 pipeline/ 与 trace/llm/");
  process.exit(1);
});
