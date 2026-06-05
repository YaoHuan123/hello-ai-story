/**
 * 非 stub 生产端到端验收：文本 LLM + 传记 seed 150→230 + 演播室 seed iv_tts。
 *
 * 可选：`E2E_VIDEO_RENDER=1` 追加传记 240→260（文生图 + ffmpeg，耗时长、费用高）。
 *
 * 用法：
 *   npm run build
 *   npm run test:e2e:acceptance
 *
 * 环境（backend/.env）：
 *   OPENAI_*、TTS_API_KEY、VIDEO_DEMO_TTS_VOICE、VIDEO_DEMO_HOST/GUEST_VOICE
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { setupUserWithInterview } from "../../fixtures/interviewScope";
import { videoDemoSections } from "../../fixtures/sections.videoDemo";
import { runTextPipeline, createTextTask } from "../../../dist/text/orchestrator/runTextPipeline.js";
import { TEXT_ARTICLE_OUTPUT_FILE } from "../../../dist/text/constants/textFilenames.js";
import {
  createBiographyVideoTask,
  runBiographyVideoPipeline,
} from "../../../dist/video/biography/orchestrator/runBiographyVideoPipeline.js";
import {
  AUDIO_OUTPUT_DIR,
  PIPELINE_AUDIO_SCENE_RELATION_FILE,
  PIPELINE_GEO_SIGNAGE_REFERENCE_FILE,
  PIPELINE_MERGE_ENV_ERA_FILE,
} from "../../../dist/video/biography/constants/pipelineFilenames.js";
import {
  createStudioVideoTask,
  runStudioVideoPipeline,
} from "../../../dist/video/studio/orchestrator/runStudioVideoPipeline.js";
import {
  STUDIO_SCRIPT_REL,
  STUDIO_TTS_BUNDLE_REL,
  STUDIO_AUDIO_SUBDIR_REL,
} from "../../../dist/video/studio/constants/studioFilenames.js";
import {
  readVideoTaskMeta,
  writeVideoTaskMeta,
  getVideoTaskPaths,
  type VideoTaskMeta,
} from "../../../dist/video/shared/orchestrator/videoTaskWorkspace.js";
import {
  VIDEO_BIO_DEFAULT_FROM_STEP,
  completedStepsBefore,
  copyVideoBioSeedToTask,
  isVideoBioSeedReady,
  resolveVideoBioSeedRoot,
} from "../video/videoBioPipelineSeed";
import {
  VIDEO_STUDIO_DEFAULT_FROM_STEP,
  copyVideoStudioSeedToTask,
  isVideoStudioSeedReady,
  resolveVideoStudioSeedRoot,
  studioCompletedStepsBefore,
} from "../video/videoStudioPipelineSeed";
import { clearStubEnv, printPreflight, runE2ePreflight } from "./e2ePreflight";

loadEnv();
clearStubEnv();

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

function detectFfmpeg(): boolean {
  const bin = (process.env.FFMPEG_PATH ?? "ffmpeg").trim() || "ffmpeg";
  const r = spawnSync(bin, ["-version"], { encoding: "utf8", timeout: 10_000 });
  return r.status === 0;
}

function wantBioFull(): boolean {
  const v = (process.env.E2E_BIO_FULL ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function wantStudioFull(): boolean {
  const v = (process.env.E2E_STUDIO_FULL ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function wantVideoRender(): boolean {
  const v = (process.env.E2E_VIDEO_RENDER ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function phaseText(scope: ReturnType<typeof setupUserWithInterview>): Promise<void> {
  console.log("\n=== Phase 1：文本（LLM，非 stub）===");
  const handle = createTextTask(scope);
  const result = await runTextPipeline(scope, { taskId: handle.taskId, mode: "llm" });
  check("text pipeline success", result.status === "success", result.status);
  const articlePath = path.join(handle.paths.outputDir, TEXT_ARTICLE_OUTPUT_FILE);
  check("article file exists", fs.existsSync(articlePath));
  if (fs.existsSync(articlePath)) {
    const raw = JSON.parse(fs.readFileSync(articlePath, "utf-8")) as {
      article?: string;
      skippedModel?: boolean;
    };
    check("article non-empty", typeof raw.article === "string" && raw.article.trim().length > 200);
    check("skippedModel=false", raw.skippedModel === false, raw.skippedModel);
    console.log(`  文章长度：${raw.article?.length ?? 0} 字`);
  }
}

async function phaseBio230(scope: ReturnType<typeof setupUserWithInterview>): Promise<string> {
  console.log("\n=== Phase 2：传记成片 150→230（LLM + TTS，seed 续跑）===");
  const ttsVoice = (process.env.VIDEO_DEMO_TTS_VOICE ?? "").trim();
  const seedRoot = resolveVideoBioSeedRoot();
  const useSeed = !wantBioFull() && isVideoBioSeedReady(seedRoot);
  const fromStep = useSeed ? VIDEO_BIO_DEFAULT_FROM_STEP : undefined;

  const handle = createBiographyVideoTask(scope);
  console.log(`  taskRoot: ${handle.paths.taskRoot}`);

  if (useSeed && fromStep) {
    copyVideoBioSeedToTask(handle.paths.taskRoot, seedRoot);
    const meta = readVideoTaskMeta(handle.paths);
    if (meta) {
      writeVideoTaskMeta(handle.paths, {
        ...meta,
        status: "pending",
        completedSteps: completedStepsBefore(fromStep),
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      });
    }
  } else if (!wantBioFull()) {
    throw new Error("缺少 video-bio-through-140 seed；请设 E2E_BIO_FULL=1 或导出 seed");
  }

  const startedAt = Date.now();
  const result = await runBiographyVideoPipeline(scope, {
    taskId: handle.taskId,
    polishMode: useSeed ? undefined : "llm",
    throughStep: "230",
    fromStep: fromStep as "150" | undefined,
    ttsVoice,
    onStepComplete: (r) => {
      const out = "outputRelativePath" in r ? r.outputRelativePath : undefined;
      console.log(`  [step ${r.stepId}]${out ? ` → ${out}` : ""}`);
    },
  });
  console.log(`  耗时 ${Math.round((Date.now() - startedAt) / 1000)}s`);

  const meta = readVideoTaskMeta(handle.paths);
  check("bio status success", result.status === "success", result.status);
  check("bio meta success", meta?.status === "success", meta?.status);
  check("step-150 exists", fs.existsSync(path.join(handle.paths.pipelineDir, PIPELINE_MERGE_ENV_ERA_FILE)));
  check("step-180 exists", fs.existsSync(path.join(handle.paths.pipelineDir, PIPELINE_AUDIO_SCENE_RELATION_FILE)));
  check("step-230 exists", fs.existsSync(path.join(handle.paths.pipelineDir, PIPELINE_GEO_SIGNAGE_REFERENCE_FILE)));
  const mp3Count = countMp3InDir(path.join(handle.paths.taskRoot, AUDIO_OUTPUT_DIR));
  check("TTS mp3 >= 1", mp3Count >= 1, { mp3Count });

  return handle.taskId;
}

async function phaseBioRender260(
  scope: ReturnType<typeof setupUserWithInterview>,
  taskId: string,
): Promise<void> {
  console.log("\n=== Phase 2b：传记 240→260（文生图 + ffmpeg）===");
  const ttsVoice = (process.env.VIDEO_DEMO_TTS_VOICE ?? "").trim();
  const startedAt = Date.now();
  const result = await runBiographyVideoPipeline(scope, {
    taskId,
    throughStep: "260",
    fromStep: "240",
    ttsVoice,
    onStepComplete: (r) => {
      const out = "outputRelativePath" in r ? r.outputRelativePath : undefined;
      console.log(`  [step ${r.stepId}]${out ? ` → ${out}` : ""}`);
    },
  });
  console.log(`  耗时 ${Math.round((Date.now() - startedAt) / 1000)}s`);
  const meta = readVideoTaskMeta(getVideoTaskPaths(scope, taskId));
  check("bio render success", result.status === "success", result.status);
  check("completedSteps 含 260", meta?.completedSteps.includes("260") ?? false, meta?.completedSteps);
}

async function phaseStudioTts(scope: ReturnType<typeof setupUserWithInterview>): Promise<void> {
  console.log("\n=== Phase 3：演播室 iv_tts（TTS，seed 续跑）===");
  const hostVoice = (process.env.VIDEO_DEMO_HOST_VOICE ?? process.env.VIDEO_DEMO_TTS_VOICE ?? "").trim();
  const guestVoice = (process.env.VIDEO_DEMO_GUEST_VOICE ?? process.env.VIDEO_DEMO_TTS_VOICE ?? "").trim();
  const seedRoot = resolveVideoStudioSeedRoot();
  const useSeed = !wantStudioFull() && isVideoStudioSeedReady(seedRoot);
  const fromStep = useSeed ? VIDEO_STUDIO_DEFAULT_FROM_STEP : undefined;

  const handle = createStudioVideoTask(scope);
  console.log(`  taskRoot: ${handle.paths.taskRoot}`);

  if (useSeed && fromStep) {
    copyVideoStudioSeedToTask(handle.paths.taskRoot, seedRoot);
    const meta = readVideoTaskMeta(handle.paths);
    if (meta) {
      writeVideoTaskMeta(handle.paths, {
        ...meta,
        status: "pending",
        completedSteps: studioCompletedStepsBefore(fromStep),
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      });
    }
    check("seed iv_script exists", fs.existsSync(path.join(handle.paths.pipelineDir, STUDIO_SCRIPT_REL)));
  } else if (!wantStudioFull()) {
    throw new Error("缺少 video-studio-through-iv-script seed；请设 E2E_STUDIO_FULL=1");
  }

  const startedAt = Date.now();
  const result = await runStudioVideoPipeline(scope, {
    taskId: handle.taskId,
    polishMode: useSeed ? undefined : "llm",
    hostVoice,
    guestVoice,
    throughStep: "iv_tts",
    fromStep: fromStep as "iv_tts" | undefined,
    onStepComplete: (r) => {
      const out = "outputRelativePath" in r ? r.outputRelativePath : undefined;
      console.log(`  [step ${r.stepId}]${out ? ` → ${out}` : ""}`);
    },
  });
  console.log(`  耗时 ${Math.round((Date.now() - startedAt) / 1000)}s`);

  const meta = readVideoTaskMeta(handle.paths);
  const pipelineDir = handle.paths.pipelineDir;
  check("studio status success", result.status === "success", result.status);
  check("iv_tts bundle exists", fs.existsSync(path.join(pipelineDir, STUDIO_TTS_BUNDLE_REL)));
  const audioDir = path.join(pipelineDir, STUDIO_AUDIO_SUBDIR_REL.split("/").join(path.sep));
  const mp3Count = countMp3InDir(audioDir);
  check("studio mp3 >= 1", mp3Count >= 1, { mp3Count, audioDir });
  check("completedSteps 含 iv_tts", meta?.completedSteps.includes("iv_tts") ?? false, meta?.completedSteps);
}

async function main(): Promise<void> {
  if (detectFfmpeg()) process.env.E2E_FFMPEG_OK = "1";
  process.env.E2E_BIO_SEED_READY = isVideoBioSeedReady(resolveVideoBioSeedRoot()) || wantBioFull() ? "1" : "";
  process.env.E2E_STUDIO_SEED_READY =
    isVideoStudioSeedReady(resolveVideoStudioSeedRoot()) || wantStudioFull() ? "1" : "";

  const preflight = runE2ePreflight({ includeVideoRender: wantVideoRender() });
  printPreflight(preflight);
  if (!preflight.ready) {
    process.exit(2);
  }

  const scope = setupUserWithInterview(`e2e-accept-${Date.now()}`, { title: "E2E非stub验收" });
  seedCommittedSections(scope, videoDemoSections());

  const overallStarted = Date.now();
  await phaseText(scope);
  const bioTaskId = await phaseBio230(scope);
  if (wantVideoRender()) {
    await phaseBioRender260(scope, bioTaskId);
  }
  await phaseStudioTts(scope);

  console.log(`\n=== 总耗时 ${Math.round((Date.now() - overallStarted) / 1000)}s ===`);
  if (failed > 0) {
    console.error(`\ntest:e2e:acceptance FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:e2e:acceptance OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
