import { spawnSync } from "child_process";
import fs from "node:fs";
import path from "node:path";

export type VideoClipIndexRow = {
  segmentIndex: number;
  imageRelativePath: string;
  audioRelativePath: string;
  videoRelativePath: string;
};

function ffmpegBin(): string {
  return (process.env.FFMPEG_PATH ?? "ffmpeg").trim() || "ffmpeg";
}

function ensureOkFile(absPath: string, label: string): void {
  if (!fs.existsSync(absPath)) {
    throw new Error(`MERGE_VIDEO_260_INVALID: 缺少${label}文件：${absPath}`);
  }
}

function runFfmpeg(args: string[]): void {
  const cmd = ffmpegBin();
  const r = spawnSync(cmd, args, { encoding: "utf-8" });
  if (r.error) {
    throw new Error(`MERGE_VIDEO_260_INVALID: 执行 ffmpeg 失败：${r.error.message}`);
  }
  if (r.status !== 0) {
    const msg = `${r.stderr ?? ""}\n${r.stdout ?? ""}`.trim();
    throw new Error(`MERGE_VIDEO_260_INVALID: ffmpeg 返回非零状态 ${r.status}\n${msg.slice(0, 2000)}`);
  }
}

export function parseVideoClipIndexesFromPipeline(raw: Record<string, unknown>): VideoClipIndexRow[] {
  const arr = raw.videoClipIndexes;
  if (!Array.isArray(arr)) {
    throw new Error("MERGE_VIDEO_260_INVALID: videoClipIndexes 须为数组（来自 视频片段和场景包的位置的索引.json）");
  }
  const out: VideoClipIndexRow[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`MERGE_VIDEO_260_INVALID: videoClipIndexes 第 ${i + 1} 条须为对象`);
    }
    const o = item as Record<string, unknown>;
    const si = Number(o.segmentIndex);
    const vr = typeof o.videoRelativePath === "string" ? o.videoRelativePath.trim() : "";
    if (!Number.isFinite(si) || !vr) {
      throw new Error(`MERGE_VIDEO_260_INVALID: videoClipIndexes 第 ${i + 1} 条 segmentIndex/videoRelativePath 无效`);
    }
    out.push({
      segmentIndex: si,
      imageRelativePath: typeof o.imageRelativePath === "string" ? o.imageRelativePath.trim() : "",
      audioRelativePath: typeof o.audioRelativePath === "string" ? o.audioRelativePath.trim() : "",
      videoRelativePath: vr,
    });
  }
  return out;
}

/**
 * 按 segmentIndex 升序合并所有片段为单一 MP4（concat demuxer）。
 */
export function mergeVideoClipsToFullVideo(params: {
  workspaceRoot: string;
  clips: VideoClipIndexRow[];
  outputVideoRelativePath: string;
}): { segmentOrder: number[]; concatListPath: string } {
  if (params.clips.length === 0) {
    throw new Error("MERGE_VIDEO_260_INVALID: 无视频片段可合并");
  }
  const workspaceRoot = path.resolve(params.workspaceRoot);
  const sorted = [...params.clips].sort((a, b) => a.segmentIndex - b.segmentIndex);
  const lines: string[] = [];
  for (const c of sorted) {
    const abs = path.resolve(workspaceRoot, c.videoRelativePath);
    ensureOkFile(abs, "视频片段");
    const escaped = abs.replace(/\\/g, "/").replace(/'/g, "'\\''");
    lines.push(`file '${escaped}'`);
  }
  const concatListPath = path.resolve(
    workspaceRoot,
    "pipeline",
    `.merge-video-clips-${Date.now()}.ffconcat.txt`,
  );
  fs.mkdirSync(path.dirname(concatListPath), { recursive: true });
  fs.writeFileSync(concatListPath, `${lines.join("\n")}\n`, "utf-8");

  const outAbs = path.resolve(workspaceRoot, params.outputVideoRelativePath);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c",
    "copy",
    outAbs,
  ]);

  return { segmentOrder: sorted.map((c) => c.segmentIndex), concatListPath };
}
