import { spawn, spawnSync } from "child_process";
import fs from "node:fs";
import path from "node:path";
import { parseMergedNarrativeSegmentsFromMergeRaw } from "../llm/steps/step160TotalPackVoiceover.js";

/**
 * 步骤 240 多段 ffmpeg 并行渲染的并发上限；见 `.env.example` 中 `VIDEO_CLIPS_240_CONCURRENCY`。
 * libx264 单进程已多线程，默认并发 2 兼顾「省时」与「CPU 不被打满影响其他流水线」；调到 4+ 前请确认机器有足够物理核。
 */
function step250VideoClipsConcurrency(): number {
  const raw = Number.parseInt(process.env.VIDEO_CLIPS_240_CONCURRENCY ?? "2", 10);
  if (!Number.isFinite(raw)) return 2;
  return Math.min(16, Math.max(1, Math.floor(raw)));
}

/** 与 step240TextToImage 相同结构的「fail-fast 并发池」；一段失败直接抛错并中止后续启动。 */
async function parallelLimitFailFast<T>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const n = Math.min(items.length, Math.max(1, Math.floor(limit)));
  let next = 0;
  let error: unknown;

  async function worker(): Promise<void> {
    for (;;) {
      if (error) return;
      const idx = next++;
      if (idx >= items.length) return;
      const item = items[idx];
      try {
        await mapper(item!);
      } catch (e) {
        error = e;
      }
    }
  }

  await Promise.all(Array.from({ length: n }, () => worker()));
  if (error) throw error;
}

export type ImageIndexItem = {
  segmentIndex: number;
  relativePath: string;
  /** 与文生图 scene-XXXX 一致；旧数据可从路径解析 */
  sceneIndex?: number;
  prompt?: string;
};

export type AudioIndexItem = {
  segmentIndex: number;
  relativePath: string;
  /** 分画面音频时与图片 sceneIndex 对应；旧数据单文件 segment-XXXX.mp3 无此字段 */
  sceneIndex?: number;
};

export type VideoClipIndexItem = {
  segmentIndex: number;
  imageRelativePath: string;
  audioRelativePath: string;
  videoRelativePath: string;
  tailUserImageRelativePaths?: string[];
};

function ffmpegBin(): string {
  return (process.env.FFMPEG_PATH ?? "ffmpeg").trim() || "ffmpeg";
}

/** 与 ffmpeg 同目录的 ffprobe（Windows 常见为 ffmpeg.exe / ffprobe.exe） */
function ffprobeBin(): string {
  const fromEnv = process.env.FFPROBE_PATH?.trim();
  if (fromEnv) {
    return fromEnv || "ffprobe";
  }
  const ffmpegPath = ffmpegBin();
  if (/ffmpeg\.exe$/i.test(ffmpegPath)) {
    return ffmpegPath.replace(/ffmpeg\.exe$/i, "ffprobe.exe");
  }
  if (ffmpegPath !== "ffmpeg" && /ffmpeg$/i.test(ffmpegPath)) {
    return ffmpegPath.replace(/ffmpeg$/i, "ffprobe");
  }
  return "ffprobe";
}

function ensureOkFile(absPath: string, label: string): void {
  if (!fs.existsSync(absPath)) {
    throw new Error(`VIDEO_CLIPS_250_INVALID: 缺少${label}文件：${absPath}`);
  }
}

/** Windows 上子进程退出码常为 32 位无符号，与有符号 -N 对应 */
function formatChildExitStatus(status: number | null): string {
  if (status === null) {
    return "null";
  }
  if (status > 0x7fffffff) {
    return `${status}（有符号约 ${status - 0x100000000}）`;
  }
  return String(status);
}

/** ffmpeg 失败时真正原因多在 stderr 末尾，避免只截到版本横幅 */
function clipProcessLog(msg: string, maxLen: number): string {
  const t = msg.trim();
  if (t.length <= maxLen) {
    return t;
  }
  const head = 500;
  const tail = maxLen - head - 40;
  return `${t.slice(0, head)}\n…(省略中间 ${t.length - head - tail} 字符)…\n${t.slice(-tail)}`;
}

/** 单张：偶数宽高以满足 yuv420p；多张 concat：统一画布并 pad，避免尺寸不一致 */
const SLIDESHOW_CANVAS = "1920:1080";

function getTailUserImageSeconds(): number {
  const raw = Number.parseFloat(process.env.VIDEO_TAIL_USER_IMAGE_SECONDS ?? "2");
  if (!Number.isFinite(raw)) return 2;
  return Math.min(10, Math.max(0.5, raw));
}

/** 每句/每镜 TTS 结束后追加静音（秒），与对应静帧延长一致；0 关闭（默认 0）。 */
function getInterScenePauseSeconds(): number {
  const raw = Number.parseFloat(process.env.VIDEO_CLIP_INTER_SCENE_PAUSE_SECONDS ?? "0");
  if (!Number.isFinite(raw)) return 0;
  return Math.min(5, Math.max(0, raw));
}

const AUDIO_PAUSE_PIPELINE_RATE = 48000;

/** concat 前统一为立体声 fltp，避免与 aevalsrc 拼接格式不一致 */
function audioNormalizeForConcatFilter(inLabel: string, outLabel: string): string {
  return `[${inLabel}]aresample=${AUDIO_PAUSE_PIPELINE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[${outLabel}]`;
}

function silenceStereoFilter(durationSec: number, outLabel: string): string {
  return `aevalsrc=0|0:d=${durationSec}:s=${AUDIO_PAUSE_PIPELINE_RATE}:c=stereo[${outLabel}]`;
}

/** 多路独立音频：每路后接一段静音再 concat（pauseSec=0 时退化为原 concat） */
function buildAudioConcatWithOptionalPauses(params: {
  /** filter 中音频输入下标，如 n..n+n-1 */
  audioInputIndices: number[];
  pauseSec: number;
}): { filterParts: string[]; outLabel: string } {
  const n = params.audioInputIndices.length;
  if (n === 0) {
    throw new Error("VIDEO_CLIPS_250_INVALID: buildAudioConcatWithOptionalPauses 需要至少一路音频");
  }
  if (params.pauseSec <= 0) {
    const inputs = params.audioInputIndices.map((idx) => `[${idx}:a]`).join("");
    const outLabel = "outa";
    return {
      filterParts: [`${inputs}concat=n=${n}:v=0:a=1[${outLabel}]`],
      outLabel,
    };
  }
  const parts: string[] = [];
  const concatLabels: string[] = [];
  for (let i = 0; i < n; i++) {
    const idx = params.audioInputIndices[i];
    const naud = `naud${i}`;
    const nsil = `nsil${i}`;
    parts.push(audioNormalizeForConcatFilter(`${idx}:a`, naud));
    parts.push(silenceStereoFilter(params.pauseSec, nsil));
    concatLabels.push(`[${naud}][${nsil}]`);
  }
  const outLabel = "outa";
  parts.push(`${concatLabels.join("")}concat=n=${2 * n}:v=0:a=1[${outLabel}]`);
  return { filterParts: parts, outLabel };
}

function appendTailUserImagesFilter(params: {
  originalVideoLabel: string;
  originalAudioLabel: string;
  tailInputStartIndex: number;
  tailImagesCount: number;
  perImageSec: number;
}): { filterParts: string[]; finalV: string; finalA: string } {
  const parts: string[] = [];
  const tailLabels: string[] = [];
  for (let i = 0; i < params.tailImagesCount; i++) {
    const inputIdx = params.tailInputStartIndex + i;
    const label = `tailv${i}`;
    tailLabels.push(`[${label}]`);
    parts.push(
      `[${inputIdx}:v]trim=duration=${params.perImageSec},setpts=PTS-STARTPTS,scale=${SLIDESHOW_CANVAS}:force_original_aspect_ratio=decrease,pad=${SLIDESHOW_CANVAS}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1[${label}]`,
    );
  }
  const finalV = "finalv";
  const finalA = "finala";
  parts.push(`[${params.originalVideoLabel}]${tailLabels.join("")}concat=n=${1 + params.tailImagesCount}:v=1:a=0[${finalV}]`);
  const silenceSeconds = params.tailImagesCount * params.perImageSec;
  const tailAin = "tailAin";
  parts.push(
    `[${params.originalAudioLabel}]aresample=${AUDIO_PAUSE_PIPELINE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo[${tailAin}]`,
  );
  parts.push(silenceStereoFilter(silenceSeconds, "sil"));
  parts.push(`[${tailAin}][sil]concat=n=2:v=0:a=1[${finalA}]`);
  return { filterParts: parts, finalV, finalA };
}

/**
 * 多段视频并行渲染时使用：每次 `spawn` 启动独立 ffmpeg 子进程，由 `parallelLimitFailFast` 控制同时在跑的数量。
 * 单段失败时把 stderr/stdout 包到错误信息里，与原同步版本一致。
 */
async function runFfmpegAsync(args: string[]): Promise<void> {
  const cmd = ffmpegBin();
  return new Promise<void>((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reject(new Error(`VIDEO_CLIPS_250_INVALID: 执行 ffmpeg 失败：${msg}`));
      return;
    }
    let stderr = "";
    let stdout = "";
    child.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString("utf-8");
    });
    child.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString("utf-8");
    });
    child.on("error", (e) => {
      reject(new Error(`VIDEO_CLIPS_250_INVALID: 执行 ffmpeg 失败：${e.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const msg = `${stderr}\n${stdout}`.trim();
      reject(
        new Error(
          `VIDEO_CLIPS_250_INVALID: ffmpeg 返回非零状态 ${formatChildExitStatus(code)}\n${clipProcessLog(msg, 4500)}`,
        ),
      );
    });
  });
}

/** 时长探测须用 ffprobe；-show_entries / -of 等不是 ffmpeg 合法参数 */
function runFfprobe(args: string[]): { stdout: string; stderr: string } {
  const cmd = ffprobeBin();
  const r = spawnSync(cmd, args, { encoding: "utf-8" });
  if (r.error) {
    throw new Error(
      `VIDEO_CLIPS_250_INVALID: 执行 ffprobe 失败：${r.error.message}（若已安装 ffmpeg，请确保同目录有 ffprobe，或设置 FFPROBE_PATH）`,
    );
  }
  if (r.status !== 0) {
    const msg = `${r.stderr ?? ""}\n${r.stdout ?? ""}`.trim();
    throw new Error(
      `VIDEO_CLIPS_250_INVALID: ffprobe 返回非零状态 ${formatChildExitStatus(r.status)}\n${clipProcessLog(msg, 4500)}`,
    );
  }
  return { stdout: r.stdout, stderr: r.stderr };
}

/** 从「audio-170_包含旁白连贯优化后的场景包.json」解析每段字幕：按条保留 voiceover（与画面对齐）；无则 narrative 为单元素数组 */
export function buildSubtitleBySegmentFromVoiceoverPackRaw(raw: Record<string, unknown>): Map<number, string[]> {
  const segments = parseMergedNarrativeSegmentsFromMergeRaw(raw, "VIDEO_CLIPS_250_INVALID");
  const m = new Map<number, string[]>();
  for (const row of segments) {
    const vo = row.voiceover;
    if (Array.isArray(vo) && vo.length > 0) {
      const arr = vo.map((s) => String(s).trim()).filter((s) => s.length > 0);
      if (arr.length > 0) {
        m.set(row.segmentIndex, arr);
        continue;
      }
    }
    const nar = row.narrative;
    if (Array.isArray(nar) && nar.length > 0) {
      const t = nar.join(" ").trim();
      if (t) {
        m.set(row.segmentIndex, [t]);
      }
    }
  }
  return m;
}

function secondsToSrtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const frac = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(frac).padStart(3, "0")}`;
}

function escapeSrtText(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .trim();
}

function wrapSubtitleBody(text: string, lineChars: number, maxLines: number): string {
  const lines: string[] = [];
  let i = 0;
  while (i < text.length && lines.length < maxLines) {
    lines.push(text.slice(i, i + lineChars));
    i += lineChars;
  }
  if (i < text.length && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(0, lineChars - 1))}…`;
  }
  return lines.join("\n");
}

/**
 * 将旁白行与每镜时长对齐为 SRT cue；单镜多句合并为一句；句少镜多末句填充；句多镜多截断到镜数。
 */
function getSubtitleCuesForSegment(
  lines: string[] | undefined,
  durations: number[],
): { text: string; durationSec: number }[] {
  if (!lines?.length || durations.length === 0) {
    return [];
  }
  const trimmed = lines.map((s) => String(s).trim()).filter((s) => s.length > 0);
  if (trimmed.length === 0) {
    return [];
  }
  const n = durations.length;
  // 单输出时长：多句合并为一条（整段一字幕）
  if (n === 1 && trimmed.length > 1) {
    return [{ text: trimmed.join(" "), durationSec: durations[0] }];
  }
  if (trimmed.length === 1) {
    const total = durations.reduce((a, b) => a + b, 0);
    return [{ text: trimmed[0], durationSec: total }];
  }
  const texts: string[] = [];
  if (trimmed.length >= n) {
    for (let i = 0; i < n; i++) {
      texts.push(trimmed[i]);
    }
  } else {
    for (let i = 0; i < n; i++) {
      texts.push(trimmed[Math.min(i, trimmed.length - 1)]);
    }
  }
  return durations.map((durationSec, i) => ({ text: texts[i], durationSec }));
}

type SubtitleCueForSrt = { text: string; durationSec: number; advanceSec: number };

/** 多条时间轴字幕（按画面分段）；advanceSec 为时间线推进（含句间留白），可与字幕显示时长 durationSec 不同 */
function buildSrtFromTimedCues(cues: SubtitleCueForSrt[]): string {
  let t = 0;
  const blocks: string[] = [];
  let index = 1;
  for (const c of cues) {
    const text = c.text.trim();
    const d = Math.max(0.001, c.durationSec);
    const advance = Math.max(0.001, c.advanceSec);
    if (!text) {
      t += advance;
      continue;
    }
    const start = t;
    const end = Math.max(start + 0.04, t + d - 0.04);
    const safe = escapeSrtText(text);
    const body = wrapSubtitleBody(safe, 24, 10);
    blocks.push(`${index}\n${secondsToSrtTime(start)} --> ${secondsToSrtTime(end)}\n${body}`);
    index += 1;
    t += advance;
  }
  return `${blocks.join("\n\n")}\n`;
}

/** 句间留白时：字幕仍按「说话时长」显示，但下一条 cue 的起始时间要跳过留白 */
function attachTimelineAdvances(
  cues: { text: string; durationSec: number }[],
  speechDurations: number[],
  pauseSec: number,
): SubtitleCueForSrt[] {
  if (pauseSec <= 0) {
    return cues.map((c) => ({ ...c, advanceSec: c.durationSec }));
  }
  if (cues.length === speechDurations.length && cues.length > 0) {
    return cues.map((c, i) => ({
      ...c,
      advanceSec: speechDurations[i] + pauseSec,
    }));
  }
  if (cues.length === 1 && speechDurations.length > 0) {
    const n = speechDurations.length;
    const totalAdvance =
      speechDurations.reduce((a, b) => a + b, 0) + n * pauseSec;
    return [{ ...cues[0], advanceSec: totalAdvance }];
  }
  return cues.map((c) => ({ ...c, advanceSec: c.durationSec }));
}

function writeSegmentSrtFile(
  srtAbs: string,
  lines: string[] | undefined,
  durations: number[],
  interScenePauseSec = 0,
): boolean {
  const cues = getSubtitleCuesForSegment(lines, durations);
  if (cues.length === 0) {
    return false;
  }
  const withAdvances = attachTimelineAdvances(cues, durations, interScenePauseSec);
  fs.writeFileSync(srtAbs, buildSrtFromTimedCues(withAdvances), "utf-8");
  return true;
}

/** subtitles= 滤镜内路径：盘符后冒号转义，统一正斜杠 */
function ffmpegSubtitlesFileArg(absSrtPath: string): string {
  let s = path.resolve(absSrtPath).replace(/\\/g, "/");
  s = s.replace(/^([A-Za-z]):/, "$1\\:");
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function subtitleForceStyle(): string {
  const fontName = (process.env.VIDEO_SUBTITLE_FONT_NAME ?? "Microsoft YaHei").trim() || "Microsoft YaHei";
  const n = Number.parseInt(process.env.VIDEO_SUBTITLE_FONT_SIZE ?? "20", 10);
  const fontSize = Number.isFinite(n) && n >= 10 && n <= 96 ? n : 20;
  return `FontName=${fontName},FontSize=${fontSize},Outline=1,Shadow=1,Alignment=2,MarginV=48`;
}

/** filter_complex 中在 [outv] 后烧录字幕，输出 [vsub] */
function filterComplexSubtitlesFromOutv(srtAbs: string): string {
  const f = subtitleForceStyle();
  return `[outv]subtitles=${ffmpegSubtitlesFileArg(srtAbs)}:charenc=UTF-8:force_style='${f.replace(/'/g, "\\'")}'[vsub]`;
}

/** 从 `.../scene-0001.png` 或 `.../scene-0001.mp3` 解析画面序号 */
export function parseSceneIndexFromMediaRelativePath(relativePath: string): number | undefined {
  const n = relativePath.replace(/\\/g, "/");
  const m = /[/\\]scene-(\d+)\.(?:png|jpg|jpeg|webp|mp3)$/i.exec(n);
  if (!m) {
    return undefined;
  }
  const v = Number.parseInt(m[1], 10);
  return Number.isFinite(v) ? v : undefined;
}

function resolveSceneIndexForMedia(item: { relativePath: string; sceneIndex?: number }): number {
  if (item.sceneIndex !== undefined && Number.isFinite(item.sceneIndex)) {
    return item.sceneIndex;
  }
  return parseSceneIndexFromMediaRelativePath(item.relativePath) ?? 0;
}

function getAudioDuration(audioPath: string): number {
  const result = runFfprobe([
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    audioPath,
  ]);
  const durationStr = result.stdout.trim();
  const duration = parseFloat(durationStr);
  if (isNaN(duration)) {
    throw new Error(`VIDEO_CLIPS_250_INVALID: 无法获取音频时长：${audioPath}`);
  }
  return duration;
}

export function parseImageIndexesFromPipeline(raw: Record<string, unknown>): ImageIndexItem[] {
  const arr = raw.imageIndexes;
  if (!Array.isArray(arr)) {
    throw new Error("VIDEO_CLIPS_250_INVALID: imageIndexes 须为数组（来自 包含图片位置的场景包.json）");
  }
  const out: ImageIndexItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`VIDEO_CLIPS_250_INVALID: imageIndexes 第 ${i + 1} 条须为对象`);
    }
    const o = item as Record<string, unknown>;
    if (o.done === false) {
      continue;
    }
    const si = Number(o.segmentIndex);
    const rp = typeof o.relativePath === "string" ? o.relativePath.trim() : "";
    if (!Number.isFinite(si) || !rp) {
      throw new Error(`VIDEO_CLIPS_250_INVALID: imageIndexes 第 ${i + 1} 条 segmentIndex/relativePath 无效`);
    }
    const sceneIdx = o.sceneIndex;
    const siScene =
      typeof sceneIdx === "number" && Number.isFinite(sceneIdx)
        ? sceneIdx
        : parseSceneIndexFromMediaRelativePath(rp);
    out.push({
      segmentIndex: si,
      relativePath: rp,
      ...(typeof o.prompt === "string" ? { prompt: o.prompt } : {}),
      ...(siScene !== undefined ? { sceneIndex: siScene } : {}),
    });
  }
  return out;
}

export function parseAudioRelationsFromPipeline(raw: Record<string, unknown>): AudioIndexItem[] {
  const arr = raw.sceneAudioRelations;
  if (!Array.isArray(arr)) {
    throw new Error("VIDEO_CLIPS_250_INVALID: sceneAudioRelations 须为数组（来自 音频的存储位置和对应的场景关系.json）");
  }
  const out: AudioIndexItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`VIDEO_CLIPS_250_INVALID: sceneAudioRelations 第 ${i + 1} 条须为对象`);
    }
    const o = item as Record<string, unknown>;
    const si = Number(o.segmentIndex);
    const rp = typeof o.relativePath === "string" ? o.relativePath.trim() : "";
    if (!Number.isFinite(si) || !rp) {
      throw new Error(`VIDEO_CLIPS_250_INVALID: sceneAudioRelations 第 ${i + 1} 条 segmentIndex/relativePath 无效`);
    }
    const sc = o.sceneIndex;
    const sceneIdx =
      typeof sc === "number" && Number.isFinite(sc) ? sc : parseSceneIndexFromMediaRelativePath(rp);
    out.push({
      segmentIndex: si,
      relativePath: rp,
      ...(sceneIdx !== undefined ? { sceneIndex: sceneIdx } : {}),
    });
  }
  return out;
}

type SegmentClipTask = {
  segmentIndex: number;
  ffmpegArgs: string[];
  manifest: VideoClipIndexItem;
};

export async function generateVideoClipsFromImageAndAudio(params: {
  workspaceRoot: string;
  imageIndexes: ImageIndexItem[];
  audioIndexes: AudioIndexItem[];
  videoRelativeDir: string;
  /** 每段旁白按句（与画面对齐；通常来自「audio-170_包含旁白连贯优化后的场景包.json」） */
  subtitleBySegment?: Map<number, string[]>;
  tailUserImagesBySegment?: Map<number, string[]>;
}): Promise<VideoClipIndexItem[]> {
  const audiosBySeg = new Map<number, AudioIndexItem[]>();
  for (const a of params.audioIndexes) {
    if (!audiosBySeg.has(a.segmentIndex)) {
      audiosBySeg.set(a.segmentIndex, []);
    }
    audiosBySeg.get(a.segmentIndex)?.push(a);
  }

  const imagesBySeg = new Map<number, ImageIndexItem[]>();
  for (const img of params.imageIndexes) {
    if (!imagesBySeg.has(img.segmentIndex)) {
      imagesBySeg.set(img.segmentIndex, []);
    }
    imagesBySeg.get(img.segmentIndex)?.push(img);
  }

  const videoAbsDir = path.join(params.workspaceRoot, params.videoRelativeDir);
  fs.mkdirSync(videoAbsDir, { recursive: true });

  // 1) 串行构造每段 ffmpeg 命令（含校验、ffprobe 取时长、SRT 写盘），不实际启动 ffmpeg。
  //    所有校验在这里集中失败，便于一眼定位是「数据/对齐」问题还是「ffmpeg 编码」问题。
  const tasks: SegmentClipTask[] = [];
  for (const [segmentIndex, rawImages] of imagesBySeg.entries()) {
    const audios = audiosBySeg.get(segmentIndex);
    if (!audios?.length) {
      throw new Error(`VIDEO_CLIPS_250_INVALID: segmentIndex=${segmentIndex} 未找到对应音频索引`);
    }

    const images = [...rawImages].sort((a, b) => resolveSceneIndexForMedia(a) - resolveSceneIndexForMedia(b));
    const sortedAudios = [...audios].sort((a, b) => resolveSceneIndexForMedia(a) - resolveSceneIndexForMedia(b));
    const tailUserImageRelativePaths = params.tailUserImagesBySegment?.get(segmentIndex) ?? [];
    const tailUserImageAbsPaths = tailUserImageRelativePaths.map((p) => path.join(params.workspaceRoot, p));
    const tailImageSeconds = getTailUserImageSeconds();
    const interScenePauseSec = getInterScenePauseSeconds();

    for (const img of images) ensureOkFile(path.join(params.workspaceRoot, img.relativePath), "图片");
    for (const a of sortedAudios) ensureOkFile(path.join(params.workspaceRoot, a.relativePath), "音频");
    for (const tailAbs of tailUserImageAbsPaths) ensureOkFile(tailAbs, "尾部用户图片");

    const videoName = `segment-${String(segmentIndex).padStart(4, "0")}.mp4`;
    const videoRel = `${params.videoRelativeDir}/${videoName}`;
    const videoAbs = path.join(params.workspaceRoot, videoRel);
    const subLines = params.subtitleBySegment?.get(segmentIndex);
    const srtAbs = path.join(videoAbsDir, `${videoName.replace(/\.mp4$/i, "")}.srt`);
    if (!(images.length === sortedAudios.length && images.length >= 1)) {
      throw new Error(
        `VIDEO_CLIPS_250_INVALID: segmentIndex=${segmentIndex} 图片 ${images.length} 张与音频 ${sortedAudios.length} 条无法对齐（须与分镜音频条数一致）`,
      );
    }
    for (let i = 0; i < images.length; i++) {
      if (resolveSceneIndexForMedia(images[i]) !== resolveSceneIndexForMedia(sortedAudios[i])) {
        throw new Error(
          `VIDEO_CLIPS_250_INVALID: segmentIndex=${segmentIndex} 第 ${i + 1} 个画面与音频 sceneIndex 不一致（图 ${resolveSceneIndexForMedia(images[i])} / 音 ${resolveSceneIndexForMedia(sortedAudios[i])}）`,
        );
      }
    }
    const n = images.length;
    const durations: number[] = [];
    for (const a of sortedAudios) durations.push(getAudioDuration(path.join(params.workspaceRoot, a.relativePath)));

    const ffmpegArgs: string[] = ["-y"];
    for (const img of images) ffmpegArgs.push("-loop", "1", "-i", path.join(params.workspaceRoot, img.relativePath));
    for (const a of sortedAudios) ffmpegArgs.push("-i", path.join(params.workspaceRoot, a.relativePath));
    for (const tailAbs of tailUserImageAbsPaths) ffmpegArgs.push("-loop", "1", "-i", tailAbs);

    const filterComplexParts: string[] = [];
    for (let i = 0; i < n; i++) {
      const d = durations[i] + interScenePauseSec;
      filterComplexParts.push(
        `[${i}:v]trim=start=0:duration=${d},setpts=PTS-STARTPTS,scale=${SLIDESHOW_CANVAS}:force_original_aspect_ratio=decrease,pad=${SLIDESHOW_CANVAS}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1[img${i}]`,
      );
    }
    const imgInputs = images.map((_, i) => `[img${i}]`).join("");
    filterComplexParts.push(`${imgInputs}concat=n=${n}:v=1:a=0[outv]`);
    const audioBuild = buildAudioConcatWithOptionalPauses({
      audioInputIndices: sortedAudios.map((_, i) => n + i),
      pauseSec: interScenePauseSec,
    });
    filterComplexParts.push(...audioBuild.filterParts);

    let videoMapLabel = "outv";
    if (writeSegmentSrtFile(srtAbs, subLines, durations, interScenePauseSec)) {
      filterComplexParts.push(filterComplexSubtitlesFromOutv(srtAbs));
      videoMapLabel = "vsub";
    }
    let videoMap = `[${videoMapLabel}]`;
    let audioMap = `[${audioBuild.outLabel}]`;
    if (tailUserImageAbsPaths.length > 0) {
      const tailFilter = appendTailUserImagesFilter({
        originalVideoLabel: videoMapLabel,
        originalAudioLabel: audioBuild.outLabel,
        tailInputStartIndex: n + n,
        tailImagesCount: tailUserImageAbsPaths.length,
        perImageSec: tailImageSeconds,
      });
      filterComplexParts.push(...tailFilter.filterParts);
      videoMap = `[${tailFilter.finalV}]`;
      audioMap = `[${tailFilter.finalA}]`;
    }

    ffmpegArgs.push("-filter_complex", filterComplexParts.join(";"));
    ffmpegArgs.push("-map", videoMap, "-map", audioMap);
    // `-preset veryfast`：静帧+TTS 拼接的画面对编码质量要求很低，veryfast 较默认 medium 可快 2–3 倍，体积略大可忽略。
    ffmpegArgs.push(
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-tune", "stillimage",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      videoAbs,
    );

    tasks.push({
      segmentIndex,
      ffmpegArgs,
      manifest: {
        segmentIndex,
        imageRelativePath: images[0].relativePath,
        audioRelativePath: sortedAudios[0].relativePath,
        videoRelativePath: videoRel,
        ...(tailUserImageRelativePaths.length > 0 ? { tailUserImageRelativePaths } : {}),
      },
    });
  }

  // 2) 并行启动 ffmpeg 子进程：各段彼此独立、共享同一目录但写不同 mp4 文件，无竞争。
  await parallelLimitFailFast(tasks, step250VideoClipsConcurrency(), async (task) => {
    await runFfmpegAsync(task.ffmpegArgs);
  });

  // 3) manifest 按 segmentIndex 升序输出，便于 250 顺序合并与人工排查
  return tasks
    .map((t) => t.manifest)
    .sort((a, b) => a.segmentIndex - b.segmentIndex);
}

