import { isBasicProfileTopicName } from "../topic/catalog";
import type { AnsweredSection } from "../topic/types";

/** 每个已完成的选题 tier 单元对应的视频预估单价（美元）。 */
export const VIDEO_ESTIMATE_USD_PER_TIER = 0.2;

export type VideoCostEstimate = {
  /** 计入计费的 tier 单元数 */
  tierCount: number;
  usdPerTier: number;
  /** (tierCount + 1) × usdPerTier */
  estimatedUsd: number;
  /** 无账本时回退为 sections 节数估算 */
  usedLegacyFallback: boolean;
};

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 旧数据：用非基本档案节数近似 tier 完成次数。 */
export function countBillableTiersFromSections(sections: AnsweredSection[]): number {
  return sections.filter((sec) => {
    const name = sec.name.trim();
    return name && !isBasicProfileTopicName(name);
  }).length;
}

/** 根据 tier 提交次数估算传记视频制作费用。 */
export function estimateVideoCostFromTierCount(
  tierCount: number,
  opts?: { usedLegacyFallback?: boolean },
): VideoCostEstimate {
  const n = Math.max(0, Math.floor(tierCount));
  return {
    tierCount: n,
    usdPerTier: VIDEO_ESTIMATE_USD_PER_TIER,
    estimatedUsd: roundUsd((n + 1) * VIDEO_ESTIMATE_USD_PER_TIER),
    usedLegacyFallback: opts?.usedLegacyFallback === true,
  };
}

/**
 * 优先读 tier-commits 账本条数；无账本时用 sections 快照回退。
 * 文本生成时应与 sections 快照同一时刻调用，保证费用与输入一致。
 */
export function estimateVideoCostForSections(
  sections: AnsweredSection[],
  tierCommitCount: number,
): VideoCostEstimate {
  if (tierCommitCount > 0) {
    return estimateVideoCostFromTierCount(tierCommitCount);
  }
  return estimateVideoCostFromTierCount(countBillableTiersFromSections(sections), {
    usedLegacyFallback: true,
  });
}
