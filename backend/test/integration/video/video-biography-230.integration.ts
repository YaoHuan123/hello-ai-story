/**
 * 传记成片集成测试：5 节假素材 → step 10–230（真实 LLM + step 180 TTS）。
 *
 * 默认：若存在 test/fixtures/video-bio-through-140/ seed，则从 step 150 续跑（跳过 10–140）。
 * 全程：VIDEO_BIO_FULL=1 npm run test:video:biography:230
 * 导出 seed：node scripts/export-video-bio-seed.mjs <taskRoot>
 *
 * 前置：backend/.env 配 OPENAI_API_KEY、VIDEO_DEMO_TTS_VOICE；TTS 需 TTS_API_KEY 或同网关 OPENAI_API_KEY。
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { resolveVideoTestLocale, setupUserWithInterview } from "../../fixtures/interviewScope";
import { videoDemoSections } from "../../fixtures/sections.videoDemo";
import { runTextPipeline } from "../../../dist/text/orchestrator/runTextPipeline.js";
import {
  createBiographyVideoTask,
  runBiographyVideoPipeline,
} from "../../../dist/video/biography/orchestrator/runBiographyVideoPipeline.js";
import {
  AUDIO_OUTPUT_DIR,
  PIPELINE_AUDIO_SCENE_RELATION_FILE,
  PIPELINE_GEO_SIGNAGE_REFERENCE_FILE,
  PIPELINE_MERGE_ENV_ERA_FILE,
  PIPELINE_PHASE_REPLACE_FILE,
} from "../../../dist/video/biography/constants/pipelineFilenames.js";
import { PIPELINE_SEGMENT_REFINE_FILE } from "../../../dist/video/shared/constants/prepFilenames.js";
import {
  readVideoTaskMeta,
  writeVideoTaskMeta,
  type VideoTaskMeta,
} from "../../../dist/video/shared/orchestrator/videoTaskWorkspace.js";
import {
  VIDEO_BIO_DEFAULT_FROM_STEP,
  completedStepsBefore,
  copyVideoBioSeedToTask,
  isVideoBioSeedReady,
  resolveVideoBioSeedRoot,
} from "./videoBioPipelineSeed";

loadEnv();

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

function hasTtsCredentials(): boolean {
  const tts = (process.env.TTS_API_KEY ?? "").trim();
  const openai = (process.env.OPENAI_API_KEY ?? "").trim();
  return Boolean(tts || openai);
}

function countMp3InDir(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countMp3InDir(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".mp3")) count += 1;
  }
  return count;
}

function wantFullRun(): boolean {
  const v = (process.env.VIDEO_BIO_FULL ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function resolveFromStep(useSeed: boolean): string | undefined {
  const env = (process.env.VIDEO_BIO_FROM_STEP ?? "").trim();
  if (env) return env;
  if (useSeed) return VIDEO_BIO_DEFAULT_FROM_STEP;
  return undefined;
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，传记 10→230 集成测试需真实 LLM。");
    process.exit(0);
  }

  const ttsVoice = (process.env.VIDEO_DEMO_TTS_VOICE ?? "").trim();
  if (!ttsVoice) {
    console.warn("[SKIP] 未配置 VIDEO_DEMO_TTS_VOICE（step 180 旁白音色，须显式传入）。");
    process.exit(0);
  }

  if (!hasTtsCredentials()) {
    console.warn("[SKIP] 未配置 TTS_API_KEY 或 OPENAI_API_KEY，step 180 无法合成音频。");
    process.exit(0);
  }

  delete process.env.VIDEO_INPUT_STUB;
  delete process.env.VIDEO_PREP_STUB;

  const seedRoot = resolveVideoBioSeedRoot();
  const useSeed = !wantFullRun() && isVideoBioSeedReady(seedRoot);
  const fromStep = resolveFromStep(useSeed);

  const userId = `video-bio-230-${Date.now()}`;
  const scope = setupUserWithInterview(userId, {
    title: "传记230集成测试",
    locale: resolveVideoTestLocale(),
  });
  seedCommittedSections(scope, videoDemoSections());

  console.log("\n=== 假素材（5 节）===");
  console.log(JSON.stringify(videoDemoSections().map((s) => s.name), null, 2));

  if (!useSeed) {
    console.log("\n=== 生成故事文本（文本流水线）===");
    const textResult = await runTextPipeline(scope, {
      createTask: true,
      mode: "llm",
      sections: videoDemoSections(),
    });
    if (textResult.status !== "success") {
      throw new Error(`TEXT_PIPELINE_FAILED: ${textResult.status}`);
    }
    console.log(`  textTaskId=${textResult.taskId}`);
  }

  const handle = createBiographyVideoTask(scope);
  console.log(`\n=== 任务 taskId=${handle.taskId} ===`);
  console.log(`  taskRoot: ${handle.paths.taskRoot}`);

  if (useSeed && fromStep) {
    console.log(`\n=== 使用 seed（through 140）从 step ${fromStep} 续跑 ===`);
    console.log(`  seed: ${seedRoot}`);
    copyVideoBioSeedToTask(handle.paths.taskRoot, seedRoot);
    const meta = readVideoTaskMeta(handle.paths);
    if (meta) {
      const next: VideoTaskMeta = {
        ...meta,
        status: "pending",
        completedSteps: completedStepsBefore(fromStep),
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      };
      writeVideoTaskMeta(handle.paths, next);
    }
    check("seed step-140 产物存在", fs.existsSync(path.join(handle.paths.pipelineDir, PIPELINE_PHASE_REPLACE_FILE)));
  } else if (!wantFullRun()) {
    console.log("\n=== 无 seed，跑全程 10→230（导出 seed: node scripts/export-video-bio-seed.mjs <taskRoot>）===");
  } else {
    console.log("\n=== VIDEO_BIO_FULL=1，跑全程 10→230 ===");
  }

  const startedAt = Date.now();
  let result: Awaited<ReturnType<typeof runBiographyVideoPipeline>>;
  try {
    result = await runBiographyVideoPipeline(scope, {
      taskId: handle.taskId,
      polishMode: useSeed ? undefined : "llm",
      throughStep: "230",
      fromStep: fromStep as "150" | undefined,
      ttsVoice,
      onStepComplete: (r) => {
        const out = "outputRelativePath" in r ? r.outputRelativePath : undefined;
        console.log(`  [step ${r.stepId}] skipped=${r.skipped}${out ? ` → ${out}` : ""}`);
      },
    });
  } catch (err) {
    console.error("\n流水线失败，可 inspect：", handle.paths.taskRoot);
    throw err;
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n=== 完成，耗时 ${elapsedSec}s ===`);

  if (process.env.VIDEO_BIO_EXPORT_SEED === "1" && !useSeed) {
    console.log("\n提示：导出 seed 供下次续跑：");
    console.log(`  node scripts/export-video-bio-seed.mjs ${handle.paths.taskRoot}`);
  }

  const meta = readVideoTaskMeta(handle.paths);
  const pipelineDir = handle.paths.pipelineDir;

  check("pipeline status success", result.status === "success", result.status);
  check("meta status success", meta?.status === "success", meta?.status);
  check("completedSteps 含 230", meta?.completedSteps.includes("230") ?? false, meta?.completedSteps);
  check("completedSteps 不含 240", !(meta?.completedSteps.includes("240") ?? false), meta?.completedSteps);

  if (!useSeed) {
    const step80 = path.join(pipelineDir, PIPELINE_SEGMENT_REFINE_FILE);
    check("step-80 产物存在", fs.existsSync(step80));
  }

  const step150 = path.join(pipelineDir, PIPELINE_MERGE_ENV_ERA_FILE);
  check("step-150 产物存在", fs.existsSync(step150));

  const step180 = path.join(pipelineDir, PIPELINE_AUDIO_SCENE_RELATION_FILE);
  check("step-180 产物存在", fs.existsSync(step180));
  const audioDir = path.join(handle.paths.taskRoot, AUDIO_OUTPUT_DIR);
  const mp3Count = countMp3InDir(audioDir);
  check("step-180 至少 1 个 mp3", mp3Count >= 1, { mp3Count, audioDir });

  const step230 = path.join(pipelineDir, PIPELINE_GEO_SIGNAGE_REFERENCE_FILE);
  check("step-230 产物存在", fs.existsSync(step230));

  if (failed > 0) {
    console.error(`\ntest:video:biography:230 FAILED (${passed} ok, ${failed} fail)`);
    console.error(`  inspect: ${handle.paths.taskRoot}`);
    process.exit(1);
  }
  console.log(`\ntest:video:biography:230 OK (${passed} checks)`);
  console.log(`  inspect: ${handle.paths.taskRoot}`);
  if (!useSeed) {
    console.log(`  导出 seed: node scripts/export-video-bio-seed.mjs ${handle.paths.taskRoot}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
