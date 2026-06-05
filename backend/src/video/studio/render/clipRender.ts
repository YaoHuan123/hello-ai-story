import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { VideoClipIndexRow } from "../../biography/render/step260MergeVideoClips.js";
import { writeJsonAtomic } from "../../shared/orchestrator/pipelineDisk.js";
import type { VideoTaskPaths } from "../../shared/orchestrator/videoTaskWorkspace.js";
import { studioClipIndexRel, studioClipSubdirRel } from "../constants/studioFilenames.js";
import type { InterviewSpeaker } from "../llm/studioScript.js";
import { loadStudioTurnsAndAudioFiles } from "./studioTts.js";
import {
  ensureVideoPackReady,
  interviewAudioTempoBudget,
  scheduleTurnClipSequence,
  type InterviewPosition,
  type InterviewTurnEndPosition,
} from "./videoPack.js";

const ERR = "INTERVIEW_CLIP_RENDER_INVALID";

let videoPackValidated = false;

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

function runFfmpeg(args: string[]): void {
  const cmd = ffmpegBin();
  const r = spawnSync(cmd, args, { encoding: "utf-8" });
  if (r.error) throw new Error(`${ERR}: 执行 ffmpeg 失败：${r.error.message}`);
  if (r.status !== 0) {
    const msg = `${r.stderr ?? ""}\n${r.stdout ?? ""}`.trim();
    throw new Error(`${ERR}: ffmpeg 返回非零状态 ${r.status}\n${msg.slice(0, 2500)}`);
  }
}

function runFfprobeDuration(audioAbs: string): number {
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
      audioAbs,
    ],
    { encoding: "utf-8" },
  );
  if (r.error || r.status !== 0) {
    throw new Error(`${ERR}: ffprobe 失败：${r.stderr ?? r.error?.message ?? ""}`);
  }
  const v = Number.parseFloat(String(r.stdout ?? "").trim());
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${ERR}: 无法解析音频时长：${audioAbs}`);
  }
  return v;
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

function buildSingleCueSrt(durationSec: number, text: string): string {
  const end = Math.max(0.04, durationSec - 0.04);
  const body = wrapSubtitleBody(escapeSrtText(text), 24, 8);
  return `1\n${secondsToSrtTime(0)} --> ${secondsToSrtTime(end)}\n${body}\n\n`;
}

function ffmpegSubtitlesFileArg(absSrtPath: string): string {
  let s = path.resolve(absSrtPath).replace(/\\/g, "/");
  s = s.replace(/^([A-Za-z]):/, "$1\\:");
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function subtitleForceStyle(): string {
  const n = Number.parseInt(process.env.VIDEO_SUBTITLE_FONT_SIZE ?? "20", 10);
  const fontSize = Number.isFinite(n) && n >= 10 && n <= 96 ? n : 20;
  return `FontSize=${fontSize},Outline=1,Shadow=1,Alignment=2,MarginV=48`;
}

function subtitlesFontsDirClause(): string {
  const raw = (process.env.INTERVIEW_SUBTITLE_FONTSDIR ?? "").trim();
  if (!raw) return "";
  let d = path.resolve(raw).replace(/\\/g, "/");
  d = d.replace(/^([A-Za-z]):/, "$1\\:");
  return `:fontsdir='${d.replace(/'/g, "'\\''")}'`;
}

export type InterviewStudioTurnClipFromPackResult = VideoClipIndexRow & {
  endState: InterviewTurnEndPosition;
};

export function ensureInterviewVideoPackClipsReady(): void {
  if (!videoPackValidated) {
    ensureVideoPackReady();
    videoPackValidated = true;
  }
}

export function renderInterviewStudioTurnClipFromPack(params: {
  taskRoot: string;
  segmentIndex: number;
  audioRelativePath: string;
  subtitleLine: string;
  speaker: InterviewSpeaker;
  fromState: InterviewPosition;
}): InterviewStudioTurnClipFromPackResult {
  ensureInterviewVideoPackClipsReady();

  const { taskRoot, segmentIndex, audioRelativePath, subtitleLine, speaker, fromState } = params;
  const audioAbs = path.join(taskRoot, audioRelativePath.split("/").join(path.sep));
  if (!fs.existsSync(audioAbs)) {
    throw new Error(`${ERR}: 缺少访谈音频 ${audioAbs}`);
  }
  const audioDur = runFfprobeDuration(audioAbs);

  const scheduled = scheduleTurnClipSequence({ speaker, fromState, audioDurSec: audioDur });

  const clipSub = studioClipSubdirRel();
  const clipDir = path.join(taskRoot, clipSub.split("/").join(path.sep));
  fs.mkdirSync(clipDir, { recursive: true });
  const videoName = `segment-${String(segmentIndex).padStart(4, "0")}.mp4`;
  const videoRel = `${clipSub}/${videoName}`;
  const videoAbs = path.join(taskRoot, videoRel.split("/").join(path.sep));
  const srtAbs = path.join(clipDir, `${videoName.replace(/\.mp4$/i, "")}.srt`);

  const tStar = scheduled.totalVideoDurSec;
  if (!Number.isFinite(tStar) || tStar <= 0) {
    throw new Error(`${ERR}: 无效 totalVideoDurSec=${tStar}（segment=${segmentIndex}）`);
  }
  const budget = interviewAudioTempoBudget();
  const tempo = audioDur / tStar;
  if (!Number.isFinite(tempo) || tempo <= 0 || Math.abs(1 - tempo) > budget + 1e-9) {
    throw new Error(
      `${ERR}: 口播与 T* 比例超出 INTERVIEW_AUDIO_TEMPO_BUDGET（segment=${segmentIndex}）：audio=${audioDur.toFixed(3)}s T*=${tStar.toFixed(3)}s tempo=${tempo.toFixed(4)} budget=${budget}。请先重跑 iv_duration_align`,
    );
  }

  fs.writeFileSync(srtAbs, buildSingleCueSrt(tStar, subtitleLine), "utf-8");

  const fStyle = subtitleForceStyle();
  const fontsDir = subtitlesFontsDirClause();
  const subArg = ffmpegSubtitlesFileArg(srtAbs);
  const fStyleEsc = fStyle.replace(/'/g, "\\'");
  const tStr = tStar.toFixed(9);
  const tempoStr = tempo.toFixed(9);

  const inputs: string[] = [];
  for (const c of scheduled.clips) inputs.push("-i", c.absPath);
  inputs.push("-i", audioAbs);
  const audioInputIdx = scheduled.clips.length;

  let videoChain: string;
  if (scheduled.clips.length === 1) {
    videoChain = `[0:v]subtitles=${subArg}:charenc=UTF-8${fontsDir}:force_style='${fStyleEsc}'[vsub]`;
  } else {
    const vIns = scheduled.clips.map((_, idx) => `[${idx}:v]`).join("");
    const vConcat = `${vIns}concat=n=${scheduled.clips.length}:v=1:a=0[vcat]`;
    videoChain = `${vConcat};[vcat]subtitles=${subArg}:charenc=UTF-8${fontsDir}:force_style='${fStyleEsc}'[vsub]`;
  }
  const audioChain = `[${audioInputIdx}:a]atempo=${tempoStr},asetpts=PTS-STARTPTS,atrim=duration=${tStr},apad=whole_dur=${tStr}[outa]`;
  const filterComplex = `${videoChain};${audioChain}`;

  runFfmpeg([
    "-y",
    ...inputs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[vsub]",
    "-map",
    "[outa]",
    "-t",
    tStr,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    videoAbs,
  ]);

  return {
    segmentIndex,
    imageRelativePath: "",
    audioRelativePath: audioRelativePath.replace(/\\/g, "/"),
    videoRelativePath: videoRel.replace(/\\/g, "/"),
    endState: scheduled.endState,
  };
}

export async function runStudioClipsStep(paths: VideoTaskPaths): Promise<{
  clipIndexRel: string;
  clipCount: number;
}> {
  const { turns, files } = loadStudioTurnsAndAudioFiles(paths.pipelineDir);
  const clips: VideoClipIndexRow[] = [];
  let currentState: InterviewPosition = "A";

  for (let i = 0; i < turns.length; i++) {
    const subtitleLine =
      turns[i].speaker === "host" ? `主持人：${turns[i].text}` : `被采访者：${turns[i].text}`;
    const relAudio = files[i];
    const row = renderInterviewStudioTurnClipFromPack({
      taskRoot: paths.taskRoot,
      segmentIndex: i,
      audioRelativePath: relAudio,
      subtitleLine,
      speaker: turns[i].speaker,
      fromState: currentState,
    });
    currentState = row.endState;
    clips.push({
      segmentIndex: row.segmentIndex,
      imageRelativePath: row.imageRelativePath,
      audioRelativePath: row.audioRelativePath,
      videoRelativePath: row.videoRelativePath,
    });
  }

  const clipIndexRel = studioClipIndexRel();
  const clipIndexAbs = path.join(paths.taskRoot, clipIndexRel.split("/").join(path.sep));
  writeJsonAtomic(clipIndexAbs, {
    savedAt: new Date().toISOString(),
    productionMode: "interview_studio",
    videoClipIndexes: clips,
  });
  return { clipIndexRel, clipCount: clips.length };
}
