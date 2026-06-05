import fs from "node:fs";
import { loadVideoPromptParts } from "../loadPrompt.js";
import { chatJson, getVideoLlmEnv, stringifyForAi } from "../client.js";

const PROMPT_FILE = "step-30_era-subscene-split.md";

export type EraSubsceneSplitItem = {
  segmentIndex: number;
  narrative: string[];
  timeLabel: string;
  originalNarrative: string;
  visualScenes?: {
    sceneIndex: number;
    sceneDescription: string;
  }[];
};

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

function applyInputOriginalNarrativeToEraSubsceneResult(
  items: EraSubsceneSplitItem[],
  input: EraSubsceneSplitPipelineInput,
): EraSubsceneSplitItem[] {
  const inputByIndex = new Map<number, string>();
  for (let i = 0; i < input.step20EraBackdropSegments.length; i++) {
    const seg = input.step20EraBackdropSegments[i]!;
    const idx = seg.segmentIndex ?? i + 1;
    const narrative = typeof seg.narrative === "string" ? seg.narrative.trim() : "";
    if (narrative) {
      inputByIndex.set(idx, narrative);
    }
  }
  return items.map((item) => {
    const fromModel = typeof item.originalNarrative === "string" ? item.originalNarrative.trim() : "";
    const fromInput = inputByIndex.get(item.segmentIndex)?.trim() ?? "";
    return { ...item, originalNarrative: fromModel || fromInput };
  });
}

function applyInputTimeLabelsToEraSubsceneResult(
  items: EraSubsceneSplitItem[],
  input: EraSubsceneSplitPipelineInput,
): EraSubsceneSplitItem[] {
  const inputByIndex = new Map<number, string>();
  for (let i = 0; i < input.step20EraBackdropSegments.length; i++) {
    const seg = input.step20EraBackdropSegments[i]!;
    const idx = seg.segmentIndex ?? i + 1;
    const label = typeof seg.timeLabel === "string" ? seg.timeLabel.trim() : "";
    if (label) {
      inputByIndex.set(idx, label);
    }
  }
  return items.map((item) => {
    if (item.timeLabel.trim()) {
      return item;
    }
    const fromInput = inputByIndex.get(item.segmentIndex)?.trim();
    if (fromInput) {
      return { ...item, timeLabel: fromInput };
    }
    return item;
  });
}

function assertEraSubsceneSplitShape(parsed: unknown): EraSubsceneSplitItem[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ERA_SUBSCENE_SPLIT_30_INVALID: 模型输出须为对象");
  }
  const root = parsed as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length !== 1 || !Object.prototype.hasOwnProperty.call(root, "eraSubsceneSplitTimelineSegments")) {
    throw new Error(
      `ERA_SUBSCENE_SPLIT_30_INVALID: 顶层须仅含 eraSubsceneSplitTimelineSegments，当前键: ${keys.join(",")}`,
    );
  }
  const arr = root.eraSubsceneSplitTimelineSegments;
  if (!Array.isArray(arr)) {
    throw new Error("ERA_SUBSCENE_SPLIT_30_INVALID: eraSubsceneSplitTimelineSegments 须为数组");
  }

  const out: EraSubsceneSplitItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`ERA_SUBSCENE_SPLIT_30_INVALID: eraSubsceneSplitTimelineSegments[${i}] 须为对象`);
    }
    const o = item as Record<string, unknown>;
    const si = parseSegIdx(o.segmentIndex);
    if (si === null) {
      throw new Error(`ERA_SUBSCENE_SPLIT_30_INVALID: eraSubsceneSplitTimelineSegments[${i}].segmentIndex 无效`);
    }
    if (!Array.isArray(o.narrative) || o.narrative.length === 0) {
      throw new Error(`ERA_SUBSCENE_SPLIT_30_INVALID: eraSubsceneSplitTimelineSegments[${i}].narrative 须为非空数组`);
    }
    const narrative = o.narrative.filter((n): n is string => typeof n === "string" && n.trim() !== "").map(n => n.trim());
    if (narrative.length === 0) {
      throw new Error(`ERA_SUBSCENE_SPLIT_30_INVALID: eraSubsceneSplitTimelineSegments[${i}].narrative 须为非空数组`);
    }
    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      throw new Error(`ERA_SUBSCENE_SPLIT_30_INVALID: eraSubsceneSplitTimelineSegments[${i}].timeLabel 须为非空字符串`);
    }
    const row: EraSubsceneSplitItem = {
      segmentIndex: si,
      narrative,
      timeLabel: o.timeLabel.trim(),
      originalNarrative:
        typeof o.originalNarrative === "string" && o.originalNarrative.trim() ? o.originalNarrative.trim() : "",
    };
    out.push(row);
  }
  return out;
}

export type EraSubsceneSplitPipelineInput = {
  step20EraBackdropSegments: {
    segmentIndex?: number;
    narrative: string;
    timeLabel?: string;
  }[];
};

export type EraSubsceneSplitPipelineOutput = {
  eraSubsceneSplitTimelineSegments: EraSubsceneSplitItem[];
};

export async function runEraSubsceneSplitFromPipelineJson(
  input: EraSubsceneSplitPipelineInput,
): Promise<EraSubsceneSplitPipelineOutput> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { systemText, userSuffix } = loadVideoPromptParts(PROMPT_FILE);
  const pipelineStr = stringifyForAi(input);
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);

  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(
      [
        { role: "system", content: systemText },
        { role: "user", content: userContent },
      ],
      {
        debugStepId: "era_subscene_split_30",
        temperature: 0.25,
        useJsonObject: true,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`ERA_SUBSCENE_SPLIT_30_INVALID: 模型调用或 JSON 解析失败。${msg}`);
  }

  const result = assertEraSubsceneSplitShape(parsed);
  let merged = applyInputTimeLabelsToEraSubsceneResult(result, input);
  merged = applyInputOriginalNarrativeToEraSubsceneResult(merged, input);
  for (let i = 0; i < merged.length; i++) {
    if (!merged[i]!.timeLabel.trim()) {
      throw new Error(
        `ERA_SUBSCENE_SPLIT_30_INVALID: eraSubsceneSplitTimelineSegments[${i}].timeLabel 须为非空字符串（步骤100 未提供 timeLabel 且模型未推断；请重试本步，或重跑步骤100）`,
      );
    }
    if (!merged[i]!.originalNarrative.trim()) {
      throw new Error(
        `ERA_SUBSCENE_SPLIT_30_INVALID: eraSubsceneSplitTimelineSegments[${i}].originalNarrative 为空（须由输入 step20 段 narrative 回填）`,
      );
    }
  }
  return { eraSubsceneSplitTimelineSegments: merged };
}

export function buildEraSubsceneSplitPipelineFromFiles(
  step20EraBackdropFilePath: string,
): EraSubsceneSplitPipelineInput {
  if (!fs.existsSync(step20EraBackdropFilePath)) {
    return { step20EraBackdropSegments: [] };
  }
  const raw = JSON.parse(fs.readFileSync(step20EraBackdropFilePath, "utf-8")) as Record<string, unknown>;
  const arr = raw.step20EraBackdropSegments;
  if (!Array.isArray(arr)) {
    return { step20EraBackdropSegments: [] };
  }
  const step20EraBackdropSegments: EraSubsceneSplitPipelineInput["step20EraBackdropSegments"] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const o = item as Record<string, unknown>;
    const narrative = typeof o.narrative === "string" ? o.narrative.trim() : "";
    if (!narrative) {
      continue;
    }
    const si = parseSegIdx(o.segmentIndex) ?? (i + 1);
    step20EraBackdropSegments.push({
      segmentIndex: si,
      narrative,
      timeLabel: typeof o.timeLabel === "string" ? o.timeLabel.trim() : "",
    });
  }
  return { step20EraBackdropSegments };
}
