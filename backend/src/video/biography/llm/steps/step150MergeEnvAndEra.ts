import type { EnvNarrativeSegmentPackItem } from "./step110EnvNarrativePack.js";
import type { EraSubsceneSplitItem } from "../../../shared/llm/steps/step30EraSubsceneSplit.js";
import type { CrossValidatedTimelineItem } from "./step110EnvNarrativePack.js";

/** 合并结果单行：场景包字段 + 来源与插入元数据 */
export type MergedNarrativeSegmentItem = {
  segmentIndex: number;
  narrative: string[];
  timeLabel: string;
  originalNarrative?: string;
  visualScenes?: {
    sceneIndex: number;
    sceneDescription: string;
  }[];
  step20EraBackdropIndex?: number;
  insertBefore?: number | null;
  insertAfterTimelineSegmentIndex?: number | null;
  voiceover?: string[];
};

/** 统一的合并项类型 */
export type UnifiedMergeItem = {
  segmentIndex: number;
  narrative: string[];
  timeLabel: string;
  originalNarrative?: string;
  visualScenes?: {
    sceneIndex: number;
    sceneDescription: string;
  }[];
};

function timeLabelOrEnvTime(item: EnvNarrativeSegmentPackItem | UnifiedMergeItem): string {
  const tl = (item as { timeLabel?: unknown }).timeLabel;
  if (typeof tl === "string" && tl.trim()) {
    return tl.trim();
  }
  const et = (item as { env_time?: unknown }).env_time;
  if (typeof et === "string" && et.trim()) {
    return et.trim();
  }
  return "";
}

/** 将 EraSubsceneSplitItem 转换为 UnifiedMergeItem */
function convertEraItemToUnified(item: EraSubsceneSplitItem, index: number): UnifiedMergeItem {
  return {
    segmentIndex: item.segmentIndex,
    narrative: item.narrative,
    timeLabel: item.timeLabel,
    originalNarrative: item.originalNarrative,
    visualScenes: item.visualScenes,
  };
}

/** 将 CrossValidatedTimelineItem 转换为 UnifiedMergeItem */
function convertTimelineItemToUnified(item: CrossValidatedTimelineItem, index: number): UnifiedMergeItem {
  return {
    segmentIndex: item.segmentIndex,
    narrative: item.narrative,
    timeLabel: item.timeLabel,
    originalNarrative: item.originalNarrative,
    visualScenes: item.visualScenes,
  };
}

/** 将 UnifiedMergeItem 转换为 MergedNarrativeSegmentItem */
function convertToMergedItem(
  item: UnifiedMergeItem,
  eraIndex?: number,
  insertBefore?: number | null,
  insertAfterTimelineSegmentIndex?: number | null
): MergedNarrativeSegmentItem {
  return {
    segmentIndex: item.segmentIndex,
    narrative: item.narrative ?? [],
    timeLabel: item.timeLabel ?? "",
    originalNarrative: item.originalNarrative,
    visualScenes: item.visualScenes,
    step20EraBackdropIndex: eraIndex,
    insertBefore,
    insertAfterTimelineSegmentIndex,
  };
}

function extractYear(text: string): number | null {
  const m = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (!m) {
    return null;
  }
  const y = Number.parseInt(m[1], 10);
  return Number.isFinite(y) ? y : null;
}

/**
 * 可比较时间键：优先取 env_time/timeLabel 中首个 4 位年份；否则用 fallbackOrder（数组下标）保证稳定。
 */
function sortKeyFromPack(item: EnvNarrativeSegmentPackItem | UnifiedMergeItem, fallbackOrder: number): number {
  const raw = timeLabelOrEnvTime(item);
  const y = extractYear(raw);
  if (y !== null) {
    return y * 10_000 + (Math.abs(item.segmentIndex) % 10_000);
  }
  return 1_000_000 + fallbackOrder;
}

/** 主线场景包：用于步骤 160 插入时代的「逻辑段」键（多镜头时多行共用） */
function timelineLogicalKey(row: EnvNarrativeSegmentPackItem | UnifiedMergeItem): number {
  return row.segmentIndex;
}

/**
 * 将主线场景包按 segmentIndex 分组，
 * 组内按 segmentIndex 排序。用于时代段落插入在「逻辑段」之间，而非镜头之间。
 */
function groupTimelineByLogicalSegment(timeline: (EnvNarrativeSegmentPackItem | UnifiedMergeItem)[]): (EnvNarrativeSegmentPackItem | UnifiedMergeItem)[][] {
  const sorted = [...timeline].sort((a, b) => {
    const la = timelineLogicalKey(a);
    const lb = timelineLogicalKey(b);
    return la - lb;
  });
  const groups: (EnvNarrativeSegmentPackItem | UnifiedMergeItem)[][] = [];
  for (const r of sorted) {
    const k = timelineLogicalKey(r);
    const last = groups[groups.length - 1];
    const prevKey = last?.[0] != null ? timelineLogicalKey(last[0]) : null;
    if (prevKey === null || k !== prevKey) {
      groups.push([r]);
    } else {
      last!.push(r);
    }
  }
  return groups;
}

/** 主线逻辑段数量（按 segmentIndex 去重计数） */
export function countLogicalTimelineSegments(timeline: EnvNarrativeSegmentPackItem[]): number {
  if (timeline.length === 0) {
    return 0;
  }
  return groupTimelineByLogicalSegment(timeline).length;
}

/** 新的合并函数，处理新的输入格式 */
export function mergeEraIntoTimelinePacksNew(
  timeline: CrossValidatedTimelineItem[],
  era: EraSubsceneSplitItem[]
): MergedNarrativeSegmentItem[] {
  if (timeline.length === 0) {
    return [];
  }

  // 转换为统一格式
  const unifiedTimeline = timeline.map((item, index) => convertTimelineItemToUnified(item, index));
  const unifiedEra = era.map((item, index) => convertEraItemToUnified(item, index));

  const groups = groupTimelineByLogicalSegment(unifiedTimeline);
  const T = groups.length;
  const timelineKeys = groups.map((g, i) => sortKeyFromPack(g[0], i));

  type EraSlot = { eraIndex: number; pivot: number; eraKey: number };
  const slots: EraSlot[] = [];
  for (let j = 0; j < unifiedEra.length; j++) {
    const ke = sortKeyFromPack(unifiedEra[j], j);
    let pivot = T;
    for (let i = 0; i < T; i++) {
      if (timelineKeys[i] > ke) {
        pivot = i;
        break;
      }
    }
    slots.push({ eraIndex: j, pivot, eraKey: ke });
  }

  slots.sort((a, b) => {
    if (a.pivot !== b.pivot) {
      return a.pivot - b.pivot;
    }
    if (a.eraKey !== b.eraKey) {
      return a.eraKey - b.eraKey;
    }
    return a.eraIndex - b.eraIndex;
  });

  const byPivot = new Map<number, EraSlot[]>();
  for (const s of slots) {
    const list = byPivot.get(s.pivot) ?? [];
    list.push(s);
    byPivot.set(s.pivot, list);
  }

  const out: MergedNarrativeSegmentItem[] = [];
  let newIdx = 1;

  const pushEra = (ej: number, pivot: number): void => {
    const eItem = unifiedEra[ej];
    const insertBefore: number | null = pivot < T ? timelineLogicalKey(groups[pivot][0]) : null;
    const insertAfterTimelineSegmentIndex: number | null =
      pivot > 0 ? timelineLogicalKey(groups[pivot - 1][0]) : null;
    out.push(convertToMergedItem(
      eItem, 
      ej, 
      insertBefore, 
      insertAfterTimelineSegmentIndex
    ));
  };

  for (let i = 0; i < T; i++) {
    for (const s of byPivot.get(i) ?? []) {
      pushEra(s.eraIndex, s.pivot);
    }
    for (const t of groups[i]) {
      out.push(convertToMergedItem(
        t as UnifiedMergeItem, 
        undefined,
        undefined,
        undefined
      ));
    }
  }

  for (const s of byPivot.get(T) ?? []) {
    pushEra(s.eraIndex, T);
  }

  // 重新编号
  out.forEach((item, index) => {
    item.segmentIndex = index + 1;
  });

  return out;
}

/**
 * 将时代场景包与个人（主线）场景包按时间键插入合并为 `mergedNarrativeSegments`。
 * 若 `timeline` 为空，返回 `[]`（与 prompts 中 160 合并规则约定一致）。
 */
export function mergeEraIntoTimelinePacks(
  timeline: EnvNarrativeSegmentPackItem[],
  era: EnvNarrativeSegmentPackItem[],
): MergedNarrativeSegmentItem[] {
  if (timeline.length === 0) {
    return [];
  }

  const groups = groupTimelineByLogicalSegment(timeline);
  const T = groups.length;
  const timelineKeys = groups.map((g, i) => sortKeyFromPack(g[0], i));

  type EraSlot = { eraIndex: number; pivot: number; eraKey: number };
  const slots: EraSlot[] = [];
  for (let j = 0; j < era.length; j++) {
    const ke = sortKeyFromPack(era[j], j);
    let pivot = T;
    for (let i = 0; i < T; i++) {
      if (timelineKeys[i] > ke) {
        pivot = i;
        break;
      }
    }
    slots.push({ eraIndex: j, pivot, eraKey: ke });
  }

  slots.sort((a, b) => {
    if (a.pivot !== b.pivot) {
      return a.pivot - b.pivot;
    }
    if (a.eraKey !== b.eraKey) {
      return a.eraKey - b.eraKey;
    }
    return a.eraIndex - b.eraIndex;
  });

  const byPivot = new Map<number, EraSlot[]>();
  for (const s of slots) {
    const list = byPivot.get(s.pivot) ?? [];
    list.push(s);
    byPivot.set(s.pivot, list);
  }

  const out: MergedNarrativeSegmentItem[] = [];
  let newIdx = 1;

  const pushEra = (ej: number, pivot: number): void => {
    const eItem = era[ej];
    const insertBefore: number | null = pivot < T ? timelineLogicalKey(groups[pivot][0]) : null;
    const insertAfterTimelineSegmentIndex: number | null =
      pivot > 0 ? timelineLogicalKey(groups[pivot - 1][0]) : null;
    out.push({
      segmentIndex: newIdx++,
      narrative: (eItem as any).narrative ?? [],
      timeLabel: (eItem as any).timeLabel ?? "",
      originalNarrative: (eItem as any).originalNarrative,
      visualScenes: (eItem as any).visualScenes,
      step20EraBackdropIndex: ej,
      insertBefore,
      insertAfterTimelineSegmentIndex,
    });
  };

  for (let i = 0; i < T; i++) {
    for (const s of byPivot.get(i) ?? []) {
      pushEra(s.eraIndex, s.pivot);
    }
    for (const t of groups[i]) {
      out.push({
        segmentIndex: newIdx++,
        narrative: (t as any).narrative ?? [],
        timeLabel: (t as any).timeLabel ?? "",
        originalNarrative: (t as any).originalNarrative,
        visualScenes: (t as any).visualScenes,
        insertBefore: undefined,
        insertAfterTimelineSegmentIndex: undefined,
      });
    }
  }

  for (const s of byPivot.get(T) ?? []) {
    pushEra(s.eraIndex, T);
  }

  return out;
}
