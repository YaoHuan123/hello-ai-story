import fs from "node:fs";
import { synthesizeSingleSpeechMp3 } from "../../biography/render/step180Tts.js";
import { writeJsonAtomic } from "../../shared/orchestrator/pipelineDisk.js";
import type { VideoTaskPaths } from "../../shared/orchestrator/videoTaskWorkspace.js";
import {
  STUDIO_SCRIPT_REL,
  STUDIO_TTS_BUNDLE_REL,
  studioPathUnderPipeline,
  studioPipelineRelToAbs,
} from "../constants/studioFilenames.js";
import {
  IV_DURATION_ALIGN_MAX_ITERATIONS,
  rewriteSingleTurnToTargetDuration,
} from "../llm/studioTurnRewrite.js";
import {
  assertInterviewTurnsShape,
  type InterviewTurn,
  type InterviewStudioScriptDurationAlign,
} from "../llm/studioScript.js";
import {
  clearProbeDurationCache,
  ensureVideoPackReady,
  interviewAudioTempoBudget,
  isInterviewDurationAlignAcceptable,
  probeClipDurationSec,
  scheduleTurnClipSequence,
  type InterviewPosition,
} from "./videoPack.js";
import { loadStudioTurnsAndAudioFiles } from "./studioTts.js";

const ERR = "INTERVIEW_STUDIO_DURATION_ALIGN_INVALID";

function fromStateForTurnIndex(turns: InterviewTurn[], i: number): InterviewPosition {
  if (i <= 0) return "A";
  return turns[i - 1].speaker === "host" ? "B" : "C";
}

export async function runStudioDurationAlignStep(
  paths: VideoTaskPaths,
  hostVoice: string | undefined,
  guestVoice: string | undefined,
): Promise<{ reused: boolean; iterationsUsed: number }> {
  const host = String(hostVoice ?? "").trim();
  const guest = String(guestVoice ?? "").trim();
  if (!host || !guest) {
    throw new Error(`${ERR}: interview_studio 须同时提供 hostVoice 与 guestVoice`);
  }

  ensureVideoPackReady();
  const { turns: initialTurns, files, scriptRaw } = loadStudioTurnsAndAudioFiles(paths.pipelineDir);
  const turns = [...initialTurns];
  const scriptPath = studioPathUnderPipeline(paths.pipelineDir, STUDIO_SCRIPT_REL);
  const bundlePath = studioPathUnderPipeline(paths.pipelineDir, STUDIO_TTS_BUNDLE_REL);

  const probeDurationAtIndex = (i: number): number => {
    const rel = files[i];
    const abs = studioPipelineRelToAbs(paths.pipelineDir, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`${ERR}: 缺少访谈音频 ${rel}`);
    }
    return probeClipDurationSec(abs);
  };

  const collectOutlierIndices = (): number[] => {
    const idx: number[] = [];
    for (let i = 0; i < turns.length; i++) {
      const d = probeDurationAtIndex(i);
      const sch = scheduleTurnClipSequence({
        speaker: turns[i].speaker,
        fromState: fromStateForTurnIndex(turns, i),
        audioDurSec: d,
      });
      if (!isInterviewDurationAlignAcceptable(d, sch.totalVideoDurSec)) idx.push(i);
    }
    return idx;
  };

  const writeScriptPartial = (
    nextTurns: InterviewTurn[],
    durationAlign?: InterviewStudioScriptDurationAlign,
  ): void => {
    const body: Record<string, unknown> = {
      ...scriptRaw,
      savedAt: new Date().toISOString(),
      turns: nextTurns,
    };
    if (durationAlign) body.durationAlign = durationAlign;
    else delete body.durationAlign;
    writeJsonAtomic(scriptPath, body);
  };

  const writeBundleFingerprint = (): void => {
    writeJsonAtomic(bundlePath, {
      savedAt: new Date().toISOString(),
      hostVoice: host,
      guestVoice: guest,
      turnCount: turns.length,
      files,
    });
  };

  let outliers = collectOutlierIndices();
  if (outliers.length === 0) {
    const daRaw = scriptRaw.durationAlign;
    const bsec = (daRaw as Record<string, unknown> | undefined)?.bucketSec;
    const daOk =
      daRaw &&
      typeof daRaw === "object" &&
      !Array.isArray(daRaw) &&
      (bsec === 0 || bsec === 5) &&
      (daRaw as Record<string, unknown>).allInWindow === true;
    if (!daOk) {
      writeScriptPartial(turns, {
        bucketSec: 0,
        iterations: 0,
        allInWindow: true,
        alignedAt: new Date().toISOString(),
      });
    }
    return { reused: true, iterationsUsed: 0 };
  }

  let iterationsUsed = 0;

  for (let i = 0; i < turns.length; i++) {
    let rewritesThisTurn = 0;
    while (true) {
      const d = probeDurationAtIndex(i);
      const sch = scheduleTurnClipSequence({
        speaker: turns[i].speaker,
        fromState: fromStateForTurnIndex(turns, i),
        audioDurSec: d,
      });
      const tStar = sch.totalVideoDurSec;
      if (isInterviewDurationAlignAcceptable(d, tStar)) break;

      if (rewritesThisTurn >= IV_DURATION_ALIGN_MAX_ITERATIONS) {
        const ratio = d / tStar;
        const dev = Math.abs(1 - ratio);
        const budget = interviewAudioTempoBudget();
        if (dev <= budget + 1e-12) {
          break;
        }
        throw new Error(
          `${ERR}: turn=${i + 1} 在 ${IV_DURATION_ALIGN_MAX_ITERATIONS} 次改写后仍未达标：|1−d/T*|=${dev.toFixed(4)} > ${budget}。d=${d.toFixed(2)}s T*=${tStar.toFixed(2)}s（可在 backend/.env 略增大 INTERVIEW_AUDIO_TEMPO_BUDGET，默认 0.12）`,
        );
      }

      const text = turns[i].text;
      const cps = text.length / Math.max(d, 1e-6);
      const targetChars = Math.max(1, Math.round(cps * tStar));
      const newText = await rewriteSingleTurnToTargetDuration({
        speaker: turns[i].speaker,
        currentText: text,
        currentDurationSec: d,
        targetTotalVideoSec: tStar,
        targetCharsEstimate: targetChars,
        deltaChars: targetChars - text.length,
      });
      turns[i] = { ...turns[i], text: newText };
      const voice = turns[i].speaker === "host" ? host : guest;
      const buf = await synthesizeSingleSpeechMp3(newText, voice);
      rewritesThisTurn += 1;
      const rel = files[i];
      const abs = studioPipelineRelToAbs(paths.pipelineDir, rel);
      fs.writeFileSync(abs, buf);
      clearProbeDurationCache(abs);
      iterationsUsed += 1;
      writeScriptPartial(turns);
      writeBundleFingerprint();
    }
  }

  writeScriptPartial(turns, {
    bucketSec: 0,
    iterations: iterationsUsed,
    allInWindow: true,
    alignedAt: new Date().toISOString(),
  });
  writeBundleFingerprint();
  return { reused: false, iterationsUsed };
}
