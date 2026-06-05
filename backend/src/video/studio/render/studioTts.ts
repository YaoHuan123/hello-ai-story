import fs from "node:fs";
import path from "node:path";
import { synthesizeSingleSpeechMp3 } from "../../biography/render/step180Tts.js";
import { readJsonObjectFile, writeJsonAtomic } from "../../shared/orchestrator/pipelineDisk.js";
import type { VideoTaskPaths } from "../../shared/orchestrator/videoTaskWorkspace.js";
import {
  STUDIO_AUDIO_SUBDIR_REL,
  STUDIO_SCRIPT_REL,
  STUDIO_TTS_BUNDLE_REL,
  studioPathUnderPipeline,
} from "../constants/studioFilenames.js";
import { assertInterviewTurnsShape, type InterviewTurn } from "../llm/studioScript.js";

const ERR = "INTERVIEW_STUDIO_TTS_INVALID";

function parseTurnsFromScript(raw: Record<string, unknown>): InterviewTurn[] {
  const turnsIn = raw.turns;
  if (!Array.isArray(turnsIn) || turnsIn.length === 0) {
    throw new Error(`${ERR}: 访谈脚本缺失或为空`);
  }
  const partial: InterviewTurn[] = [];
  for (const row of turnsIn) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const speaker = o.speaker === "guest" ? "guest" : o.speaker === "host" ? "host" : null;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!speaker || !text) continue;
    partial.push({ speaker, text });
  }
  return assertInterviewTurnsShape({ turns: partial });
}

function requireTtsVoices(hostVoice: string | undefined, guestVoice: string | undefined): {
  hostVoice: string;
  guestVoice: string;
} {
  const host = String(hostVoice ?? "").trim();
  const guest = String(guestVoice ?? "").trim();
  if (!host || !guest) {
    throw new Error(`${ERR}: interview_studio 须同时提供 hostVoice 与 guestVoice`);
  }
  return { hostVoice: host, guestVoice: guest };
}

export async function runStudioTtsStep(
  paths: VideoTaskPaths,
  hostVoice: string | undefined,
  guestVoice: string | undefined,
): Promise<{ bundlePath: string; turnCount: number }> {
  const voices = requireTtsVoices(hostVoice, guestVoice);
  const scriptPath = studioPathUnderPipeline(paths.pipelineDir, STUDIO_SCRIPT_REL);
  const scriptRaw = readJsonObjectFile(scriptPath);
  const turns = parseTurnsFromScript(scriptRaw);

  const audioRoot = studioPathUnderPipeline(paths.pipelineDir, STUDIO_AUDIO_SUBDIR_REL);
  fs.mkdirSync(audioRoot, { recursive: true });

  const files: string[] = [];
  for (let i = 0; i < turns.length; i++) {
    const voice = turns[i].speaker === "host" ? voices.hostVoice : voices.guestVoice;
    let buf: Buffer;
    try {
      buf = await synthesizeSingleSpeechMp3(turns[i].text, voice);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `${ERR}: 访谈 TTS 失败（turn=${i + 1}, speaker=${turns[i].speaker}, voice=${voice}）。${msg}`,
      );
    }
    const fn = `turn-${String(i).padStart(4, "0")}.mp3`;
    fs.writeFileSync(path.join(audioRoot, fn), buf);
    files.push(`${STUDIO_AUDIO_SUBDIR_REL}/${fn}`);
  }

  const bundlePath = studioPathUnderPipeline(paths.pipelineDir, STUDIO_TTS_BUNDLE_REL);
  writeJsonAtomic(bundlePath, {
    savedAt: new Date().toISOString(),
    hostVoice: voices.hostVoice,
    guestVoice: voices.guestVoice,
    turnCount: turns.length,
    files,
  });
  return { bundlePath, turnCount: turns.length };
}

export function loadStudioTurnsAndAudioFiles(
  pipelineDir: string,
): { turns: InterviewTurn[]; files: string[]; scriptRaw: Record<string, unknown> } {
  const scriptPath = studioPathUnderPipeline(pipelineDir, STUDIO_SCRIPT_REL);
  const bundlePath = studioPathUnderPipeline(pipelineDir, STUDIO_TTS_BUNDLE_REL);
  const scriptRaw = readJsonObjectFile(scriptPath);
  const bundleRaw = readJsonObjectFile(bundlePath);
  const turns = parseTurnsFromScript(scriptRaw);
  const filesRaw = bundleRaw.files;
  if (!Array.isArray(filesRaw) || filesRaw.length === 0) {
    throw new Error(`${ERR}: 访谈 TTS bundle 缺失 files`);
  }
  const files: string[] = [];
  for (const f of filesRaw) {
    if (typeof f === "string" && f.trim()) files.push(f.trim().replace(/\\/g, "/"));
  }
  if (turns.length !== files.length) {
    throw new Error(`${ERR}: 访谈脚本条数与 TTS bundle files 不一致`);
  }
  return { turns, files, scriptRaw };
}
