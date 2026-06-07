import path from "node:path";
import type { PolishedEventSummariesContextExpandedItem } from "../../shared/llm/steps/step70ContextExpand.js";
import { chatJson, getVideoLlmEnv, stringifyForAi } from "../../shared/llm/client.js";
import {
  PIPELINE_SEGMENT_REFINE_FILE,
  PIPELINE_SUBDIR,
} from "../../shared/constants/prepFilenames.js";
import { readJsonObjectFile, writeJsonAtomic } from "../../shared/orchestrator/pipelineDisk.js";
import type { VideoTaskPaths } from "../../shared/orchestrator/videoTaskWorkspace.js";
import {
  STUDIO_SCRIPT_REL,
  studioPathUnderPipeline,
} from "../constants/studioFilenames.js";
import { loadInterviewStudioPromptParts } from "./loadStudioPrompt.js";

const PROMPT_FILE = "studio-10_interview-studio-script.md";
const ERR = "INTERVIEW_STUDIO_SCRIPT_INVALID";

export type InterviewSpeaker = "host" | "guest";
export type InterviewQaGranularity = "hybrid" | "per_event" | "batch";

export type InterviewTurn = {
  speaker: InterviewSpeaker;
  text: string;
};

export type InterviewStudioScriptDurationAlign = {
  bucketSec: number;
  iterations: number;
  allInWindow: boolean;
  alignedAt: string;
};

export type InterviewStudioScriptFile = {
  savedAt: string;
  qaGranularity: InterviewQaGranularity;
  inputSegmentRefineFile: string;
  turns: InterviewTurn[];
  skippedModel: boolean;
  durationAlign?: InterviewStudioScriptDurationAlign;
};

export type StudioScriptLlmEvent = {
  narrative: string;
  timeLabel: string;
  title?: string;
};

/** iv_script LLM 入参：去掉 segmentIndex，事件顺序由数组下标隐含。 */
export function studioScriptPipelineForLlm(params: {
  events: PolishedEventSummariesContextExpandedItem[];
  qaGranularity: InterviewQaGranularity;
}): { qaGranularity: InterviewQaGranularity; splitDedupedTimelineSegments: StudioScriptLlmEvent[] } {
  return {
    qaGranularity: params.qaGranularity,
    splitDedupedTimelineSegments: params.events.map(({ narrative, timeLabel, title }) => ({
      narrative,
      timeLabel,
      ...(title ? { title } : {}),
    })),
  };
}

export function assertInterviewTurnsShape(parsed: unknown): InterviewTurn[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${ERR}: 模型输出须为 JSON 对象`);
  }
  const root = parsed as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length !== 1 || !Object.prototype.hasOwnProperty.call(root, "turns")) {
    throw new Error(`${ERR}: 顶层须仅含 turns，当前键: ${keys.join(",")}`);
  }
  const turnsRaw = root.turns;
  if (!Array.isArray(turnsRaw) || turnsRaw.length < 6) {
    throw new Error(`${ERR}: turns 须为非空数组且至少 6 条`);
  }
  const out: InterviewTurn[] = [];
  let hostCount = 0;
  let guestCount = 0;
  for (let i = 0; i < turnsRaw.length; i++) {
    const row = turnsRaw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`${ERR}: turns[${i}] 须为对象`);
    }
    const o = row as Record<string, unknown>;
    const extra = Object.keys(o).filter((k) => k !== "speaker" && k !== "text");
    if (extra.length > 0) {
      throw new Error(`${ERR}: turns[${i}] 含多余键: ${extra.join(",")}`);
    }
    const sp = o.speaker === "guest" ? "guest" : o.speaker === "host" ? "host" : "";
    if (!sp) throw new Error(`${ERR}: turns[${i}].speaker 须为 host 或 guest`);
    if (sp === "host") hostCount++;
    else guestCount++;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) throw new Error(`${ERR}: turns[${i}].text 须为非空字符串`);
    out.push({ speaker: sp, text });
  }
  if (hostCount === 0 || guestCount === 0) {
    throw new Error(`${ERR}: 脚本须同时包含主持人与被采访者发言`);
  }
  return out;
}

export function loadSegmentRefineEvents(pipelineDir: string): PolishedEventSummariesContextExpandedItem[] {
  const p = path.join(pipelineDir, PIPELINE_SEGMENT_REFINE_FILE);
  const raw = readJsonObjectFile(p);
  const arr = raw.splitDedupedTimelineSegments;
  if (!Array.isArray(arr)) {
    throw new Error(`${ERR}: 步骤 80 JSON 缺少 splitDedupedTimelineSegments`);
  }
  const out: PolishedEventSummariesContextExpandedItem[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const segmentIndex = typeof o.segmentIndex === "number" && Number.isFinite(o.segmentIndex) ? o.segmentIndex : null;
    const narrative = typeof o.narrative === "string" ? o.narrative.trim() : "";
    const timeLabel = typeof o.timeLabel === "string" ? o.timeLabel.trim() : "";
    if (segmentIndex === null || !narrative || !timeLabel) continue;
    out.push({
      segmentIndex,
      narrative,
      timeLabel,
      ...(typeof o.title === "string" && o.title.trim() ? { title: o.title.trim() } : {}),
    });
  }
  if (out.length === 0) {
    throw new Error(`${ERR}: 步骤 80 中无可用事件条目`);
  }
  return out;
}

function stubTurns(): InterviewTurn[] {
  const lines: Array<[InterviewSpeaker, string]> = [
    ["host", "Today let's talk about a few chapters that shaped your life. Shall we start with your early years?"],
    ["guest", "Sure. We weren't wealthy, but my parents really valued education."],
    ["host", "Later in school or work, was there a moment that felt like a big turning point?"],
    ["guest", "Yes. The first time I left home for another city, I was nervous and excited."],
    ["host", "After that, what family or career moment still stays with you?"],
    ["guest", "After I started my own family, responsibility grew, and I learned to cherish people close to me."],
  ];
  return lines.map(([speaker, text]) => ({ speaker, text }));
}

async function callInterviewStudioScriptLlm(
  pipelineStr: string,
  debugStepId: string,
): Promise<unknown> {
  const { systemText, userSuffix } = loadInterviewStudioPromptParts(PROMPT_FILE);
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);
  return chatJson<unknown>(
    [
      { role: "system", content: systemText },
      { role: "user", content: userContent },
    ],
    { debugStepId, temperature: debugStepId.includes("repair") ? 0.15 : 0.25, useJsonObject: true },
  );
}

export async function runInterviewStudioScriptFromEvents(params: {
  events: PolishedEventSummariesContextExpandedItem[];
  qaGranularity: InterviewQaGranularity;
}): Promise<InterviewTurn[]> {
  if (process.env.STUDIO_SCRIPT_STUB === "1") {
    return stubTurns();
  }
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }
  const pipelineStr = stringifyForAi(studioScriptPipelineForLlm(params));

  try {
    const parsed = await callInterviewStudioScriptLlm(pipelineStr, "iv_script");
    return assertInterviewTurnsShape(parsed);
  } catch (firstErr) {
    if (!(firstErr instanceof Error) || !firstErr.message.startsWith(`${ERR}:`)) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`${ERR}: 模型调用或 JSON 解析失败。${msg}`);
    }
    const guidance = `【服务端校验未通过，请修正后重新输出】\n${firstErr.message}\n\n硬性约束：顶层仅含 turns；每条仅 speaker+text；至少 6 条且须同时含 host 与 guest；不要 sourceSegmentIndexes。`;
    const { systemText, userSuffix } = loadInterviewStudioPromptParts(PROMPT_FILE);
    const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);
    const parsed2 = await chatJson<unknown>(
      [
        { role: "system", content: systemText },
        { role: "user", content: userContent },
        { role: "user", content: guidance },
      ],
      { debugStepId: "iv_script_repair", temperature: 0.15, useJsonObject: true },
    );
    return assertInterviewTurnsShape(parsed2);
  }
}

export async function runStudioScriptStep(
  paths: VideoTaskPaths,
  qaGranularity: InterviewQaGranularity = "hybrid",
): Promise<{ scriptPath: string; turnCount: number; skippedModel: boolean }> {
  const events = loadSegmentRefineEvents(paths.pipelineDir);
  const turns = await runInterviewStudioScriptFromEvents({ events, qaGranularity });
  const outPath = studioPathUnderPipeline(paths.pipelineDir, STUDIO_SCRIPT_REL);
  const payload: InterviewStudioScriptFile = {
    savedAt: new Date().toISOString(),
    qaGranularity,
    inputSegmentRefineFile: `${PIPELINE_SUBDIR}/${PIPELINE_SEGMENT_REFINE_FILE}`,
    turns,
    skippedModel: process.env.STUDIO_SCRIPT_STUB === "1",
  };
  writeJsonAtomic(outPath, payload);
  return { scriptPath: outPath, turnCount: turns.length, skippedModel: payload.skippedModel };
}
