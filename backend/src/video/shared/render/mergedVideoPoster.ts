import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { VIDEO_POSTER_JPEG_FILENAME } from "../constants/mediaFilenames.js";

function ffmpegBin(): string {
  return (process.env.FFMPEG_PATH ?? "ffmpeg").trim() || "ffmpeg";
}

/** 与成片 MP4 同目录的 JPEG 预览绝对路径。 */
export function posterJpegAbsBesideMergedVideo(mergedVideoAbs: string): string {
  return path.join(path.dirname(mergedVideoAbs), VIDEO_POSTER_JPEG_FILENAME);
}

/**
 * 从合并成片 MP4 抽取首帧为 JPEG（`poster.jpg`）。
 * 缺文件时 GET cover 会懒生成；合并步骤成功后也会主动调用一次。
 */
export function ensurePosterJpegBesideMergedMp4(mergedVideoAbs: string): void {
  const posterAbs = posterJpegAbsBesideMergedVideo(mergedVideoAbs);
  if (fs.existsSync(posterAbs) && fs.statSync(posterAbs).isFile()) {
    return;
  }
  if (!fs.existsSync(mergedVideoAbs) || !fs.statSync(mergedVideoAbs).isFile()) {
    throw new Error("VIDEO_POSTER_INVALID: 成片 MP4 不存在，无法生成预览图");
  }
  fs.mkdirSync(path.dirname(posterAbs), { recursive: true });
  const cmd = ffmpegBin();
  const r = spawnSync(
    cmd,
    ["-y", "-i", mergedVideoAbs, "-frames:v", "1", "-q:v", "3", posterAbs],
    { encoding: "utf-8" },
  );
  if (r.error) {
    throw new Error(`VIDEO_POSTER_INVALID: 执行 ffmpeg 失败：${r.error.message}`);
  }
  if (r.status !== 0) {
    const msg = `${r.stderr ?? ""}\n${r.stdout ?? ""}`.trim();
    throw new Error(`VIDEO_POSTER_INVALID: ffmpeg 抽帧失败（exit ${r.status}）\n${msg.slice(0, 2000)}`);
  }
  if (!fs.existsSync(posterAbs) || !fs.statSync(posterAbs).isFile()) {
    throw new Error("VIDEO_POSTER_INVALID: ffmpeg 未写出 poster 文件");
  }
}
