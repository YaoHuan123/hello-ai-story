import { chatJson, getVideoLlmEnv, stringifyForAi } from "../../../shared/llm/client.js";
import { loadVideoPromptParts } from "../../../shared/llm/loadPrompt.js";
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

/** 模型偶发沿用步骤 80 键名或直接返回数组；归一为 `{ subsceneSplitTimelineSegments }`。 */
function coerceSubsceneSplit90Root(parsed: unknown): Record<string, unknown> {
  if (Array.isArray(parsed)) {
    return { subsceneSplitTimelineSegments: parsed };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("SUBSCENE_SPLIT_90_INVALID: 模型输出须为对象");
  }
  const root = parsed as Record<string, unknown>;
  if (Array.isArray(root.subsceneSplitTimelineSegments)) {
    return root;
  }
  if (Array.isArray(root.splitDedupedTimelineSegments)) {
    return { subsceneSplitTimelineSegments: root.splitDedupedTimelineSegments };
  }
  if (typeof root.narrative === "string" || Array.isArray(root.narrative)) {
    return { subsceneSplitTimelineSegments: [root] };
  }
  throw new Error("SUBSCENE_SPLIT_90_INVALID: 缺少 subsceneSplitTimelineSegments");
}

function assertSubsceneSplitShape(parsed: unknown): SubsceneSplitItem[] {
  const root = coerceSubsceneSplit90Root(parsed);
  const arr = root.subsceneSplitTimelineSegments;
  if (!Array.isArray(arr)) {
    throw new Error("SUBSCENE_SPLIT_90_INVALID: subsceneSplitTimelineSegments 须为数组");
  }

  const out: SubsceneSplitItem[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("SUBSCENE_SPLIT_90_INVALID: 数组项须为对象");
    }
    const o = item as Record<string, unknown>;
    const si = parseSegIdx(o.segmentIndex) ?? out.length + 1;
    let narrative: string[] = [];
    if (typeof o.narrative === "string" && o.narrative.trim()) {
      narrative = [o.narrative.trim()];
    } else if (Array.isArray(o.narrative)) {
      narrative = o.narrative.filter((n): n is string => typeof n === "string" && n.trim() !== "").map((n) => n.trim());
    }
    if (narrative.length === 0) {
      throw new Error("SUBSCENE_SPLIT_90_INVALID: narrative 须为非空字符串或非空字符串数组");
    }
    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      throw new Error("SUBSCENE_SPLIT_90_INVALID: timeLabel 须为非空字符串");
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

  const { systemText, userSuffix } = loadVideoPromptParts(PROMPT_FILE);
  const pipelineStr = stringifyForAi(pipeline);
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);

  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(
      [
        { role: "system", content: systemText },
        { role: "user", content: userContent },
      ],
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

  const result = assertSubsceneSplitShape(parsed);
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
