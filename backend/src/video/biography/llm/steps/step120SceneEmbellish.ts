import { buildVideoLlmMessages } from "../../../shared/llm/localeLlm.js";
import { extractEnvLocationFromText, extractEnvTimeFromText } from "../../../shared/envSceneExtract.js";
import { chatJson, getVideoLlmEnv } from "../../../shared/llm/client.js";
import type { EnvNarrativeSegmentPackItem, CrossValidatedTimelineItem } from "./step110EnvNarrativePack.js";
import { compactEnvEventFromRow } from "../../../shared/llm/envSegmentSceneText.js";
import { resolveChatMaxItemsPerCall, runChatPerSliceConcat } from "../../../shared/llm/pipelineChunkedChat.js";

const PROMPT_FILE = "step-120_env-scene-embellish.md";

function parseSegIdx(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

/**
 * 从场景包落盘对象解析并校验 `envNarrativeSegmentsPack`（步骤 110/120 等共用）。
 * @param errPrefix 错误信息前缀，如 `ENV_SCENE_EMBELLISH_120_INVALID`、`NAME_UNIFY_130_INVALID`
 */
export function parseEnvNarrativeSegmentsPackFromRaw(
  raw: Record<string, unknown>,
  errPrefix = "ENV_SCENE_EMBELLISH_120_INVALID",
): EnvNarrativeSegmentPackItem[] {
  // 首先尝试从 crossValidatedTimelineSegments 字段读取数据
  const crossValidatedSegments = raw.crossValidatedTimelineSegments;
  if (Array.isArray(crossValidatedSegments)) {
    const out: EnvNarrativeSegmentPackItem[] = [];
    let segmentIndex = 1;
    
    crossValidatedSegments.forEach((segment, segIdx) => {
      if (!segment || typeof segment !== "object" || Array.isArray(segment)) {
        return;
      }
      const o = segment as Record<string, unknown>;
      const narrative = Array.isArray(o.narrative) ? o.narrative : [];
      const visualScenes = Array.isArray(o.visualScenes) ? o.visualScenes : [];
      
      narrative.forEach((narr, narrIdx) => {
        try {
          const scene = visualScenes[narrIdx];
          const sceneDescription = scene && typeof scene === "object" && !Array.isArray(scene) ? 
            (scene as Record<string, unknown>).sceneDescription as string : 
            narr;
          
          if (!sceneDescription || typeof sceneDescription !== "string" || !sceneDescription.trim()) {
            return;
          }
          
          // 提取时间和地点信息
          let env_time = o.timeLabel as string || "";
          let env_location = "";

          env_time = extractEnvTimeFromText(sceneDescription, env_time);
          env_location = extractEnvLocationFromText(sceneDescription);
          
          out.push({
            segmentIndex: segmentIndex++,
            logicalSegmentIndex: segIdx + 1,
            sceneFragmentIndex: narrIdx + 1,
            name: "人物", // 默认名称
            env_time: env_time.trim(),
            env_location: env_location.trim(),
            env_event: sceneDescription.trim(),
            narrative: narr.trim(),
            voiceover: narr.trim(), // 简单使用 narrative 作为 voiceover
          });
        } catch (e) {
          // 跳过不符合要求的元素
          return;
        }
      });
    });
    
    return out;
  }
  
  // 如果 crossValidatedTimelineSegments 不存在，尝试从 envNarrativeSegmentsPack 字段读取数据
  const arr = raw.envNarrativeSegmentsPack;
  if (!Array.isArray(arr)) {
    return [];
  }
  const out: EnvNarrativeSegmentPackItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    try {
      const item = arr[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const o = item as Record<string, unknown>;
      const si = parseSegIdx(o.segmentIndex);
      if (si === null) {
        continue;
      }
      const name = typeof o.name === "string" ? o.name.trim() : "";
      const env_time = typeof o.env_time === "string" ? o.env_time.trim() : "";
      const env_location = typeof o.env_location === "string" ? o.env_location.trim() : "";
      const narrative = typeof o.narrative === "string" ? o.narrative.trim() : "";
      const voiceover = typeof o.voiceover === "string" ? o.voiceover.trim() : "";
      const ev = typeof o.env_event === "string" ? o.env_event.trim() : "";
      
      if (!name || !env_time || !env_location || !narrative || !voiceover || !ev) {
        continue;
      }
      
      const li = parseSegIdx(o.logicalSegmentIndex) ?? si;
      const sf = parseSegIdx(o.sceneFragmentIndex) ?? 1;
      out.push({
        segmentIndex: si,
        logicalSegmentIndex: li,
        sceneFragmentIndex: sf,
        name,
        env_time,
        env_location,
        env_event: ev,
        narrative,
        voiceover,
      });
    } catch (e) {
      // 跳过不符合要求的元素
      continue;
    }
  }
  out.sort((a, b) => {
    if (a.logicalSegmentIndex !== b.logicalSegmentIndex) {
      return a.logicalSegmentIndex - b.logicalSegmentIndex;
    }
    return a.sceneFragmentIndex - b.sceneFragmentIndex;
  });
  return out.map((r, idx) => ({ ...r, segmentIndex: idx + 1 }));
}

type EmbellishmentRow = {
  segmentIndex: number;
  env_event: string;
};

function assertEmbellishmentsShape(parsed: unknown, expectedLen: number, pack: EnvNarrativeSegmentPackItem[]): EmbellishmentRow[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ENV_SCENE_EMBELLISH_120_INVALID: 模型输出须为对象");
  }
  const root = parsed as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length !== 1 || !Object.prototype.hasOwnProperty.call(root, "envNarrativeSegmentsSceneEmbellishments")) {
    throw new Error(
      `ENV_SCENE_EMBELLISH_120_INVALID: 顶层须仅含 envNarrativeSegmentsSceneEmbellishments，当前键: ${keys.join(",")}`,
    );
  }
  const arr = root.envNarrativeSegmentsSceneEmbellishments;
  if (!Array.isArray(arr)) {
    throw new Error("ENV_SCENE_EMBELLISH_120_INVALID: envNarrativeSegmentsSceneEmbellishments 须为数组");
  }
  if (arr.length !== expectedLen) {
    throw new Error(
      `ENV_SCENE_EMBELLISH_120_INVALID: 输出条数须为 ${expectedLen}，实际 ${arr.length}`,
    );
  }

  const out: EmbellishmentRow[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("ENV_SCENE_EMBELLISH_120_INVALID: 修饰项须为对象");
    }
    const o = item as Record<string, unknown>;
    const si = parseSegIdx(o.segmentIndex);
    if (si === null) {
      throw new Error("ENV_SCENE_EMBELLISH_120_INVALID: segmentIndex 无效");
    }
    if (si !== pack[i].segmentIndex) {
      throw new Error(
        `ENV_SCENE_EMBELLISH_120_INVALID: 第 ${i + 1} 条 segmentIndex（${si}）与输入场景包（${pack[i].segmentIndex}）不一致`,
      );
    }
    if (typeof o.env_event !== "string" || !o.env_event.trim()) {
      throw new Error("ENV_SCENE_EMBELLISH_120_INVALID: env_event 须为非空字符串");
    }
    out.push({ segmentIndex: si, env_event: o.env_event.trim() });
  }
  return out;
}

function mergeEmbellishmentsIntoPack(pack: EnvNarrativeSegmentPackItem[], emb: EmbellishmentRow[]): EnvNarrativeSegmentPackItem[] {
  const out: EnvNarrativeSegmentPackItem[] = [];
  for (let i = 0; i < pack.length; i++) {
    const merged: EnvNarrativeSegmentPackItem = {
      ...pack[i],
      env_event: emb[i].env_event.trim(),
    };
    if (!merged.narrative.trim() || !merged.voiceover.trim()) {
      throw new Error(`ENV_SCENE_EMBELLISH_120_INVALID: 第 ${i + 1} 条合并后 narrative 或 voiceover 为空`);
    }
    if (!compactEnvEventFromRow(merged as unknown as Record<string, unknown>)) {
      throw new Error(`ENV_SCENE_EMBELLISH_120_INVALID: 第 ${i + 1} 条合并后 env_event 为空`);
    }
    out.push(merged);
  }
  return out;
}

export type SceneEmbellishInput = {
  crossValidatedTimelineSegments: CrossValidatedTimelineItem[];
};

export type SceneEmbellishOutput = {
  crossValidatedTimelineSegments: CrossValidatedTimelineItem[];
};

/**
 * 单 chunk 调用模型并校验输出：对一个 segment 切片产出对齐的 `CrossValidatedTimelineItem[]`。
 * 提示词内容只要求"每条独立修饰 sceneDescription、保持其它字段结构"，所以切片处理在语义上等价于整体处理。
 */
function coerceSceneEmbellish120Root(parsed: unknown): Record<string, unknown> {
  if (Array.isArray(parsed)) {
    return { crossValidatedTimelineSegments: parsed };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("ENV_SCENE_EMBELLISH_120_INVALID: 模型输出须为对象");
  }
  const root = parsed as Record<string, unknown>;
  if (Array.isArray(root.crossValidatedTimelineSegments)) {
    return root;
  }
  if (typeof root.segmentIndex !== "undefined" && Array.isArray(root.visualScenes)) {
    return { crossValidatedTimelineSegments: [root] };
  }
  throw new Error("ENV_SCENE_EMBELLISH_120_INVALID: 缺少 crossValidatedTimelineSegments");
}

/** 仅向模型提供修饰 visualScenes 所需字段（去掉 originalNarrative 溯源原文）。 */
function slimSliceForEmbellish(slice: CrossValidatedTimelineItem[]) {
  return slice.map((it) => ({
    segmentIndex: it.segmentIndex,
    narrative: it.narrative,
    timeLabel: it.timeLabel,
    visualScenes: it.visualScenes ?? [],
  }));
}

async function runSceneEmbellishForSlice(
  slice: CrossValidatedTimelineItem[],
): Promise<CrossValidatedTimelineItem[]> {
  const { messages } = buildVideoLlmMessages(PROMPT_FILE, {
    crossValidatedTimelineSegments: slimSliceForEmbellish(slice),
  });

  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(messages,
      {
        debugStepId: "scene_embellish_120",
        temperature: 0.25,
        useJsonObject: true,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`ENV_SCENE_EMBELLISH_120_INVALID: 模型调用或 JSON 解析失败。${msg}`);
  }

  const root = coerceSceneEmbellish120Root(parsed);
  const arr = root.crossValidatedTimelineSegments;
  if (!Array.isArray(arr)) {
    throw new Error("ENV_SCENE_EMBELLISH_120_INVALID: crossValidatedTimelineSegments 须为数组");
  }
  if (arr.length !== slice.length) {
    throw new Error(
      `ENV_SCENE_EMBELLISH_120_INVALID: crossValidatedTimelineSegments 长度须与输入一致（期望 ${slice.length}，实际 ${arr.length}）`,
    );
  }

  // 模型仅回传 segmentIndex + 修饰后的 visualScenes；其余字段由服务端按下标从输入合并。
  const output: CrossValidatedTimelineItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const src = slice[i]!;
    const fallbackScenes = src.visualScenes && src.visualScenes.length > 0
      ? src.visualScenes
      : src.narrative.map((n, idx) => ({ sceneIndex: idx + 1, sceneDescription: n }));
    const item = arr[i];
    const o = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
    const rawScenes = Array.isArray(o.visualScenes) && o.visualScenes.length > 0 ? o.visualScenes : fallbackScenes;
    const visualScenes = rawScenes.map((scene, idx) => {
      if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
        return { sceneIndex: idx + 1, sceneDescription: fallbackScenes[idx]?.sceneDescription || src.narrative[0]! };
      }
      const sceneObj = scene as Record<string, unknown>;
      return {
        sceneIndex: (sceneObj.sceneIndex as number) || idx + 1,
        sceneDescription:
          (sceneObj.sceneDescription as string)?.trim() || fallbackScenes[idx]?.sceneDescription || src.narrative[0]!,
      };
    });
    output.push({ ...src, visualScenes });
  }

  return output;
}

export async function runSceneEmbellishFromPipelineJson(
  input: SceneEmbellishInput,
): Promise<SceneEmbellishOutput> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const chunkSize = resolveChatMaxItemsPerCall();

  const merged = await runChatPerSliceConcat<CrossValidatedTimelineItem, CrossValidatedTimelineItem>({
    items: input.crossValidatedTimelineSegments,
    chunkSize,
    runOnce: (slice) => runSceneEmbellishForSlice(slice),
  });

  return { crossValidatedTimelineSegments: merged };
}
