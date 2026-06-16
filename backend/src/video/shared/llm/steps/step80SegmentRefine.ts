import { chatJson, getVideoLlmEnv } from "../client.js";
import { buildVideoLlmMessages, stringifyVideoPipeline } from "../localeLlm.js";
import {
  derivePolishedSummariesFromClassifyRaw,
  normalizeStringRecordFromUnknown,
  normalizeTimelineSegmentItemsFromUnknown,
  type PolishedEventSummariesContextExpandedItem,
} from "./step70ContextExpand.js";

const PROMPT_FILE = "step-80_segment-refine.md";

export type SegmentRefinePipelineInput = {
  polishedEventSummariesContextExpanded: PolishedEventSummariesContextExpandedItem[];
  polishedContextSummaries: Record<string, string>;
};

/** 步骤 80 LLM 入参：仅事件扩写时间线，不含 context 摘要表。 */
export function segmentRefinePipelineForLlm(
  pipeline: SegmentRefinePipelineInput,
): Pick<SegmentRefinePipelineInput, "polishedEventSummariesContextExpanded"> {
  return { polishedEventSummariesContextExpanded: pipeline.polishedEventSummariesContextExpanded };
}

/**
 * 从步骤 70 落盘与步骤 60 落盘构建步骤 80 模型入参（上下文摘要缺省时从 60 派生）。
 */
export function buildSegmentRefinePipelineFromFiles(
  rawContextExpand: Record<string, unknown>,
  rawClassify: Record<string, unknown>,
): SegmentRefinePipelineInput {
  const polishedEventSummariesContextExpanded = normalizeTimelineSegmentItemsFromUnknown(
    rawContextExpand.polishedEventSummariesContextExpanded,
  );
  let polishedContextSummaries = normalizeStringRecordFromUnknown(rawContextExpand.polishedContextSummaries);
  if (Object.keys(polishedContextSummaries).length === 0) {
    polishedContextSummaries = derivePolishedSummariesFromClassifyRaw(rawClassify).polishedContextSummaries;
  }
  return {
    polishedEventSummariesContextExpanded,
    polishedContextSummaries,
  };
}

const EN_POINT_TIME_LABEL_RE = /^(\d{4})-(\d{1,2})$/;
const EN_RANGE_TIME_LABEL_RE = /^(\d{4})-(\d{1,2})\s+to\s+(\d{4})-(\d{1,2})$/i;
const POINT_TIME_LABEL_RE = /^(\d{4})年(\d{1,2})月$/;
const RANGE_TIME_LABEL_RE = /^(\d{4})年(\d{1,2})月-(\d{4})年(\d{1,2})月$/;
const YEAR_ONLY_TIME_LABEL_RE = /^(\d{4})年$/;
const YEAR_RANGE_TIME_LABEL_RE = /^(\d{4})年-(\d{4})年$/;

type ParsedTimelineTimeLabel =
  | { kind: "point"; start: number }
  | { kind: "range"; start: number; end: number };

function toYearMonthIndex(yearText: string, monthText: string): number | null {
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return year * 12 + month;
}

function parseStrictTimelineTimeLabel(timeLabel: string): ParsedTimelineTimeLabel | null {
  const enPoint = timeLabel.match(EN_POINT_TIME_LABEL_RE);
  if (enPoint) {
    const start = toYearMonthIndex(enPoint[1], enPoint[2]);
    return start === null ? null : { kind: "point", start };
  }

  const enRange = timeLabel.match(EN_RANGE_TIME_LABEL_RE);
  if (enRange) {
    const start = toYearMonthIndex(enRange[1], enRange[2]);
    const end = toYearMonthIndex(enRange[3], enRange[4]);
    if (start === null || end === null) {
      return null;
    }
    return { kind: "range", start, end };
  }

  const point = timeLabel.match(POINT_TIME_LABEL_RE);
  if (point) {
    const start = toYearMonthIndex(point[1], point[2]);
    return start === null ? null : { kind: "point", start };
  }

  const range = timeLabel.match(RANGE_TIME_LABEL_RE);
  if (range) {
    const start = toYearMonthIndex(range[1], range[2]);
    const end = toYearMonthIndex(range[3], range[4]);
    if (start === null || end === null) {
      return null;
    }
    return { kind: "range", start, end };
  }

  const yearOnly = timeLabel.match(YEAR_ONLY_TIME_LABEL_RE);
  if (yearOnly) {
    const start = toYearMonthIndex(yearOnly[1], "1");
    return start === null ? null : { kind: "point", start };
  }

  const yearRange = timeLabel.match(YEAR_RANGE_TIME_LABEL_RE);
  if (yearRange) {
    const start = toYearMonthIndex(yearRange[1], "1");
    const end = toYearMonthIndex(yearRange[2], "12");
    if (start === null || end === null) {
      return null;
    }
    return { kind: "range", start, end };
  }

  return null;
}

/** 模型偶发直接返回数组或单段对象；归一为 `{ splitDedupedTimelineSegments }`。 */
function coerceSegmentRefine80Root(parsed: unknown): Record<string, unknown> {
  if (Array.isArray(parsed)) {
    return { splitDedupedTimelineSegments: parsed };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("SEGMENT_REFINE_80_INVALID: 模型输出须为对象");
  }
  const root = parsed as Record<string, unknown>;
  if (Array.isArray(root.splitDedupedTimelineSegments)) {
    return root;
  }
  if (typeof root.narrative === "string" && typeof root.timeLabel === "string") {
    return { splitDedupedTimelineSegments: [root] };
  }
  throw new Error("SEGMENT_REFINE_80_INVALID: 缺少 splitDedupedTimelineSegments");
}

export function assertNoTimelineInterleave(items: PolishedEventSummariesContextExpandedItem[]): void {
  const parsedItems = items.map((item) => ({
    item,
    parsed: parseStrictTimelineTimeLabel(item.timeLabel),
  }));

  for (const source of parsedItems) {
    if (!source.parsed || source.parsed.kind !== "range") {
      continue;
    }
    for (const target of parsedItems) {
      if (source.item === target.item || !target.parsed) {
        continue;
      }
      if (source.parsed.start < target.parsed.start && target.parsed.start < source.parsed.end) {
        throw new Error(
          `SEGMENT_REFINE_80_TIMELINE_INTERLEAVE: 段#${source.item.segmentIndex} ` +
            `(${source.item.timeLabel}) 区间内严格包含段#${target.item.segmentIndex} ` +
            `(${target.item.timeLabel}) 的时间起点；请按内部时间点拆开段#${source.item.segmentIndex}。`,
        );
      }
    }
  }
}

function assertSplitDedupedTimelineSegmentsShape(
  parsed: unknown,
): PolishedEventSummariesContextExpandedItem[] {
  const root = coerceSegmentRefine80Root(parsed);
  const arr = root.splitDedupedTimelineSegments;
  if (!Array.isArray(arr)) {
    throw new Error("SEGMENT_REFINE_80_INVALID: splitDedupedTimelineSegments 须为数组");
  }

  const out: PolishedEventSummariesContextExpandedItem[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("SEGMENT_REFINE_80_INVALID: 数组项须为对象");
    }
    const o = item as Record<string, unknown>;
    if (typeof o.narrative !== "string" || !o.narrative.trim()) {
      throw new Error("SEGMENT_REFINE_80_INVALID: narrative 须为非空字符串");
    }
    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      throw new Error("SEGMENT_REFINE_80_INVALID: timeLabel 须为非空字符串");
    }
    const row: PolishedEventSummariesContextExpandedItem = {
      segmentIndex: out.length + 1,
      narrative: o.narrative.trim(),
      timeLabel: o.timeLabel.trim(),
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
    out.push(row);
  }
  return out;
}

export async function runSegmentRefineFromPipelineJson(
  pipeline: SegmentRefinePipelineInput,
): Promise<PolishedEventSummariesContextExpandedItem[]> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { messages } = buildVideoLlmMessages(PROMPT_FILE, segmentRefinePipelineForLlm(pipeline));
  const parsed = await chatJson<unknown>(
    messages,
    {
      debugStepId: "segment_refine_80",
      temperature: 0.15,
      useJsonObject: true,
    },
  );

  const items = assertSplitDedupedTimelineSegmentsShape(parsed);
  assertNoTimelineInterleave(items);
  return items;
}
