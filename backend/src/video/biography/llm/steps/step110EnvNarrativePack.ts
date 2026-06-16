import { chatJson, getVideoLlmEnv } from "../../../shared/llm/client.js";
import { buildVideoLlmMessages } from "../../../shared/llm/localeLlm.js";
import { extractEnvLocationFromText, extractEnvTimeFromText } from "../../../shared/envSceneExtract.js";
import { resolveChatMaxItemsPerCall, runChatPerSliceConcat } from "../../../shared/llm/pipelineChunkedChat.js";

const PROMPT_FILE = "step-110_env-narrative-pack.md";

export type CrossValidatedTimelineItem = {
  segmentIndex: number;
  narrative: string[];
  timeLabel: string;
  originalNarrative: string;
  title?: string;
  visualScenes?: VisualSceneItem[];
};

export type VisualSceneItem = {
  sceneIndex: number;
  sceneDescription: string;
};

import type { EnvNarrativeSegmentPackItem } from "../../../shared/llm/envNarrativeTypes.js";

export type { EnvNarrativeSegmentPackItem };

export type EnvNarrativePackPipelineJson = {
  crossValidatedTimelineSegments: CrossValidatedTimelineItem[];
};

/**
 * 从步骤 100 落盘对象构建 pipeline 输入：使用 **`crossValidatedTimelineSegments`**（与步骤 100 输出一致）。
 */
export function buildEnvNarrativePackPipelineFromCrossValidateFile(raw: Record<string, unknown>): EnvNarrativePackPipelineJson {
  const segments = raw.crossValidatedTimelineSegments;
  if (!Array.isArray(segments)) {
    return { crossValidatedTimelineSegments: [] };
  }

  const out: CrossValidatedTimelineItem[] = [];
  for (let i = 0; i < segments.length; i++) {
    const item = segments[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`ENV_NARRATIVE_PACK_110_INVALID: crossValidatedTimelineSegments[${i}] 须为对象`);
    }
    const o = item as Record<string, unknown>;
    if (typeof o.segmentIndex !== "number" || !Number.isFinite(o.segmentIndex)) {
      throw new Error(`ENV_NARRATIVE_PACK_110_INVALID: crossValidatedTimelineSegments[${i}].segmentIndex 须为数字`);
    }
    if (!Array.isArray(o.narrative) || o.narrative.length === 0) {
      throw new Error(`ENV_NARRATIVE_PACK_110_INVALID: crossValidatedTimelineSegments[${i}].narrative 须为非空数组`);
    }
    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      throw new Error(`ENV_NARRATIVE_PACK_110_INVALID: crossValidatedTimelineSegments[${i}].timeLabel 须为非空字符串`);
    }
    if (typeof o.originalNarrative !== "string" || !o.originalNarrative.trim()) {
      throw new Error(`ENV_NARRATIVE_PACK_110_INVALID: crossValidatedTimelineSegments[${i}].originalNarrative 须为非空字符串`);
    }
    const narrative = o.narrative.filter((n): n is string => typeof n === "string" && n.trim() !== "").map(n => n.trim());
    if (narrative.length === 0) {
      throw new Error(`ENV_NARRATIVE_PACK_110_INVALID: crossValidatedTimelineSegments[${i}].narrative 须包含非空字符串`);
    }
    const row: CrossValidatedTimelineItem = {
      segmentIndex: o.segmentIndex as number,
      narrative,
      timeLabel: o.timeLabel.trim(),
      originalNarrative: o.originalNarrative.trim(),
    };
    if (typeof o.title === "string" && o.title.trim()) {
      row.title = o.title.trim();
    }
    out.push(row);
  }
  return { crossValidatedTimelineSegments: out };
}

/** 仅向模型提供生成 visualScenes 所需字段（去掉 originalNarrative 溯源原文）。 */
function slimSliceForEnvNarrativePack(slice: CrossValidatedTimelineItem[]) {
  return slice.map((it) => ({
    segmentIndex: it.segmentIndex,
    narrative: it.narrative,
    timeLabel: it.timeLabel,
  }));
}

/** 模型偶发返回数组或沿用其它步骤键名；归一为 `{ crossValidatedTimelineSegments }`。 */
function coerceEnvNarrativePack110Root(parsed: unknown): Record<string, unknown> {
  if (Array.isArray(parsed)) {
    return { crossValidatedTimelineSegments: parsed };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("ENV_NARRATIVE_PACK_110_INVALID: 模型输出须为对象");
  }
  const root = parsed as Record<string, unknown>;
  if (Array.isArray(root.crossValidatedTimelineSegments)) {
    return root;
  }
  for (const altKey of ["splitDedupedTimelineSegments", "subsceneSplitTimelineSegments"] as const) {
    if (Array.isArray(root[altKey])) {
      return { crossValidatedTimelineSegments: root[altKey] };
    }
  }
  if (Array.isArray(root.visualScenes) && typeof root.segmentIndex !== "undefined") {
    return { crossValidatedTimelineSegments: [root] };
  }
  throw new Error("ENV_NARRATIVE_PACK_110_INVALID: 缺少 crossValidatedTimelineSegments");
}

/** 模型仅回传 visualScenes，按下标对齐输入并合并其余字段（narrative/timeLabel/originalNarrative/title）。 */
function assertEnvNarrativePackModelShape(
  parsed: unknown,
  inputSegments: CrossValidatedTimelineItem[],
): CrossValidatedTimelineItem[] {
  const root = coerceEnvNarrativePack110Root(parsed);
  const arr = root.crossValidatedTimelineSegments;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error("ENV_NARRATIVE_PACK_110_INVALID: crossValidatedTimelineSegments 须为非空数组");
  }
  if (arr.length !== inputSegments.length) {
    throw new Error(
      `ENV_NARRATIVE_PACK_110_INVALID: crossValidatedTimelineSegments 长度须与输入一致（期望 ${inputSegments.length}，实际 ${arr.length}）`,
    );
  }

  const out: CrossValidatedTimelineItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const src = inputSegments[i]!;
    const item = arr[i];
    const o = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
    const rawScenes = Array.isArray(o.visualScenes) && o.visualScenes.length > 0 ? o.visualScenes : src.narrative;
    const visualScenes = rawScenes.map((scene, idx) => {
      if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
        return { sceneIndex: idx + 1, sceneDescription: src.narrative[idx] || src.narrative[0]! };
      }
      const sceneObj = scene as Record<string, unknown>;
      return {
        sceneIndex: (sceneObj.sceneIndex as number) || idx + 1,
        sceneDescription: (sceneObj.sceneDescription as string)?.trim() || src.narrative[idx] || src.narrative[0]!,
      };
    });
    out.push({ ...src, visualScenes });
  }
  return out;
}

/**
 * 单 chunk：把一段切片提交给步骤 160 的提示词，按输入顺序返回带 `visualScenes` 的段落。
 * 提示词内容是"对输入中每条 narrative 的每一项生成对应 visualScene"，逐条独立，可切块。
 */
async function runEnvNarrativePackForSlice(
  slice: CrossValidatedTimelineItem[],
): Promise<CrossValidatedTimelineItem[]> {
  const { messages } = buildVideoLlmMessages(PROMPT_FILE, {
    crossValidatedTimelineSegments: slimSliceForEnvNarrativePack(slice),
  });

  const chatOpts = {
    debugStepId: "env_narrative_pack_110",
    temperature: 0.25,
    useJsonObject: true,
  };

  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(messages, chatOpts);
  } catch (first) {
    try {
      parsed = await chatJson<unknown>(messages, { ...chatOpts, debugStepId: "env_narrative_pack_110_retry" });
    } catch (second) {
      const msg = second instanceof Error ? second.message : String(second);
      const firstMsg = first instanceof Error ? first.message : String(first);
      throw new Error(`ENV_NARRATIVE_PACK_110_INVALID: 模型调用或 JSON 解析失败。${msg}（首次：${firstMsg}）`);
    }
  }

  return assertEnvNarrativePackModelShape(parsed, slice);
}

export async function runEnvNarrativePackFromPipelineJson(
  pipeline: EnvNarrativePackPipelineJson,
): Promise<{ crossValidatedTimelineSegments: CrossValidatedTimelineItem[]; envNarrativeSegmentsPack: EnvNarrativeSegmentPackItem[] }> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { crossValidatedTimelineSegments } = pipeline;

  const chunkSize = resolveChatMaxItemsPerCall();

  const validatedSegments = await runChatPerSliceConcat<CrossValidatedTimelineItem, CrossValidatedTimelineItem>({
    items: crossValidatedTimelineSegments,
    chunkSize,
    runOnce: (slice) => runEnvNarrativePackForSlice(slice),
  });

  // 生成 envNarrativeSegmentsPack 字段（步骤 120 输入）：按全量结果统一编号，与是否切块无关。
  const envNarrativeSegmentsPack: EnvNarrativeSegmentPackItem[] = [];
  let segmentIndex = 1;

  validatedSegments.forEach((segment, segIdx) => {
    segment.narrative.forEach((narrative, narrIdx) => {
      const scene = segment.visualScenes?.[narrIdx];
      const sceneDescription = scene?.sceneDescription || narrative;
      
      // 提取时间和地点信息
      let env_time = segment.timeLabel;
      let env_location = "";

      env_time = extractEnvTimeFromText(sceneDescription, env_time);
      env_location = extractEnvLocationFromText(sceneDescription);
      
      envNarrativeSegmentsPack.push({
        segmentIndex: segmentIndex++,
        logicalSegmentIndex: segIdx + 1,
        sceneFragmentIndex: narrIdx + 1,
        name: "人物", // 默认名称，实际应用中可能需要从其他地方获取
        env_time,
        env_location,
        narrative: narrative,
        voiceover: narrative, // 简单使用 narrative 作为 voiceover
        env_event: sceneDescription,
      });
    });
  });

  return { crossValidatedTimelineSegments: validatedSegments, envNarrativeSegmentsPack };
}
