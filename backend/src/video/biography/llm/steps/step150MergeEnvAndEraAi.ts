import { chatJson, getVideoLlmEnv, stringifyForAi } from "../../../shared/llm/client.js";
import { loadVideoPromptParts } from "../../../shared/llm/loadPrompt.js";
import type { CrossValidatedTimelineItem } from "./step110EnvNarrativePack.js";
import type { EraSubsceneSplitItem } from "../../../shared/llm/steps/step30EraSubsceneSplit.js";
import type { MergedNarrativeSegmentItem } from "./step150MergeEnvAndEra.js";

const PROMPT_FILE = "step-150_merge-env-and-era-ai.md";
const ERR = "MERGE_ENV_ERA_150_INVALID";

type MergeOrderKind = "timeline" | "era";

type MergeOrderItem = {
  kind: MergeOrderKind;
  segmentIndex: number;
};

type SourceIndex = {
  timelineBySegmentIndex: Map<number, CrossValidatedTimelineItem>;
  eraBySegmentIndex: Map<number, EraSubsceneSplitItem>;
  eraInputIndexBySegmentIndex: Map<number, number>;
};

function stripVisualScenesForAi(item: CrossValidatedTimelineItem | EraSubsceneSplitItem): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item as unknown as Record<string, unknown>)) {
    if (key !== "visualScenes") {
      out[key] = value;
    }
  }
  return out;
}

function buildMergeEnvAndEraAiPayload(input: {
  timelineSegments: CrossValidatedTimelineItem[];
  eraSegments: EraSubsceneSplitItem[];
}): {
  timelineSegments: Record<string, unknown>[];
  eraSegments: Record<string, unknown>[];
} {
  return {
    timelineSegments: input.timelineSegments.map(stripVisualScenesForAi),
    eraSegments: input.eraSegments.map(stripVisualScenesForAi),
  };
}

function buildSourceIndex(input: {
  timelineSegments: CrossValidatedTimelineItem[];
  eraSegments: EraSubsceneSplitItem[];
}): SourceIndex {
  const timelineBySegmentIndex = new Map<number, CrossValidatedTimelineItem>();
  const eraBySegmentIndex = new Map<number, EraSubsceneSplitItem>();
  const eraInputIndexBySegmentIndex = new Map<number, number>();

  for (const item of input.timelineSegments) {
    if (!Number.isInteger(item.segmentIndex) || item.segmentIndex < 1) {
      throw new Error(`${ERR}: timelineSegments 存在无效 segmentIndex: ${item.segmentIndex}`);
    }
    if (timelineBySegmentIndex.has(item.segmentIndex)) {
      throw new Error(`${ERR}: timelineSegments 存在重复 segmentIndex: ${item.segmentIndex}`);
    }
    timelineBySegmentIndex.set(item.segmentIndex, item);
  }

  for (let i = 0; i < input.eraSegments.length; i++) {
    const item = input.eraSegments[i];
    if (!Number.isInteger(item.segmentIndex) || item.segmentIndex < 1) {
      throw new Error(`${ERR}: eraSegments 存在无效 segmentIndex: ${item.segmentIndex}`);
    }
    if (eraBySegmentIndex.has(item.segmentIndex)) {
      throw new Error(`${ERR}: eraSegments 存在重复 segmentIndex: ${item.segmentIndex}`);
    }
    eraBySegmentIndex.set(item.segmentIndex, item);
    eraInputIndexBySegmentIndex.set(item.segmentIndex, i);
  }

  return {
    timelineBySegmentIndex,
    eraBySegmentIndex,
    eraInputIndexBySegmentIndex,
  };
}

function formatIndexList(indices: number[]): string {
  return indices.length > 0 ? indices.join(",") : "无";
}

function assertMergeOrderShape(parsed: unknown, sourceIndex: SourceIndex): MergeOrderItem[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${ERR}: 模型输出须为对象`);
  }
  const root = parsed as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length !== 1 || !Object.prototype.hasOwnProperty.call(root, "order")) {
    throw new Error(`${ERR}: 顶层须仅含 order，当前键: ${keys.join(",")}`);
  }

  const arr = root.order;
  if (!Array.isArray(arr)) {
    throw new Error(`${ERR}: order 须为数组`);
  }
  const expectedLength = sourceIndex.timelineBySegmentIndex.size + sourceIndex.eraBySegmentIndex.size;
  if (arr.length !== expectedLength) {
    throw new Error(`${ERR}: order 长度应为 ${expectedLength}，当前为 ${arr.length}`);
  }

  const out: MergeOrderItem[] = [];
  const seenTimeline = new Set<number>();
  const seenEra = new Set<number>();
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${ERR}: 第 ${i + 1} 项须为对象`);
    }
    const o = item as Record<string, unknown>;
    if (o.kind !== "timeline" && o.kind !== "era") {
      throw new Error(`${ERR}: 第 ${i + 1} 项 kind 只能为 timeline 或 era`);
    }
    if (typeof o.segmentIndex !== "number" || !Number.isInteger(o.segmentIndex) || o.segmentIndex < 1) {
      throw new Error(`${ERR}: 第 ${i + 1} 项 segmentIndex 须为 >=1 的整数`);
    }

    if (o.kind === "timeline") {
      if (!sourceIndex.timelineBySegmentIndex.has(o.segmentIndex)) {
        throw new Error(`${ERR}: 第 ${i + 1} 项 timeline segmentIndex 不存在: ${o.segmentIndex}`);
      }
      if (seenTimeline.has(o.segmentIndex)) {
        throw new Error(`${ERR}: timeline segmentIndex 重复出现在 order 中: ${o.segmentIndex}`);
      }
      seenTimeline.add(o.segmentIndex);
    } else {
      if (!sourceIndex.eraBySegmentIndex.has(o.segmentIndex)) {
        throw new Error(`${ERR}: 第 ${i + 1} 项 era segmentIndex 不存在: ${o.segmentIndex}`);
      }
      if (seenEra.has(o.segmentIndex)) {
        throw new Error(`${ERR}: era segmentIndex 重复出现在 order 中: ${o.segmentIndex}`);
      }
      seenEra.add(o.segmentIndex);
    }

    out.push({
      kind: o.kind,
      segmentIndex: o.segmentIndex,
    });
  }

  const missingTimeline = [...sourceIndex.timelineBySegmentIndex.keys()].filter((idx) => !seenTimeline.has(idx));
  const missingEra = [...sourceIndex.eraBySegmentIndex.keys()].filter((idx) => !seenEra.has(idx));
  if (missingTimeline.length > 0 || missingEra.length > 0) {
    throw new Error(
      `${ERR}: order 缺少输入项，timeline=${formatIndexList(missingTimeline)}，era=${formatIndexList(missingEra)}`,
    );
  }
  return out;
}

function copySourceSegment(
  item: CrossValidatedTimelineItem | EraSubsceneSplitItem,
  nextSegmentIndex: number,
): MergedNarrativeSegmentItem {
  const out: MergedNarrativeSegmentItem = {
    segmentIndex: nextSegmentIndex,
    narrative: item.narrative,
    timeLabel: item.timeLabel,
  };
  if (typeof item.originalNarrative === "string" && item.originalNarrative.trim()) {
    out.originalNarrative = item.originalNarrative;
  }
  if (Array.isArray(item.visualScenes) && item.visualScenes.length > 0) {
    out.visualScenes = item.visualScenes;
  }
  return out;
}

function findPreviousTimelineSegmentIndex(order: MergeOrderItem[], currentIndex: number): number | null {
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (order[i].kind === "timeline") {
      return order[i].segmentIndex;
    }
  }
  return null;
}

function findNextTimelineSegmentIndex(order: MergeOrderItem[], currentIndex: number): number | null {
  for (let i = currentIndex + 1; i < order.length; i++) {
    if (order[i].kind === "timeline") {
      return order[i].segmentIndex;
    }
  }
  return null;
}

function buildMergedNarrativeSegments(order: MergeOrderItem[], sourceIndex: SourceIndex): MergedNarrativeSegmentItem[] {
  return order.map((entry, i) => {
    const nextSegmentIndex = i + 1;
    if (entry.kind === "timeline") {
      const item = sourceIndex.timelineBySegmentIndex.get(entry.segmentIndex);
      if (!item) {
        throw new Error(`${ERR}: timeline segmentIndex 不存在: ${entry.segmentIndex}`);
      }
      return copySourceSegment(item, nextSegmentIndex);
    }

    const item = sourceIndex.eraBySegmentIndex.get(entry.segmentIndex);
    const eraInputIndex = sourceIndex.eraInputIndexBySegmentIndex.get(entry.segmentIndex);
    if (!item || eraInputIndex === undefined) {
      throw new Error(`${ERR}: era segmentIndex 不存在: ${entry.segmentIndex}`);
    }
    return {
      ...copySourceSegment(item, nextSegmentIndex),
      step20EraBackdropIndex: eraInputIndex,
      insertBefore: findNextTimelineSegmentIndex(order, i),
      insertAfterTimelineSegmentIndex: findPreviousTimelineSegmentIndex(order, i),
    };
  });
}

export async function runMergeEnvAndEraFromPipelineJson(input: {
  timelineSegments: CrossValidatedTimelineItem[];
  eraSegments: EraSubsceneSplitItem[];
}): Promise<MergedNarrativeSegmentItem[]> {
  if (input.timelineSegments.length === 0) {
    return [];
  }
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { systemText, userSuffix } = loadVideoPromptParts(PROMPT_FILE);
  const sourceIndex = buildSourceIndex(input);
  const pipelineStr = stringifyForAi(buildMergeEnvAndEraAiPayload(input));
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);

  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(
      [
        { role: "system", content: systemText },
        { role: "user", content: userContent },
      ],
      {
        debugStepId: "merge_env_era_160",
        temperature: 0.2,
        useJsonObject: true,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${ERR}: 模型调用或 JSON 解析失败。${msg}`);
  }
  const order = assertMergeOrderShape(parsed, sourceIndex);
  return buildMergedNarrativeSegments(order, sourceIndex);
}

