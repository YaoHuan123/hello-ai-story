import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { InterviewSpeaker } from "../llm/studioScript.js";

const ERR = "INTERVIEW_VIDEO_PACK_INVALID";

export type InterviewPosition = "A" | "B" | "C";
export type InterviewTurnEndPosition = "B" | "C";

export const VIDEO_PACK_CLIP_FILENAMES = [
  "A-B.mp4",
  "A-C.mp4",
  "B-A.mp4",
  "B-C.mp4",
  "C-A.mp4",
  "C-B.mp4",
  "B-B-3.mp4",
  "B-B-5.mp4",
  "C-C-3.mp4",
  "C-C-5.mp4",
] as const;

export type VideoPackClipFilename = (typeof VIDEO_PACK_CLIP_FILENAMES)[number];

let cachedPackDir: string | null = null;
let cachedCanonical: { width: number; height: number; fps: number; pixFmt: string } | null = null;
const durationCache = new Map<string, number>();

function ffmpegBin(): string {
  return (process.env.FFMPEG_PATH ?? "ffmpeg").trim() || "ffmpeg";
}

function ffprobeBin(): string {
  const fromEnv = process.env.FFPROBE_PATH?.trim();
  if (fromEnv) return fromEnv || "ffprobe";
  const ffmpegPath = ffmpegBin();
  if (/ffmpeg\.exe$/i.test(ffmpegPath)) {
    return ffmpegPath.replace(/ffmpeg\.exe$/i, "ffprobe.exe");
  }
  if (ffmpegPath !== "ffmpeg" && /ffmpeg$/i.test(ffmpegPath)) {
    return ffmpegPath.replace(/ffmpeg$/i, "ffprobe");
  }
  return "ffprobe";
}

function runFfprobeJson(args: string[]): unknown {
  const cmd = ffprobeBin();
  const r = spawnSync(cmd, args, { encoding: "utf-8" });
  if (r.error || r.status !== 0) {
    throw new Error(`${ERR}: ffprobe 失败：${r.stderr ?? r.error?.message ?? ""}`);
  }
  try {
    return JSON.parse(String(r.stdout ?? "").trim()) as unknown;
  } catch {
    throw new Error(`${ERR}: ffprobe JSON 解析失败`);
  }
}

export function resolveInterviewVideoPackDir(): string {
  if (cachedPackDir && fs.existsSync(cachedPackDir)) return cachedPackDir;
  const candidates = [
    path.join(__dirname, "..", "..", "..", "..", "data", "video-pack"),
    path.join(process.cwd(), "backend", "data", "video-pack"),
    path.join(process.cwd(), "data", "video-pack"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      cachedPackDir = path.resolve(dir);
      return cachedPackDir;
    }
  }
  throw new Error(`${ERR}: 未找到 video-pack 目录（已尝试 ${candidates.join("; ")}）`);
}

export function getVideoPackClipAbsPath(filename: VideoPackClipFilename): string {
  const abs = path.join(resolveInterviewVideoPackDir(), filename);
  if (!fs.existsSync(abs)) {
    throw new Error(`${ERR}: 缺少 video-pack 文件：${abs}`);
  }
  return abs;
}

function parseFps(frac: string): number {
  const parts = frac.split("/");
  if (parts.length !== 2) {
    const n = Number.parseFloat(frac);
    return Number.isFinite(n) && n > 0 ? n : 25;
  }
  const a = Number.parseFloat(parts[0] ?? "0");
  const b = Number.parseFloat(parts[1] ?? "1");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 25;
  return a / b;
}

export type VideoPackCanonical = {
  width: number;
  height: number;
  fps: number;
  pixFmt: string;
};

export function probeVideoPackCanonical(): VideoPackCanonical {
  if (cachedCanonical) return cachedCanonical;
  const abs = getVideoPackClipAbsPath("A-B.mp4");
  const raw = runFfprobeJson([
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,pix_fmt,r_frame_rate",
    "-of",
    "json",
    abs,
  ]);
  const streams = (raw as { streams?: unknown[] }).streams;
  const s0 = streams?.[0];
  if (!s0 || typeof s0 !== "object" || Array.isArray(s0)) {
    throw new Error(`${ERR}: 无法读取 A-B.mp4 视频流`);
  }
  const o = s0 as Record<string, unknown>;
  const width = typeof o.width === "number" ? o.width : 0;
  const height = typeof o.height === "number" ? o.height : 0;
  const pixFmt = typeof o.pix_fmt === "string" ? o.pix_fmt : "";
  const fps = parseFps(typeof o.r_frame_rate === "string" ? o.r_frame_rate : "25/1");
  if (width <= 0 || height <= 0 || !pixFmt) {
    throw new Error(`${ERR}: A-B.mp4 视频元数据无效`);
  }
  cachedCanonical = { width, height, fps, pixFmt };
  return cachedCanonical;
}

export function probeClipDurationSec(absPath: string): number {
  const hit = durationCache.get(absPath);
  if (hit !== undefined) return hit;
  const cmd = ffprobeBin();
  const r = spawnSync(
    cmd,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      absPath,
    ],
    { encoding: "utf-8" },
  );
  if (r.error || r.status !== 0) {
    throw new Error(`${ERR}: ffprobe 时长失败：${absPath} ${r.stderr ?? r.error?.message ?? ""}`);
  }
  const v = Number.parseFloat(String(r.stdout ?? "").trim());
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${ERR}: 无法解析视频时长：${absPath}`);
  }
  durationCache.set(absPath, v);
  return v;
}

export function clearProbeDurationCache(absPath: string): void {
  durationCache.delete(absPath);
}

function videoPackPixFmtCompatible(canonPixFmt: string, clipPixFmt: string): boolean {
  if (clipPixFmt === canonPixFmt) return true;
  const pair = new Set([canonPixFmt, clipPixFmt]);
  return pair.has("yuv420p") && pair.has("yuvj420p");
}

export function validateVideoPackClipsAgainstCanonical(): void {
  const canon = probeVideoPackCanonical();
  for (const fn of VIDEO_PACK_CLIP_FILENAMES) {
    const abs = getVideoPackClipAbsPath(fn);
    const raw = runFfprobeJson([
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,pix_fmt,r_frame_rate",
      "-of",
      "json",
      abs,
    ]);
    const streams = (raw as { streams?: unknown[] }).streams;
    const s0 = streams?.[0];
    if (!s0 || typeof s0 !== "object" || Array.isArray(s0)) {
      throw new Error(`${ERR}: ${fn} 无视频流`);
    }
    const o = s0 as Record<string, unknown>;
    const w = typeof o.width === "number" ? o.width : 0;
    const h = typeof o.height === "number" ? o.height : 0;
    const pix = typeof o.pix_fmt === "string" ? o.pix_fmt : "";
    const fps = parseFps(typeof o.r_frame_rate === "string" ? o.r_frame_rate : "25/1");
    if (w !== canon.width || h !== canon.height) {
      throw new Error(
        `${ERR}: ${fn} 分辨率须与 A-B.mp4 完全一致：期望 ${canon.width}x${canon.height}，实际 ${w}x${h}`,
      );
    }
    if (!videoPackPixFmtCompatible(canon.pixFmt, pix)) {
      throw new Error(`${ERR}: ${fn} pix_fmt 与 A-B.mp4 不兼容`);
    }
    if (Math.abs(fps - canon.fps) > 0.02) {
      throw new Error(`${ERR}: ${fn} 帧率 ${fps} 与 A-B.mp4 的 ${canon.fps} 不一致`);
    }
    probeClipDurationSec(abs);
  }
}

export function ensureVideoPackReady(): void {
  validateVideoPackClipsAgainstCanonical();
}

export type ScheduledClip = { filename: VideoPackClipFilename; absPath: string; durationSec: number };

export type ScheduleTurnClipSequenceResult = {
  clips: ScheduledClip[];
  endState: InterviewTurnEndPosition;
  totalVideoDurSec: number;
};

export function interviewAudioTempoBudget(): number {
  const raw = Number.parseFloat(process.env.INTERVIEW_AUDIO_TEMPO_BUDGET ?? "0.1");
  if (!Number.isFinite(raw) || raw <= 0 || raw > 0.3) return 0.1;
  return raw;
}

export function isInterviewDurationAlignAcceptable(d: number, targetTotalVideoSec: number): boolean {
  if (!Number.isFinite(d) || !Number.isFinite(targetTotalVideoSec) || d <= 0 || targetTotalVideoSec <= 0) {
    return false;
  }
  return Math.abs(1 - d / targetTotalVideoSec) <= interviewAudioTempoBudget() + 1e-12;
}

export function computeClosestLoopCoverSec(params: {
  needSec: number;
  dur3: number;
  dur5: number;
}): { n3: number; n5: number; sumSec: number } {
  const { needSec, dur3, dur5 } = params;
  if (!Number.isFinite(dur3) || dur3 <= 0 || !Number.isFinite(dur5) || dur5 <= 0) {
    throw new Error(`${ERR}: 循环砖时长须为正`);
  }
  if (!Number.isFinite(needSec)) {
    throw new Error(`${ERR}: needSec 无效`);
  }
  if (needSec <= 0) return { n3: 0, n5: 0, sumSec: 0 };
  const maxN = Math.ceil(needSec / Math.min(dur3, dur5)) + 12;
  let bestDist = Infinity;
  let bestSum = Infinity;
  let bestN3 = 0;
  let bestN5 = 0;
  for (let n5 = 0; n5 <= maxN; n5++) {
    for (let n3 = 0; n3 <= maxN; n3++) {
      const sum = n3 * dur3 + n5 * dur5;
      const dist = Math.abs(sum - needSec);
      if (dist < bestDist - 1e-12 || (Math.abs(dist - bestDist) <= 1e-12 && sum < bestSum - 1e-12)) {
        bestDist = dist;
        bestSum = sum;
        bestN3 = n3;
        bestN5 = n5;
      }
    }
  }
  return { n3: bestN3, n5: bestN5, sumSec: bestSum };
}

export function scheduleTurnClipSequence(params: {
  speaker: InterviewSpeaker;
  fromState: InterviewPosition;
  audioDurSec: number;
}): ScheduleTurnClipSequenceResult {
  const { speaker, fromState, audioDurSec } = params;
  if (!Number.isFinite(audioDurSec) || audioDurSec <= 0) {
    throw new Error(`${ERR}: audioDurSec 无效：${audioDurSec}`);
  }

  const target: InterviewTurnEndPosition = speaker === "host" ? "B" : "C";
  const loop3: VideoPackClipFilename = speaker === "host" ? "B-B-3.mp4" : "C-C-3.mp4";
  const loop5: VideoPackClipFilename = speaker === "host" ? "B-B-5.mp4" : "C-C-5.mp4";

  const entryKey =
    fromState === target ? null : (`${fromState}-${target}` as `${InterviewPosition}-${InterviewTurnEndPosition}`);

  const entryFilename = entryKey ? (`${entryKey}.mp4` as VideoPackClipFilename) : null;

  const clips: ScheduledClip[] = [];
  let total = 0;

  const pushClip = (fn: VideoPackClipFilename): void => {
    const abs = getVideoPackClipAbsPath(fn);
    const durationSec = probeClipDurationSec(abs);
    clips.push({ filename: fn, absPath: abs, durationSec });
    total += durationSec;
  };

  if (entryFilename) pushClip(entryFilename);

  const need = audioDurSec - total;
  const dur3 = probeClipDurationSec(getVideoPackClipAbsPath(loop3));
  const dur5 = probeClipDurationSec(getVideoPackClipAbsPath(loop5));
  const { n3, n5 } = computeClosestLoopCoverSec({ needSec: need, dur3, dur5 });
  for (let k = 0; k < n5; k++) pushClip(loop5);
  for (let k = 0; k < n3; k++) pushClip(loop3);

  return { clips, endState: target, totalVideoDurSec: total };
}
