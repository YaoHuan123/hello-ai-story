import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "../../services/interviewWorkspace.service";
import {
  AUDIO_OUTPUT_DIR,
  IMAGE_OUTPUT_DIR,
  VIDEO_CLIP_OUTPUT_DIR,
  VIDEO_OUTPUT_DIR,
} from "../biography/constants/pipelineFilenames.js";
import { MERGED_VIDEO_REL } from "../studio/constants/studioFilenames.js";
import {
  openVideoTask,
  readVideoTaskMeta,
  type VideoProductionMode,
  type VideoTaskPaths,
} from "../shared/orchestrator/videoTaskWorkspace.js";

export type VideoArtifactKind = "video" | "audio" | "image" | "json" | "other";

export type VideoArtifactItem = {
  kind: VideoArtifactKind;
  /** 相对 taskRoot 的路径（POSIX `/`） */
  relativePath: string;
  sizeBytes: number;
  mimeType: string;
};

export type VideoPrimaryVideo = {
  available: boolean;
  relativePath?: string;
  sizeBytes?: number;
  mimeType?: string;
};

export type VideoTaskArtifacts = {
  taskId: string;
  productionMode: VideoProductionMode;
  primaryVideo: VideoPrimaryVideo;
  counts: { video: number; audio: number; image: number; json: number; other: number };
  items: VideoArtifactItem[];
};

const PRIMARY_VIDEO_REL = MERGED_VIDEO_REL;

const MEDIA_SCAN_ROOTS = [
  VIDEO_OUTPUT_DIR,
  AUDIO_OUTPUT_DIR,
  IMAGE_OUTPUT_DIR,
  VIDEO_CLIP_OUTPUT_DIR,
  "pipeline/interview-studio/interview-clips",
];

const MAX_ARTIFACT_FILES = 120;

function toPosixRel(taskRoot: string, absPath: string): string {
  return path.relative(taskRoot, absPath).split(path.sep).join("/");
}

function artifactKind(ext: string): VideoArtifactKind {
  const e = ext.toLowerCase();
  if (e === ".mp4" || e === ".webm" || e === ".mov") return "video";
  if (e === ".mp3" || e === ".wav" || e === ".m4a") return "audio";
  if (e === ".png" || e === ".jpg" || e === ".jpeg" || e === ".webp") return "image";
  if (e === ".json") return "json";
  return "other";
}

function mimeForExt(ext: string): string {
  const e = ext.toLowerCase();
  const map: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".json": "application/json",
  };
  return map[e] ?? "application/octet-stream";
}

/** 校验 rel 在 taskRoot 内，返回绝对路径；非法时抛 `VIDEO_ARTIFACT_PATH_INVALID`。 */
export function resolveVideoArtifactAbsPath(taskRoot: string, relativePath: string): string {
  const raw = relativePath.trim().replace(/\\/g, "/");
  if (!raw || raw.startsWith("/") || raw.includes("\0")) {
    throw new Error("VIDEO_ARTIFACT_PATH_INVALID: 非法相对路径");
  }
  const segments = raw.split("/").filter((s) => s.length > 0);
  if (segments.some((s) => s === "..")) {
    throw new Error("VIDEO_ARTIFACT_PATH_INVALID: 路径不得包含 ..");
  }
  const abs = path.resolve(taskRoot, ...segments);
  const rootResolved = path.resolve(taskRoot);
  if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) {
    throw new Error("VIDEO_ARTIFACT_PATH_INVALID: 路径越界");
  }
  return abs;
}

function statFile(taskRoot: string, relPosix: string): VideoArtifactItem | null {
  let abs: string;
  try {
    abs = resolveVideoArtifactAbsPath(taskRoot, relPosix);
  } catch {
    return null;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  const st = fs.statSync(abs);
  const ext = path.extname(abs);
  return {
    kind: artifactKind(ext),
    relativePath: relPosix,
    sizeBytes: st.size,
    mimeType: mimeForExt(ext),
  };
}

function walkFiles(rootAbs: string, taskRoot: string, out: VideoArtifactItem[]): void {
  if (!fs.existsSync(rootAbs) || out.length >= MAX_ARTIFACT_FILES) return;
  for (const ent of fs.readdirSync(rootAbs, { withFileTypes: true })) {
    if (out.length >= MAX_ARTIFACT_FILES) break;
    const full = path.join(rootAbs, ent.name);
    if (ent.isDirectory()) {
      walkFiles(full, taskRoot, out);
    } else if (ent.isFile()) {
      const rel = toPosixRel(taskRoot, full);
      const ext = path.extname(ent.name);
      out.push({
        kind: artifactKind(ext),
        relativePath: rel,
        sizeBytes: fs.statSync(full).size,
        mimeType: mimeForExt(ext),
      });
    }
  }
}

function countKinds(items: VideoArtifactItem[]): VideoTaskArtifacts["counts"] {
  const counts = { video: 0, audio: 0, image: 0, json: 0, other: 0 };
  for (const item of items) {
    counts[item.kind] += 1;
  }
  return counts;
}

/** 列出成片任务可下载产物（不含 pipeline 中间 JSON，仅媒体与成品目录）。 */
export function listVideoTaskArtifacts(scope: InterviewScope, taskId: string): VideoTaskArtifacts {
  const handle = openVideoTask(scope, taskId);
  const meta = readVideoTaskMeta(handle.paths);
  if (!meta) {
    throw new Error(`VIDEO_TASK_NOT_FOUND: 成片任务「${taskId}」不存在或 meta 无效`);
  }

  const items: VideoArtifactItem[] = [];
  const seen = new Set<string>();

  const pushItem = (item: VideoArtifactItem | null) => {
    if (!item || seen.has(item.relativePath)) return;
    seen.add(item.relativePath);
    items.push(item);
  };

  pushItem(statFile(handle.paths.taskRoot, PRIMARY_VIDEO_REL));

  for (const relRoot of MEDIA_SCAN_ROOTS) {
    if (items.length >= MAX_ARTIFACT_FILES) break;
    const absRoot = resolveVideoArtifactAbsPath(handle.paths.taskRoot, relRoot);
    walkFiles(absRoot, handle.paths.taskRoot, items);
    for (const item of items) seen.add(item.relativePath);
  }

  items.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));
  const deduped = [...new Map(items.map((i) => [i.relativePath, i])).values()];

  const primary = statFile(handle.paths.taskRoot, PRIMARY_VIDEO_REL);
  const primaryVideo: VideoPrimaryVideo = primary
    ? {
        available: true,
        relativePath: primary.relativePath,
        sizeBytes: primary.sizeBytes,
        mimeType: primary.mimeType,
      }
    : { available: false };

  return {
    taskId: handle.taskId,
    productionMode: meta.productionMode,
    primaryVideo,
    counts: countKinds(deduped),
    items: deduped,
  };
}

/** 打开已校验的产物文件；不存在时抛 `VIDEO_ARTIFACT_NOT_FOUND`。 */
export function openVideoArtifactFile(
  scope: InterviewScope,
  taskId: string,
  relativePath: string,
): { absPath: string; mimeType: string; filename: string; paths: VideoTaskPaths } {
  const handle = openVideoTask(scope, taskId);
  const absPath = resolveVideoArtifactAbsPath(handle.paths.taskRoot, relativePath);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    throw new Error(`VIDEO_ARTIFACT_NOT_FOUND: 产物不存在：${relativePath}`);
  }
  const filename = path.basename(absPath);
  const mimeType = mimeForExt(path.extname(filename));
  return { absPath, mimeType, filename, paths: handle.paths };
}
