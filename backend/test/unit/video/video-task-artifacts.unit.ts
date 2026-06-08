/**
 * 成片产物路径校验与清单。
 * 用法：npm run build && npm run test:video:artifacts
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { setupUserWithInterview } from "../../fixtures/interviewScope";
import { testUserId } from "../../helpers/testAccount";
import { videoDemoSections } from "../../fixtures/sections.videoDemo";
import { createBiographyVideoTask } from "../../../dist/video/biography/orchestrator/runBiographyVideoPipeline.js";
import {
  listVideoTaskArtifacts,
  openVideoArtifactFile,
  resolveVideoArtifactAbsPath,
} from "../../../dist/video/worker/videoTaskArtifacts.js";
import { VIDEO_OUTPUT_DIR, MERGED_VIDEO_FILENAME } from "../../../dist/video/biography/constants/pipelineFilenames.js";

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

function expectThrow(label: string, fn: () => void): void {
  try {
    fn();
    check(label, false, "expected throw");
  } catch {
    check(label, true);
  }
}

async function main(): Promise<void> {
  const scope = setupUserWithInterview(testUserId("video-artifacts"));
  seedCommittedSections(scope, videoDemoSections());
  const handle = createBiographyVideoTask(scope);
  const taskRoot = handle.paths.taskRoot;
  const videoRel = `${VIDEO_OUTPUT_DIR}/${MERGED_VIDEO_FILENAME}`.replace(/\\/g, "/");

  console.log("\n=== 路径校验 ===");
  const abs = resolveVideoArtifactAbsPath(taskRoot, videoRel);
  check("resolve valid rel", abs.endsWith(MERGED_VIDEO_FILENAME));
  expectThrow("reject .. traversal", () => resolveVideoArtifactAbsPath(taskRoot, "../../etc/passwd"));
  expectThrow("reject absolute", () => resolveVideoArtifactAbsPath(taskRoot, "/etc/passwd"));

  console.log("\n=== 写入假 mp4 并列出产物 ===");
  const outDir = path.join(taskRoot, VIDEO_OUTPUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const fakeMp4 = path.join(outDir, MERGED_VIDEO_FILENAME);
  fs.writeFileSync(fakeMp4, Buffer.from("fake-mp4-content"));

  const listed = listVideoTaskArtifacts(scope, handle.taskId);
  check("primaryVideo available", listed.primaryVideo.available === true);
  check("items include merged video", listed.items.some((i) => i.relativePath === videoRel));

  const opened = openVideoArtifactFile(scope, handle.taskId, videoRel);
  check("open file ok", fs.existsSync(opened.absPath));

  if (failed > 0) {
    console.error(`\ntest:video:artifacts FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:video:artifacts OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
