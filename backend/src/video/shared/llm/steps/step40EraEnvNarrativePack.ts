import { chatJson, getVideoLlmEnv } from "../client.js";
import { buildVideoLlmMessages, stringifyVideoPipeline } from "../localeLlm.js";
import type { EraBackdropSegment } from "./step20EraBackdrop.js";
import type { EnvNarrativeSegmentPackItem } from "../envNarrativeTypes.js";
import type { EraSubsceneSplitItem } from "./step30EraSubsceneSplit.js";

const PROMPT_FILE = "step-40_era-env-narrative-pack.md";

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
 * 从 `era-100_AI生成的时代背景事件.json` 根对象解析 **`step20EraBackdropSegments`**。
 */
export function parseEraBackdropSegmentsFromEraFileRaw(raw: Record<string, unknown>): EraBackdropSegment[] {
  const arr = raw.step20EraBackdropSegments;
  if (!Array.isArray(arr)) {
    throw new Error("ERA_ENV_NARRATIVE_PACK_150_INVALID: step20EraBackdropSegments 须为数组");
  }
  const out: EraBackdropSegment[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: step20EraBackdropSegments[${i}] 须为对象`);
    }
    const o = item as Record<string, unknown>;
    if (typeof o.narrative !== "string" || !o.narrative.trim()) {
      throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: step20EraBackdropSegments[${i}].narrative 须为非空字符串`);
    }
    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      throw new Error(
        `ERA_ENV_NARRATIVE_PACK_150_INVALID: step20EraBackdropSegments[${i}].timeLabel 须为非空字符串（请重跑步骤100）`,
      );
    }
    out.push({
      narrative: o.narrative.trim(),
      timeLabel: o.timeLabel.trim(),
    });
  }
  return out;
}

/**
 * 从步骤 30 输出解析 eraSubsceneSplitTimelineSegments
 */
export function parseEraSubsceneSplitTimelineSegmentsFromRaw(raw: Record<string, unknown>): EraSubsceneSplitItem[] {
  const arr = raw.eraSubsceneSplitTimelineSegments;
  if (!Array.isArray(arr)) {
    throw new Error("ERA_ENV_NARRATIVE_PACK_150_INVALID: eraSubsceneSplitTimelineSegments 须为数组");
  }
  const out: EraSubsceneSplitItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: eraSubsceneSplitTimelineSegments[${i}] 须为对象`);
    }
    const o = item as Record<string, unknown>;
    const si = parseSegIdx(o.segmentIndex);
    if (si === null) {
      throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: eraSubsceneSplitTimelineSegments[${i}].segmentIndex 无效`);
    }
    if (!Array.isArray(o.narrative) || o.narrative.length === 0) {
      throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: eraSubsceneSplitTimelineSegments[${i}].narrative 须为非空数组`);
    }
    const narrative = o.narrative.filter((n): n is string => typeof n === "string" && n.trim() !== "").map(n => n.trim());
    if (narrative.length === 0) {
      throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: eraSubsceneSplitTimelineSegments[${i}].narrative 须为非空数组`);
    }
    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: eraSubsceneSplitTimelineSegments[${i}].timeLabel 须为非空字符串`);
    }
    if (typeof o.originalNarrative !== "string" || !o.originalNarrative.trim()) {
      throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: eraSubsceneSplitTimelineSegments[${i}].originalNarrative 须为非空字符串`);
    }
    const row: EraSubsceneSplitItem = {
      segmentIndex: si,
      narrative,
      timeLabel: o.timeLabel.trim(),
      originalNarrative: o.originalNarrative.trim(),
    };
    out.push(row);
  }
  return out;
}

type EraEnvPackModelRow = {
  segmentIndex: number;
  name: string;
  env_time: string;
  env_location: string;
  env_event: string;
};

export type EraEnvNarrativePackInput = {
  eraSubsceneSplitTimelineSegments: EraSubsceneSplitItem[];
};

export type EraEnvNarrativePackOutput = {
  eraSubsceneSplitTimelineSegments: EraSubsceneSplitItem[];
};

function assertEraEnvPackShape(parsed: unknown, segments: EraBackdropSegment[]): EraEnvPackModelRow[] {
  const n = segments.length;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ERA_ENV_NARRATIVE_PACK_150_INVALID: 模型输出须为对象");
  }
  const root = parsed as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length !== 1 || !Object.prototype.hasOwnProperty.call(root, "eraEnvNarrativeSegmentsPack")) {
    throw new Error(
      `ERA_ENV_NARRATIVE_PACK_150_INVALID: 顶层须仅含 eraEnvNarrativeSegmentsPack，当前键: ${keys.join(",")}`,
    );
  }
  const arr = root.eraEnvNarrativeSegmentsPack;
  if (!Array.isArray(arr)) {
    throw new Error("ERA_ENV_NARRATIVE_PACK_150_INVALID: eraEnvNarrativeSegmentsPack 须为数组");
  }
  if (arr.length !== n) {
    throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: 输出条数须为 ${n}，实际 ${arr.length}`);
  }

  const out: EraEnvPackModelRow[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("ERA_ENV_NARRATIVE_PACK_150_INVALID: 场景包项须为对象");
    }
    const o = item as Record<string, unknown>;
    const si = parseSegIdx(o.segmentIndex);
    if (si === null) {
      throw new Error("ERA_ENV_NARRATIVE_PACK_150_INVALID: segmentIndex 无效");
    }
    if (si !== i) {
      throw new Error(
        `ERA_ENV_NARRATIVE_PACK_150_INVALID: 第 ${i + 1} 条 segmentIndex（${si}）须等于下标 ${i}`,
      );
    }
    for (const key of ["name", "env_time", "env_location", "env_event"] as const) {
      if (typeof o[key] !== "string" || !String(o[key]).trim()) {
        throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: eraEnvNarrativeSegmentsPack[${i}].${key} 须为非空字符串`);
      }
    }
    out.push({
      segmentIndex: si,
      name: String(o.name).trim(),
      env_time: String(o.env_time).trim(),
      env_location: String(o.env_location).trim(),
      env_event: String(o.env_event).trim(),
    });
  }
  return out;
}

function mergeEraBackdropIntoPack(segments: EraBackdropSegment[], rows: EraEnvPackModelRow[]): EnvNarrativeSegmentPackItem[] {
  const out: EnvNarrativeSegmentPackItem[] = [];
  for (let i = 0; i < segments.length; i++) {
    const row = rows[i];
    const nv = segments[i].narrative.trim();
    const merged: EnvNarrativeSegmentPackItem = {
      segmentIndex: row.segmentIndex,
      logicalSegmentIndex: i + 1,
      sceneFragmentIndex: 1,
      name: row.name,
      env_time: row.env_time,
      env_location: row.env_location,
      env_event: row.env_event,
      narrative: nv,
      voiceover: nv,
    };
    if (!merged.narrative || !merged.voiceover) {
      throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: 第 ${i + 1} 条合并后 narrative 或 voiceover 为空`);
    }
    out.push(merged);
  }
  return out;
}

/** 仅向模型提供生成 visualScenes 所需字段（去掉 originalNarrative 等溯源原文）。 */
function slimSubsceneForVisualScenes(items: EraSubsceneSplitItem[]) {
  return items.map((it) => ({
    segmentIndex: it.segmentIndex,
    narrative: it.narrative,
    timeLabel: it.timeLabel,
  }));
}

function coerceEraSubsceneSplitRoot(parsed: unknown, errPrefix: string): Record<string, unknown> {
  if (Array.isArray(parsed)) {
    return { eraSubsceneSplitTimelineSegments: parsed };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${errPrefix}: 模型输出须为对象`);
  }
  const root = parsed as Record<string, unknown>;
  if (Array.isArray(root.eraSubsceneSplitTimelineSegments)) {
    return root;
  }
  if (typeof root.segmentIndex !== "undefined" && Array.isArray(root.visualScenes)) {
    return { eraSubsceneSplitTimelineSegments: [root] };
  }
  throw new Error(`${errPrefix}: 缺少 eraSubsceneSplitTimelineSegments`);
}

/** 解析模型仅返回的 visualScenes（按下标对齐输入段；缺省回退到该段 narrative）。 */
function parseVisualScenesOnly(
  parsed: unknown,
  inputItems: EraSubsceneSplitItem[],
  errPrefix: string,
): EraSubsceneSplitItem[] {
  const root = coerceEraSubsceneSplitRoot(parsed, errPrefix);
  const arr = root.eraSubsceneSplitTimelineSegments;
  if (!Array.isArray(arr)) {
    throw new Error(`${errPrefix}: eraSubsceneSplitTimelineSegments 须为数组`);
  }
  if (arr.length !== inputItems.length) {
    throw new Error(
      `${errPrefix}: eraSubsceneSplitTimelineSegments 长度须与输入一致（期望 ${inputItems.length}，实际 ${arr.length}）`,
    );
  }

  const output: EraSubsceneSplitItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const src = inputItems[i]!;
    const item = arr[i];
    const o = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
    const rawScenes = Array.isArray(o.visualScenes) ? o.visualScenes : [];
    const visualScenes = (rawScenes.length > 0 ? rawScenes : src.narrative).map((scene, idx) => {
      if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
        return { sceneIndex: idx + 1, sceneDescription: src.narrative[idx] || src.narrative[0]! };
      }
      const sceneObj = scene as Record<string, unknown>;
      return {
        sceneIndex: (sceneObj.sceneIndex as number) || idx + 1,
        sceneDescription: (sceneObj.sceneDescription as string)?.trim() || src.narrative[idx] || src.narrative[0]!,
      };
    });
    output.push({ ...src, visualScenes });
  }
  return output;
}

export async function runEraEnvNarrativePackFromSubsceneSplit(input: EraEnvNarrativePackInput): Promise<EraEnvNarrativePackOutput> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { messages } = buildVideoLlmMessages(PROMPT_FILE, {
    eraSubsceneSplitTimelineSegments: slimSubsceneForVisualScenes(input.eraSubsceneSplitTimelineSegments),
  });
  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(
      messages,
      {
        debugStepId: "era_env_narrative_pack_150_subscene",
        temperature: 0.25,
        useJsonObject: true,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: 模型调用或 JSON 解析失败。${msg}`);
  }

  const output = parseVisualScenesOnly(
    parsed,
    input.eraSubsceneSplitTimelineSegments,
    "ERA_ENV_NARRATIVE_PACK_150_INVALID",
  );
  return { eraSubsceneSplitTimelineSegments: output };
}

export async function runEraEnvNarrativePackFromSegments(segments: EraBackdropSegment[]): Promise<EnvNarrativeSegmentPackItem[]> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { messages } = buildVideoLlmMessages(PROMPT_FILE, { step20EraBackdropSegments: segments });
  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(
      messages,
      {
        debugStepId: "era_env_narrative_pack_150_backdrop",
        temperature: 0.25,
        useJsonObject: true,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`ERA_ENV_NARRATIVE_PACK_150_INVALID: 模型调用或 JSON 解析失败。${msg}`);
  }

  const rows = assertEraEnvPackShape(parsed, segments);
  return mergeEraBackdropIntoPack(segments, rows);
}
