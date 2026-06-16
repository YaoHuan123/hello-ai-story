import { chatJson, getVideoLlmEnv } from "../../../shared/llm/client.js";
import { buildVideoLlmMessages, buildVideoLlmUserContent, stringifyVideoPipeline } from "../../../shared/llm/localeLlm.js";
import {
  normalizeTimelineSegmentItemsFromUnknown,
  type PolishedEventSummariesContextExpandedItem,
} from "../../../shared/llm/steps/step70ContextExpand.js";

const PROMPT_FILE = "step-90_subscene-split.md";

export type SubsceneSplitPipelineInput = {
  splitDedupedTimelineSegments: PolishedEventSummariesContextExpandedItem[];
  polishedContextSummaries: Record<string, string>;
};

export function buildSubsceneSplitPipelineFromFiles(
  rawSegmentRefine: Record<string, unknown>,
): SubsceneSplitPipelineInput {
  const splitDedupedTimelineSegments = normalizeTimelineSegmentItemsFromUnknown(
    rawSegmentRefine.splitDedupedTimelineSegments,
  );
  const polishedContextSummaries = (rawSegmentRefine.polishedContextSummaries as Record<string, string>) || {};
  return {
    splitDedupedTimelineSegments,
    polishedContextSummaries,
  };
}

export type SubsceneSplitItem = {
  segmentIndex: number;
  narrative: string[];
  timeLabel: string;
  originalNarrative: string;
  title?: string;
  relatedTemplateIds?: string[];
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

function narrativeStringsFromUnknown(v: unknown): string[] {
  if (typeof v === "string" && v.trim()) {
    return [v.trim()];
  }
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((n): n is string => typeof n === "string" && n.trim() !== "").map((n) => n.trim());
}

/** 模型偶发沿用步骤 80 键名；归一为 `{ subsceneSplitTimelineSegments }`（仍须满足对象数组形状）。 */
function coerceSubsceneSplit90Root(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SUBSCENE_SPLIT_90_INVALID: 模型输出须为对象");
  }
  const root = parsed as Record<string, unknown>;
  if (Array.isArray(root.subsceneSplitTimelineSegments)) {
    return root;
  }
  if (Array.isArray(root.splitDedupedTimelineSegments)) {
    throw new Error(
      "SUBSCENE_SPLIT_90_INVALID: 勿使用 splitDedupedTimelineSegments 作为输出键，须为 subsceneSplitTimelineSegments",
    );
  }
  throw new Error("SUBSCENE_SPLIT_90_INVALID: 缺少 subsceneSplitTimelineSegments");
}

/** 解析步骤 90 模型 JSON（严格形状；不含输入回填）。 */
export function parseSubsceneSplit90ModelOutput(parsed: unknown): SubsceneSplitItem[] {
  const root = coerceSubsceneSplit90Root(parsed);
  const arr = root.subsceneSplitTimelineSegments;
  if (!Array.isArray(arr)) {
    throw new Error("SUBSCENE_SPLIT_90_INVALID: subsceneSplitTimelineSegments 须为数组");
  }
  if (arr.length === 0) {
    throw new Error("SUBSCENE_SPLIT_90_INVALID: subsceneSplitTimelineSegments 须为非空数组");
  }

  const out: SubsceneSplitItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(
        `SUBSCENE_SPLIT_90_INVALID: subsceneSplitTimelineSegments[${i}] 须为对象（勿输出裸字符串或字符串数组，见 step-90 提示词）`,
      );
    }
    const o = item as Record<string, unknown>;
    const si = parseSegIdx(o.segmentIndex);
    if (si === null) {
      throw new Error(`SUBSCENE_SPLIT_90_INVALID: subsceneSplitTimelineSegments[${i}].segmentIndex 无效`);
    }
    const narrative = narrativeStringsFromUnknown(o.narrative);
    if (narrative.length === 0) {
      throw new Error(
        `SUBSCENE_SPLIT_90_INVALID: subsceneSplitTimelineSegments[${i}].narrative 须为非空字符串数组`,
      );
    }
    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      throw new Error(`SUBSCENE_SPLIT_90_INVALID: subsceneSplitTimelineSegments[${i}].timeLabel 须为非空字符串`);
    }
    out.push({
      segmentIndex: si,
      narrative,
      timeLabel: o.timeLabel.trim(),
      originalNarrative:
        typeof o.originalNarrative === "string" && o.originalNarrative.trim() ? o.originalNarrative.trim() : "",
    });
  }
  return out;
}

/** 从输入 splitDedupedTimelineSegments 回填 originalNarrative / timeLabel / title / relatedTemplateIds。 */
function mergeSubsceneSplitFromInput(
  items: SubsceneSplitItem[],
  input: SubsceneSplitPipelineInput,
): SubsceneSplitItem[] {
  const inputBySeg = new Map(input.splitDedupedTimelineSegments.map((s) => [s.segmentIndex, s]));
  return items.map((item) => {
    const src = inputBySeg.get(item.segmentIndex);
    const originalNarrative = item.originalNarrative.trim() || src?.narrative.trim() || "";
    const timeLabel = item.timeLabel.trim() || src?.timeLabel.trim() || "";
    const row: SubsceneSplitItem = {
      segmentIndex: item.segmentIndex,
      narrative: item.narrative,
      timeLabel,
      originalNarrative,
    };
    if (src?.title) {
      row.title = src.title;
    }
    if (src?.relatedTemplateIds?.length) {
      row.relatedTemplateIds = src.relatedTemplateIds;
    }
    return row;
  });
}

export async function runSubsceneSplitFromPipelineJson(
  pipeline: SubsceneSplitPipelineInput,
): Promise<SubsceneSplitItem[]> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { messages } = buildVideoLlmMessages(PROMPT_FILE, pipeline);
  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(messages,
      {
        debugStepId: "subscene_split_90",
        temperature: 0.15,
        useJsonObject: true,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`SUBSCENE_SPLIT_90_INVALID: 模型调用或 JSON 解析失败。${msg}`);
  }

  const result = parseSubsceneSplit90ModelOutput(parsed);
  const merged = mergeSubsceneSplitFromInput(result, pipeline);
  for (let i = 0; i < merged.length; i++) {
    if (!merged[i]!.timeLabel.trim()) {
      throw new Error(`SUBSCENE_SPLIT_90_INVALID: subsceneSplitTimelineSegments[${i}].timeLabel 为空`);
    }
    if (!merged[i]!.originalNarrative.trim()) {
      throw new Error(
        `SUBSCENE_SPLIT_90_INVALID: subsceneSplitTimelineSegments[${i}].originalNarrative 为空（须由输入 splitDedupedTimelineSegments 回填）`,
      );
    }
  }
  return merged;
}
