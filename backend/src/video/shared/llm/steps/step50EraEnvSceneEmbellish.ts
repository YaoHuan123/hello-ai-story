import { chatJson, getVideoLlmEnv } from "../client.js";
import { buildVideoLlmMessages, stringifyVideoPipeline } from "../localeLlm.js";
import type { EnvNarrativeSegmentPackItem } from "../envNarrativeTypes.js";
import type { EraSubsceneSplitItem } from "./step30EraSubsceneSplit.js";

const PROMPT_FILE = "step-50_era-env-scene-embellish.md";

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

const DEFAULT_ERA_PACK_ERR = "ERA_ENV_SCENE_EMBELLISH_50_INVALID";

/** 仅向模型提供 env_event 推理所需字段，显著减小与 voiceover 等无关体积。 */
function slimPackForEraEnvSceneEmbellish(pack: EnvNarrativeSegmentPackItem[]) {
  return pack.map((p) => ({
    segmentIndex: p.segmentIndex,
    name: p.name,
    env_time: p.env_time,
    env_location: p.env_location,
    narrative: p.narrative,
    env_event: p.env_event,
  }));
}

export type EraEnvSceneEmbellishInput = {
  eraSubsceneSplitTimelineSegments: EraSubsceneSplitItem[];
};

export type EraEnvSceneEmbellishOutput = {
  eraSubsceneSplitTimelineSegments: EraSubsceneSplitItem[];
};

/**
 * 从时代场景包落盘对象解析并校验 **`eraEnvNarrativeSegmentsPack`**（步骤 50 / 合并 160 等共用）。
 * @param errPrefix 错误信息前缀，默认 `ERA_ENV_SCENE_EMBELLISH_50_INVALID`
 */
export function parseEraEnvNarrativeSegmentsPackFromRaw(
  raw: Record<string, unknown>,
  errPrefix = DEFAULT_ERA_PACK_ERR,
): EnvNarrativeSegmentPackItem[] {
  const arr = raw.eraEnvNarrativeSegmentsPack;
  if (!Array.isArray(arr)) {
    throw new Error(`${errPrefix}: eraEnvNarrativeSegmentsPack 须为数组`);
  }
  const out: EnvNarrativeSegmentPackItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${errPrefix}: eraEnvNarrativeSegmentsPack[${i}] 须为对象`);
    }
    const o = item as Record<string, unknown>;
    const si = parseSegIdx(o.segmentIndex);
    if (si === null) {
      throw new Error(`${errPrefix}: eraEnvNarrativeSegmentsPack[${i}].segmentIndex 无效`);
    }
    for (const key of ["name", "env_time", "env_location", "env_event", "narrative", "voiceover"] as const) {
      if (typeof o[key] !== "string" || !String(o[key]).trim()) {
        throw new Error(`${errPrefix}: eraEnvNarrativeSegmentsPack[${i}].${key} 须为非空字符串`);
      }
    }
    const li = parseSegIdx(o.logicalSegmentIndex) ?? i + 1;
    const sf = parseSegIdx(o.sceneFragmentIndex) ?? 1;
    out.push({
      segmentIndex: si,
      logicalSegmentIndex: li,
      sceneFragmentIndex: sf,
      name: String(o.name).trim(),
      env_time: String(o.env_time).trim(),
      env_location: String(o.env_location).trim(),
      env_event: String(o.env_event).trim(),
      narrative: String(o.narrative).trim(),
      voiceover: String(o.voiceover).trim(),
    });
  }
  return out;
}

/**
 * 从步骤 150 输出解析 eraSubsceneSplitTimelineSegments
 */
export function parseEraSubsceneSplitTimelineSegmentsFromPackRaw(raw: Record<string, unknown>): EraSubsceneSplitItem[] {
  const arr = raw.eraSubsceneSplitTimelineSegments;
  if (!Array.isArray(arr)) {
    throw new Error(`${DEFAULT_ERA_PACK_ERR}: eraSubsceneSplitTimelineSegments 须为数组`);
  }
  const out: EraSubsceneSplitItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${DEFAULT_ERA_PACK_ERR}: eraSubsceneSplitTimelineSegments[${i}] 须为对象`);
    }
    const o = item as Record<string, unknown>;
    const si = parseSegIdx(o.segmentIndex);
    if (si === null) {
      throw new Error(`${DEFAULT_ERA_PACK_ERR}: eraSubsceneSplitTimelineSegments[${i}].segmentIndex 无效`);
    }
    if (!Array.isArray(o.narrative) || o.narrative.length === 0) {
      throw new Error(`${DEFAULT_ERA_PACK_ERR}: eraSubsceneSplitTimelineSegments[${i}].narrative 须为非空数组`);
    }
    const narrative = o.narrative.filter((n): n is string => typeof n === "string" && n.trim() !== "").map(n => n.trim());
    if (narrative.length === 0) {
      throw new Error(`${DEFAULT_ERA_PACK_ERR}: eraSubsceneSplitTimelineSegments[${i}].narrative 须为非空数组`);
    }
    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      throw new Error(`${DEFAULT_ERA_PACK_ERR}: eraSubsceneSplitTimelineSegments[${i}].timeLabel 须为非空字符串`);
    }
    if (typeof o.originalNarrative !== "string" || !o.originalNarrative.trim()) {
      throw new Error(`${DEFAULT_ERA_PACK_ERR}: eraSubsceneSplitTimelineSegments[${i}].originalNarrative 须为非空字符串`);
    }
    const row: EraSubsceneSplitItem = {
      segmentIndex: si,
      narrative,
      timeLabel: o.timeLabel.trim(),
      originalNarrative: o.originalNarrative.trim(),
    };
    if (Array.isArray(o.visualScenes)) {
      const visualScenes = o.visualScenes.map((scene, idx) => {
        if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
          return {
            sceneIndex: idx + 1,
            sceneDescription: narrative[idx] || narrative[0],
          };
        }
        const sceneObj = scene as Record<string, unknown>;
        return {
          sceneIndex: (sceneObj.sceneIndex as number) || (idx + 1),
          sceneDescription: (sceneObj.sceneDescription as string)?.trim() || narrative[idx] || narrative[0],
        };
      });
      row.visualScenes = visualScenes;
    }
    out.push(row);
  }
  return out;
}

type EmbellishmentRow = {
  segmentIndex: number;
  env_event: string;
};

function assertEmbellishmentsShape(parsed: unknown, expectedLen: number, pack: EnvNarrativeSegmentPackItem[]): EmbellishmentRow[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${DEFAULT_ERA_PACK_ERR}: 模型输出须为对象`);
  }
  const root = parsed as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length !== 1 || !Object.prototype.hasOwnProperty.call(root, "eraEnvNarrativeSegmentsSceneEmbellishments")) {
    throw new Error(
      `${DEFAULT_ERA_PACK_ERR}: 顶层须仅含 eraEnvNarrativeSegmentsSceneEmbellishments，当前键: ${keys.join(",")}`,
    );
  }
  const arr = root.eraEnvNarrativeSegmentsSceneEmbellishments;
  if (!Array.isArray(arr)) {
    throw new Error(`${DEFAULT_ERA_PACK_ERR}: eraEnvNarrativeSegmentsSceneEmbellishments 须为数组`);
  }
  if (arr.length !== expectedLen) {
    throw new Error(`${DEFAULT_ERA_PACK_ERR}: 输出条数须为 ${expectedLen}，实际 ${arr.length}`);
  }

  const out: EmbellishmentRow[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${DEFAULT_ERA_PACK_ERR}: 修饰项须为对象`);
    }
    const o = item as Record<string, unknown>;
    const si = parseSegIdx(o.segmentIndex);
    if (si === null) {
      throw new Error(`${DEFAULT_ERA_PACK_ERR}: segmentIndex 无效`);
    }
    if (si !== pack[i].segmentIndex) {
      throw new Error(
        `${DEFAULT_ERA_PACK_ERR}: 第 ${i + 1} 条 segmentIndex（${si}）与输入场景包（${pack[i].segmentIndex}）不一致`,
      );
    }
    if (typeof o.env_event !== "string" || !o.env_event.trim()) {
      throw new Error(`${DEFAULT_ERA_PACK_ERR}: env_event 须为非空字符串`);
    }
    out.push({
      segmentIndex: si,
      env_event: o.env_event.trim(),
    });
  }
  return out;
}

function mergeEmbellishmentsIntoPack(pack: EnvNarrativeSegmentPackItem[], emb: EmbellishmentRow[]): EnvNarrativeSegmentPackItem[] {
  const out: EnvNarrativeSegmentPackItem[] = [];
  for (let i = 0; i < pack.length; i++) {
    const merged: EnvNarrativeSegmentPackItem = {
      ...pack[i],
      env_event: emb[i].env_event,
    };
    if (!merged.narrative.trim() || !merged.voiceover.trim()) {
      throw new Error(`${DEFAULT_ERA_PACK_ERR}: 第 ${i + 1} 条合并后 narrative 或 voiceover 为空`);
    }
    out.push(merged);
  }
  return out;
}

export async function runEraEnvSceneEmbellishFromSubsceneSplit(input: EraEnvSceneEmbellishInput): Promise<EraEnvSceneEmbellishOutput> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { messages } = buildVideoLlmMessages(PROMPT_FILE, {
    eraSubsceneSplitTimelineSegments: slimSubsceneForEmbellish(input.eraSubsceneSplitTimelineSegments),
  });
  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(
      messages,
      {
        debugStepId: "era_env_scene_embellish_50_subscene",
        temperature: 0.25,
        useJsonObject: true,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${DEFAULT_ERA_PACK_ERR}: 模型调用或 JSON 解析失败。${msg}`);
  }

  const output = parseEmbellishedVisualScenesOnly(parsed, input.eraSubsceneSplitTimelineSegments);
  return { eraSubsceneSplitTimelineSegments: output };
}

/** 仅向模型提供修饰 visualScenes 所需字段（去掉 originalNarrative 溯源原文）。 */
function slimSubsceneForEmbellish(items: EraSubsceneSplitItem[]) {
  return items.map((it) => ({
    segmentIndex: it.segmentIndex,
    narrative: it.narrative,
    timeLabel: it.timeLabel,
    visualScenes: it.visualScenes ?? [],
  }));
}

/** 模型偶发返回单段对象或沿用其它键名；归一为 `{ eraSubsceneSplitTimelineSegments }`。 */
function coerceEraSubsceneSplit50Root(parsed: unknown): Record<string, unknown> {
  if (Array.isArray(parsed)) {
    return { eraSubsceneSplitTimelineSegments: parsed };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${DEFAULT_ERA_PACK_ERR}: 模型输出须为对象`);
  }
  const root = parsed as Record<string, unknown>;
  if (Array.isArray(root.eraSubsceneSplitTimelineSegments)) {
    return root;
  }
  if (Array.isArray(root.subsceneSplitTimelineSegments)) {
    return { eraSubsceneSplitTimelineSegments: root.subsceneSplitTimelineSegments };
  }
  if (typeof root.segmentIndex !== "undefined" && Array.isArray(root.visualScenes)) {
    return { eraSubsceneSplitTimelineSegments: [root] };
  }
  throw new Error(`${DEFAULT_ERA_PACK_ERR}: 缺少 eraSubsceneSplitTimelineSegments`);
}

/** 解析模型仅返回的（修饰后）visualScenes，按下标对齐输入并合并其余字段。 */
function parseEmbellishedVisualScenesOnly(
  parsed: unknown,
  inputItems: EraSubsceneSplitItem[],
): EraSubsceneSplitItem[] {
  const root = coerceEraSubsceneSplit50Root(parsed);
  const arr = root.eraSubsceneSplitTimelineSegments;
  if (!Array.isArray(arr)) {
    throw new Error(`${DEFAULT_ERA_PACK_ERR}: eraSubsceneSplitTimelineSegments 须为数组`);
  }
  if (arr.length !== inputItems.length) {
    throw new Error(
      `${DEFAULT_ERA_PACK_ERR}: eraSubsceneSplitTimelineSegments 长度须与输入一致（期望 ${inputItems.length}，实际 ${arr.length}）`,
    );
  }

  const output: EraSubsceneSplitItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const src = inputItems[i]!;
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

export async function runEraEnvSceneEmbellishFromPipelineJson(
  pack: EnvNarrativeSegmentPackItem[],
): Promise<EnvNarrativeSegmentPackItem[]> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { messages } = buildVideoLlmMessages(PROMPT_FILE, { eraEnvNarrativeSegmentsPack: slimPackForEraEnvSceneEmbellish(pack) });
  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(
      messages,
      {
        debugStepId: "era_env_scene_embellish_50_pack",
        temperature: 0.25,
        useJsonObject: true,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${DEFAULT_ERA_PACK_ERR}: 模型调用或 JSON 解析失败。${msg}`);
  }

  const emb = assertEmbellishmentsShape(parsed, pack.length, pack);
  return mergeEmbellishmentsIntoPack(pack, emb);
}
