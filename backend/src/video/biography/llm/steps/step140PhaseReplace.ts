import { buildVideoLlmMessages, buildVideoLlmUserContent, stringifyVideoPipeline } from "../../../shared/llm/localeLlm.js";
import { chatJson, getVideoLlmEnv } from "../../../shared/llm/client.js";
import type { CrossValidatedTimelineItem } from "./step110EnvNarrativePack.js";
import { resolveChatMaxItemsPerCall, runChatPerSliceConcat } from "../../../shared/llm/pipelineChunkedChat.js";

const PROMPT_FILE = "step-140_phase-replace.md";
const ERR = "PHASE_REPLACE_140_INVALID";

export type PhaseReplaceInput = {
  crossValidatedTimelineSegments: CrossValidatedTimelineItem[];
};

export type PhaseReplaceOutput = {
  crossValidatedTimelineSegments: CrossValidatedTimelineItem[];
};

function buildVisualScenesFromModel(
  oVisual: unknown,
  narrative: string[],
): { sceneIndex: number; sceneDescription: string }[] {
  return (oVisual as unknown[]).map((scene, idx) => {
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
      return {
        sceneIndex: idx + 1,
        sceneDescription: narrative[idx] || narrative[0]!,
      };
    }
    const sceneObj = scene as Record<string, unknown>;
    return {
      sceneIndex: (sceneObj.sceneIndex as number) || idx + 1,
      sceneDescription: (sceneObj.sceneDescription as string)?.trim() || narrative[idx] || narrative[0]!,
    };
  });
}

function cloneCrossValidatedFromInput(segs: CrossValidatedTimelineItem[]): CrossValidatedTimelineItem[] {
  return JSON.parse(JSON.stringify(segs)) as CrossValidatedTimelineItem[];
}

/** 仅向模型提供划分年龄阶段所需字段（去掉 originalNarrative 等冗余）。 */
function slimSliceForPhaseReplace(slice: CrossValidatedTimelineItem[]) {
  return slice.map((seg) => ({
    segmentIndex: seg.segmentIndex,
    timeLabel: seg.timeLabel,
    narrative: seg.narrative ?? [],
    visualScenes: (seg.visualScenes ?? []).map((vs) => vs.sceneDescription),
  }));
}

/**
 * 将差量补丁合并回输入：仅覆盖补丁中列出的 segmentIndex 的 narrative / visualScenes；
 * 未列出的段原样保留；空补丁表表示无需改动。
 */
function mergePhasePatchesIntoInput(
  input: PhaseReplaceInput,
  patches: unknown[],
): CrossValidatedTimelineItem[] {
  const bySeg = new Map<number, Record<string, unknown>>();
  for (const p of patches) {
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      continue;
    }
    const o = p as Record<string, unknown>;
    if (typeof o.segmentIndex === "number" && Number.isFinite(o.segmentIndex)) {
      if (bySeg.has(o.segmentIndex)) {
        throw new Error(`${ERR}: crossValidatedPhasePatches 中 segmentIndex=${o.segmentIndex} 重复`);
      }
      bySeg.set(o.segmentIndex, o);
    }
  }
  const need = new Set(input.crossValidatedTimelineSegments.map((s) => s.segmentIndex));
  for (const k of bySeg.keys()) {
    if (!need.has(k)) {
      throw new Error(`${ERR}: crossValidatedPhasePatches 含多余 segmentIndex: ${k}`);
    }
  }
  return input.crossValidatedTimelineSegments.map((base) => {
    const p = bySeg.get(base.segmentIndex);
    if (!p) {
      return { ...base };
    }
    if (!Array.isArray(p.narrative) || p.narrative.length === 0) {
      throw new Error(`${ERR}: 补丁段 ${base.segmentIndex} 的 narrative 须为非空数组`);
    }
    const narrative = p.narrative
      .filter((n): n is string => typeof n === "string" && n.trim() !== "")
      .map((n) => n.trim());
    if (!narrative.length) {
      throw new Error(`${ERR}: 补丁段 ${base.segmentIndex} 的 narrative 去空后为空`);
    }
    if (!Array.isArray(p.visualScenes) || p.visualScenes.length === 0) {
      throw new Error(`${ERR}: 补丁段 ${base.segmentIndex} 的 visualScenes 须为非空数组`);
    }
    const visualScenes = buildVisualScenesFromModel(p.visualScenes, narrative);
    return {
      ...base,
      narrative,
      visualScenes,
    };
  });
}

function parsePhasePatchesFromModel(parsed: unknown, sliceInput: PhaseReplaceInput): CrossValidatedTimelineItem[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${ERR}: 模型输出须为对象`);
  }
  const root = parsed as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(root, "crossValidatedPhasePatches")) {
    throw new Error(
      `${ERR}: 顶层须含 crossValidatedPhasePatches（可为空数组）。当前键: ${Object.keys(root).join(",")}`,
    );
  }
  const rawPatches = root.crossValidatedPhasePatches;
  if (!Array.isArray(rawPatches)) {
    throw new Error(`${ERR}: crossValidatedPhasePatches 须为数组`);
  }
  if (rawPatches.length === 0) {
    return cloneCrossValidatedFromInput(sliceInput.crossValidatedTimelineSegments);
  }
  const out = mergePhasePatchesIntoInput(sliceInput, rawPatches);
  for (let i = 0; i < out.length; i++) {
    if (!out[i]!.narrative?.length) {
      throw new Error(`${ERR}: 第 ${i + 1} 条 narrative 为空`);
    }
    if (!Array.isArray(out[i]!.visualScenes) || out[i]!.visualScenes!.length === 0) {
      throw new Error(`${ERR}: 第 ${i + 1} 条 visualScenes 为空`);
    }
  }
  return out;
}

async function runPhaseReplaceForSlice(
  slice: CrossValidatedTimelineItem[],
): Promise<CrossValidatedTimelineItem[]> {
  const sliceInput: PhaseReplaceInput = { crossValidatedTimelineSegments: slice };
  const { messages: baseMessages } = buildVideoLlmMessages(PROMPT_FILE, {
    crossValidatedTimelineSegments: slimSliceForPhaseReplace(slice),
  });

  const callForPatches = async (debugStepId: string, extraGuidance?: string): Promise<CrossValidatedTimelineItem[]> => {
    const messages = [...baseMessages];
    if (extraGuidance) {
      messages.push({ role: "user" as const, content: extraGuidance });
    }
    let parsed: unknown;
    try {
      parsed = await chatJson<unknown>(messages, {
        debugStepId,
        temperature: extraGuidance ? 0.1 : 0.25,
        useJsonObject: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`${ERR}: 模型调用或 JSON 解析失败。${msg}`);
    }
    return parsePhasePatchesFromModel(parsed, sliceInput);
  };

  try {
    return await callForPatches("phase_replace_140");
  } catch (firstErr) {
    if (!(firstErr instanceof Error) || !firstErr.message.startsWith(`${ERR}:`)) {
      throw firstErr;
    }
    const guidance = `【服务端校验未通过，请修正后重新输出】\n${firstErr.message}\n\n硬性约束：顶层仅含 crossValidatedPhasePatches；无需改动的段不要列入；每条补丁须含 segmentIndex、narrative（字符串数组）、visualScenes（与 narrative 等长）；无需任何改动时返回空数组 []。不要回吐时间线全文。`;
    return callForPatches("phase_replace_140_repair", guidance);
  }
}

export async function runPhaseReplaceFromPipelineJson(
  input: PhaseReplaceInput,
): Promise<PhaseReplaceOutput> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const chunkSize = resolveChatMaxItemsPerCall();

  const merged = await runChatPerSliceConcat<CrossValidatedTimelineItem, CrossValidatedTimelineItem>({
    items: input.crossValidatedTimelineSegments,
    chunkSize,
    runOnce: (slice) => runPhaseReplaceForSlice(slice),
  });

  return { crossValidatedTimelineSegments: merged };
}
