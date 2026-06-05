import { chatJson, getVideoLlmEnv, stringifyForAi } from "../../../shared/llm/client.js";
import { loadVideoPromptParts } from "../../../shared/llm/loadPrompt.js";
import {
  derivePolishedSummariesFromClassifyRaw,
  normalizeStringRecordFromUnknown,
  type PolishedEventSummariesContextExpandedItem,
} from "../../../shared/llm/steps/step70ContextExpand.js";

const PROMPT_FILE = "step-100_living-context-refine.md";

export type LivingContextRefinePipelineInput = {
  subsceneSplitTimelineSegments: Array<{
    segmentIndex: number;
    narrative: string[];
    timeLabel: string;
    originalNarrative: string;
    title?: string;
    relatedTemplateIds?: string[];
  }>;
  polishedContextSummaries: Record<string, string>;
};

export type LivingContextRefineOutputItem = {
  segmentIndex: number;
  narrative: string[];
  timeLabel: string;
  originalNarrative: string;
  title?: string;
  relatedTemplateIds?: string[];
};

function parseSegmentIndex(v: unknown): number | null {
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

export function buildLivingContextRefinePipelineFromFiles(
  rawSegment80: Record<string, unknown>,
  rawClassify: Record<string, unknown>,
): LivingContextRefinePipelineInput {
  const rawSegments = (Array.isArray(rawSegment80.subsceneSplitTimelineSegments) ? rawSegment80.subsceneSplitTimelineSegments : Array.isArray(rawSegment80.splitDedupedTimelineSegments) ? rawSegment80.splitDedupedTimelineSegments : []) as unknown[];
  const subsceneSplitTimelineSegments: LivingContextRefinePipelineInput["subsceneSplitTimelineSegments"] = [];

  for (const item of rawSegments) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const o = item as Record<string, unknown>;
    const segIdx = parseSegmentIndex(o.segmentIndex);
    if (segIdx === null) {
      continue;
    }

    let narrative: string[] = [];
    if (typeof o.narrative === "string" && o.narrative.trim()) {
      narrative = [o.narrative.trim()];
    } else if (Array.isArray(o.narrative)) {
      narrative = o.narrative.filter((x): x is string => typeof x === "string" && x.trim() !== "").map(n => n.trim());
    }

    let originalNarrative = "";
    if (typeof o.originalNarrative === "string") {
      originalNarrative = o.originalNarrative.trim();
    } else if (typeof o.narrative === "string") {
      originalNarrative = o.narrative.trim();
    }

    if (narrative.length === 0 || !originalNarrative) {
      continue;
    }

    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      continue;
    }

    const row: LivingContextRefinePipelineInput["subsceneSplitTimelineSegments"][number] = {
      segmentIndex: segIdx,
      narrative,
      timeLabel: o.timeLabel.trim(),
      originalNarrative,
    };
    if (typeof o.title === "string" && o.title.trim()) {
      row.title = o.title.trim();
    }
    if (Array.isArray(o.relatedTemplateIds)) {
      const ids = o.relatedTemplateIds.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      if (ids.length) {
        row.relatedTemplateIds = ids;
      }
    }
    subsceneSplitTimelineSegments.push(row);
  }

  let polishedContextSummaries = normalizeStringRecordFromUnknown(rawSegment80.polishedContextSummaries);
  if (Object.keys(polishedContextSummaries).length === 0) {
    polishedContextSummaries = derivePolishedSummariesFromClassifyRaw(rawClassify).polishedContextSummaries;
  }

  return {
    subsceneSplitTimelineSegments,
    polishedContextSummaries,
  };
}

function assertLivingContextRefineShape(
  parsed: unknown,
  expectedSegments: LivingContextRefinePipelineInput["subsceneSplitTimelineSegments"],
): LivingContextRefineOutputItem[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LIVING_CONTEXT_REFINE_100_INVALID: 模型输出须为对象");
  }
  const root = parsed as Record<string, unknown>;
  const keys = Object.keys(root);
  if (keys.length !== 1 || !keys.includes("crossValidatedTimelineSegments")) {
    throw new Error(
      `LIVING_CONTEXT_REFINE_100_INVALID: 顶层须仅含 crossValidatedTimelineSegments，当前键: ${keys.join(",")}`,
    );
  }
  const arr = root.crossValidatedTimelineSegments;
  if (!Array.isArray(arr)) {
    throw new Error("LIVING_CONTEXT_REFINE_100_INVALID: crossValidatedTimelineSegments 须为数组");
  }
  if (arr.length !== expectedSegments.length) {
    throw new Error(
      `LIVING_CONTEXT_REFINE_100_INVALID: 数组长度须与输入一致（期望 ${expectedSegments.length}，实际 ${arr.length}）`,
    );
  }

  const expectedBySegmentIndex = new Map<number, LivingContextRefinePipelineInput["subsceneSplitTimelineSegments"][number]>();
  for (const s of expectedSegments) {
    expectedBySegmentIndex.set(s.segmentIndex, s);
  }
  const seenSegmentIndex = new Set<number>();

  // 模型仅回传 segmentIndex + 润色后的 narrative；timeLabel/originalNarrative/title/relatedTemplateIds 由服务端按 segmentIndex 合并。
  const out: LivingContextRefineOutputItem[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("LIVING_CONTEXT_REFINE_100_INVALID: 数组项须为对象");
    }
    const o = item as Record<string, unknown>;
    const segmentIndex = typeof o.segmentIndex === "number" && Number.isFinite(o.segmentIndex) ? o.segmentIndex : null;
    if (segmentIndex === null) {
      throw new Error("LIVING_CONTEXT_REFINE_100_INVALID: segmentIndex 须为数字");
    }
    if (seenSegmentIndex.has(segmentIndex)) {
      throw new Error("LIVING_CONTEXT_REFINE_100_INVALID: segmentIndex 重复");
    }
    const expectedItem = expectedBySegmentIndex.get(segmentIndex);
    if (!expectedItem) {
      throw new Error("LIVING_CONTEXT_REFINE_100_INVALID: segmentIndex 存在输入之外的项");
    }
    seenSegmentIndex.add(segmentIndex);

    let narrative: string[] = [];
    if (typeof o.narrative === "string" && o.narrative.trim()) {
      narrative = [o.narrative.trim()];
    } else if (Array.isArray(o.narrative)) {
      narrative = o.narrative.filter((x): x is string => typeof x === "string" && x.trim() !== "").map(n => n.trim());
    }
    if (narrative.length === 0) {
      throw new Error("LIVING_CONTEXT_REFINE_100_INVALID: narrative 须为非空字符串或非空字符串数组");
    }

    const row: LivingContextRefineOutputItem = {
      segmentIndex,
      narrative,
      timeLabel: expectedItem.timeLabel,
      originalNarrative: expectedItem.originalNarrative,
    };
    if (expectedItem.title) {
      row.title = expectedItem.title;
    }
    if (expectedItem.relatedTemplateIds && expectedItem.relatedTemplateIds.length) {
      row.relatedTemplateIds = expectedItem.relatedTemplateIds;
    }
    out.push(row);
  }
  if (seenSegmentIndex.size !== expectedSegments.length) {
    throw new Error("LIVING_CONTEXT_REFINE_100_INVALID: segmentIndex 数量与输入不一致");
  }
  return out;
}

export async function runLivingContextRefineFromPipelineJson(
  pipeline: LivingContextRefinePipelineInput,
): Promise<LivingContextRefineOutputItem[]> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { systemText, userSuffix } = loadVideoPromptParts(PROMPT_FILE);
  const pipelineStr = stringifyForAi(pipeline);
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);

  const parsed = await chatJson<unknown>(
    [
      { role: "system", content: systemText },
      { role: "user", content: userContent },
    ],
    {
      debugStepId: "living_context_refine_85",
      temperature: 0.2,
      useJsonObject: true,
    },
  );

  return assertLivingContextRefineShape(parsed, pipeline.subsceneSplitTimelineSegments);
}
