/**
 * 演播室成片集成测试：5 节假素材 → prep + iv_script（或 seed 续跑 iv_tts）。
 *
 * 默认：若存在 test/fixtures/video-studio-through-iv-script/ seed，则从 iv_tts 续跑。
 * 全程至 iv_script：VIDEO_STUDIO_FULL=1 npm run test:video:studio:tts
 * 导出 seed：node scripts/export-video-studio-seed.mjs <taskRoot>
 *
 * 前置：backend/.env 配 OPENAI_API_KEY（全程）；TTS 需 host/guest 音色与 TTS_API_KEY 或 OPENAI_API_KEY。
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { setupUserWithInterview } from "../../fixtures/interviewScope";
import { videoDemoSections } from "../../fixtures/sections.videoDemo";
import {
  createStudioVideoTask,
  runStudioVideoPipeline,
} from "../../../dist/video/studio/orchestrator/runStudioVideoPipeline.js";
import {
  STUDIO_SCRIPT_REL,
  STUDIO_TTS_BUNDLE_REL,
  STUDIO_AUDIO_SUBDIR_REL,
} from "../../../dist/video/studio/constants/studioFilenames.js";
import { PIPELINE_SEGMENT_REFINE_FILE } from "../../../dist/video/shared/constants/prepFilenames.js";
import {
  readVideoTaskMeta,
  writeVideoTaskMeta,
  type VideoTaskMeta,
} from "../../../dist/video/shared/orchestrator/videoTaskWorkspace.js";
import {
  VIDEO_STUDIO_DEFAULT_FROM_STEP,
  VIDEO_STUDIO_SEED_THROUGH_STEP,
  copyVideoStudioSeedToTask,
  isVideoStudioSeedReady,
  resolveVideoStudioSeedRoot,
  studioCompletedStepsBefore,
} from "./videoStudioPipelineSeed";

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

function resolveHostVoice(): string {
  return (process.env.VIDEO_DEMO_HOST_VOICE ?? process.env.VIDEO_DEMO_TTS_VOICE ?? "").trim();
}

function resolveGuestVoice(): string {
  return (process.env.VIDEO_DEMO_GUEST_VOICE ?? process.env.VIDEO_DEMO_TTS_VOICE ?? "").trim();
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
  const v = (process.env.VIDEO_STUDIO_FULL ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function resolveFromStep(useSeed: boolean): string | undefined {
  const env = (process.env.VIDEO_STUDIO_FROM_STEP ?? "").trim();
  if (env) return env;
  if (useSeed) return VIDEO_STUDIO_DEFAULT_FROM_STEP;
  return undefined;
}

function resolveThroughStep(useSeed: boolean): string {
  const env = (process.env.VIDEO_STUDIO_THROUGH_STEP ?? "").trim();
  if (env) return env;
  return useSeed ? "iv_tts" : VIDEO_STUDIO_SEED_THROUGH_STEP;
}

async function main(): Promise<void> {
  const hostVoice = resolveHostVoice();
  const guestVoice = resolveGuestVoice();

  delete process.env.VIDEO_INPUT_STUB;
  delete process.env.VIDEO_PREP_STUB;
  delete process.env.STUDIO_SCRIPT_STUB;

  const seedRoot = resolveVideoStudioSeedRoot();
  const useSeed = !wantFullRun() && isVideoStudioSeedReady(seedRoot);
  const fromStep = resolveFromStep(useSeed);
  const effectiveThrough = resolveThroughStep(useSeed);

  const needsTts =
    effectiveThrough === "iv_tts" ||
    effectiveThrough === "iv_duration_align" ||
    effectiveThrough === "iv_clips" ||
    effectiveThrough === "iv_merge";

  if (useSeed && needsTts) {
    if (!hostVoice || !guestVoice) {
      console.warn("[SKIP] 未配置 VIDEO_DEMO_TTS_VOICE（或 HOST/GUEST 分别配置），iv_tts 需音色。");
      process.exit(0);
    }
    if (!hasTtsCredentials()) {
      console.warn("[SKIP] 未配置 TTS_API_KEY 或 OPENAI_API_KEY，iv_tts 无法合成音频。");
      process.exit(0);
    }
  } else if (wantFullRun() && !process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，VIDEO_STUDIO_FULL 需真实 LLM。");
    process.exit(0);
  } else if (!useSeed && !wantFullRun() && !process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 无 seed 且未配置 OPENAI_API_KEY，无法跑至 iv_script。");
    process.exit(0);
  }

  if (needsTts && (!hostVoice || !guestVoice)) {
    console.warn("[SKIP] 缺少 hostVoice/guestVoice。");
    process.exit(0);
  }

  const userId = `video-studio-${Date.now()}`;
  const scope = setupUserWithInterview(userId, { title: "演播室集成测试" });
  seedCommittedSections(scope, videoDemoSections());

  console.log("\n=== 假素材（5 节）===");
  console.log(JSON.stringify(videoDemoSections().map((s) => s.name), null, 2));

  const handle = createStudioVideoTask(scope);
  console.log(`\n=== 任务 taskId=${handle.taskId} ===`);
  console.log(`  taskRoot: ${handle.paths.taskRoot}`);

  if (useSeed && fromStep) {
    console.log(`\n=== 使用 seed（through ${VIDEO_STUDIO_SEED_THROUGH_STEP}）从 ${fromStep} 续跑 ===`);
    console.log(`  seed: ${seedRoot}`);
    copyVideoStudioSeedToTask(handle.paths.taskRoot, seedRoot);
    const meta = readVideoTaskMeta(handle.paths);
    if (meta) {
      const next: VideoTaskMeta = {
        ...meta,
        status: "pending",
        completedSteps: studioCompletedStepsBefore(fromStep),
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      };
      writeVideoTaskMeta(handle.paths, next);
    }
    check(
      "seed iv_script 产物存在",
      fs.existsSync(path.join(handle.paths.pipelineDir, STUDIO_SCRIPT_REL)),
    );
  } else if (!wantFullRun()) {
    console.log(
      "\n=== 无 seed，跑至 iv_script（导出: node scripts/export-video-studio-seed.mjs <taskRoot>）===",
    );
  } else {
    console.log(`\n=== VIDEO_STUDIO_FULL=1，跑至 ${effectiveThrough} ===`);
  }

  const startedAt = Date.now();
  let result: Awaited<ReturnType<typeof runStudioVideoPipeline>>;
  try {
    result = await runStudioVideoPipeline(scope, {
      taskId: handle.taskId,
      polishMode: useSeed ? undefined : "llm",
      hostVoice,
      guestVoice,
      throughStep: effectiveThrough as "iv_tts",
      fromStep: fromStep as "iv_tts" | undefined,
      onStepComplete: (r) => {
        const out = "outputRelativePath" in r ? r.outputRelativePath : undefined;
        const skipped = "skipped" in r ? r.skipped : undefined;
        console.log(
          `  [step ${r.stepId}]${skipped !== undefined ? ` skipped=${skipped}` : ""}${out ? ` → ${out}` : ""}`,
        );
      },
    });
  } catch (err) {
    console.error("\n流水线失败，可 inspect：", handle.paths.taskRoot);
    throw err;
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n=== 完成，耗时 ${elapsedSec}s ===`);

  const meta = readVideoTaskMeta(handle.paths);
  const pipelineDir = handle.paths.pipelineDir;

  check("pipeline status success", result.status === "success", result.status);
  check("meta status success", meta?.status === "success", meta?.status);

  if (useSeed) {
    check("completedSteps 含 iv_tts", meta?.completedSteps.includes("iv_tts") ?? false, meta?.completedSteps);
    check("completedSteps 不含 era 20", !(meta?.completedSteps.includes("20") ?? false), meta?.completedSteps);
  } else {
    check("step-80 产物存在", fs.existsSync(path.join(pipelineDir, PIPELINE_SEGMENT_REFINE_FILE)));
    check(
      "iv_script 产物存在",
      fs.existsSync(path.join(pipelineDir, STUDIO_SCRIPT_REL)),
    );
    check("completedSteps 含 iv_script", meta?.completedSteps.includes("iv_script") ?? false, meta?.completedSteps);
  }

  if (effectiveThrough === "iv_tts" || compareThroughIncludesTts(effectiveThrough)) {
    const bundlePath = path.join(pipelineDir, STUDIO_TTS_BUNDLE_REL);
    check("iv_tts bundle 存在", fs.existsSync(bundlePath));
    const audioDir = path.join(pipelineDir, STUDIO_AUDIO_SUBDIR_REL.split("/").join(path.sep));
    const mp3Count = countMp3InDir(audioDir);
    check("iv_tts 至少 1 个 mp3", mp3Count >= 1, { mp3Count, audioDir });
  }

  if (failed > 0) {
    console.error(`\ntest:video:studio:tts FAILED (${passed} ok, ${failed} fail)`);
    console.error(`  inspect: ${handle.paths.taskRoot}`);
    process.exit(1);
  }
  console.log(`\ntest:video:studio:tts OK (${passed} checks)`);
  console.log(`  inspect: ${handle.paths.taskRoot}`);
  if (!useSeed && meta?.completedSteps.includes("iv_script")) {
    console.log(`  导出 seed: node scripts/export-video-studio-seed.mjs ${handle.paths.taskRoot}`);
  }
}

function compareThroughIncludesTts(through: string): boolean {
  return through === "iv_duration_align" || through === "iv_clips" || through === "iv_merge";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
