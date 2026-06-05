/** CLI：仅打印 E2E 前置检查结果（exit 2 = 缺配置）。 */
import { config as loadEnv } from "dotenv";
import { spawnSync } from "node:child_process";
import { isVideoBioSeedReady, resolveVideoBioSeedRoot } from "../video/videoBioPipelineSeed";
import { isVideoStudioSeedReady, resolveVideoStudioSeedRoot } from "../video/videoStudioPipelineSeed";
import { clearStubEnv, printPreflight, runE2ePreflight } from "./e2ePreflight";

loadEnv();
clearStubEnv();

function detectFfmpeg(): boolean {
  const bin = (process.env.FFMPEG_PATH ?? "ffmpeg").trim() || "ffmpeg";
  const r = spawnSync(bin, ["-version"], { encoding: "utf8", timeout: 10_000 });
  return r.status === 0;
}

function truthy(name: string): boolean {
  const v = (process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

if (detectFfmpeg()) process.env.E2E_FFMPEG_OK = "1";
process.env.E2E_BIO_SEED_READY =
  isVideoBioSeedReady(resolveVideoBioSeedRoot()) || truthy("E2E_BIO_FULL") ? "1" : "";
process.env.E2E_STUDIO_SEED_READY =
  isVideoStudioSeedReady(resolveVideoStudioSeedRoot()) || truthy("E2E_STUDIO_FULL") ? "1" : "";

const result = runE2ePreflight({ includeVideoRender: truthy("E2E_VIDEO_RENDER") });
printPreflight(result);
process.exit(result.ready ? 0 : 2);
