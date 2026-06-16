import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "./interviewWorkspace.service";
import { getInterviewRootDir } from "./interviewWorkspace.service";

const SELECTION_DIR = "选题";
const GATES_FILE = "catalog-gates.json";

/** Tier1/2 选题连续跳过达到此次数 → 逃出 catalog 循环进 Tier3（不标记 tier1Exhausted）。 */
export const CATALOG_SKIP_ESCAPE_THRESHOLD = 4;

export type CatalogGates = {
  tier1Exhausted: boolean;
  tier2Skipped: boolean;
  /** Tier1/2 选题连续跳过次数（点选主题时归零） */
  consecutiveCatalogSkips?: number;
  /** 连续跳过触发的 catalog 循环逃出（不隐含 tier1Exhausted） */
  catalogLoopEscaped?: boolean;
  tier1ExhaustedAt?: string;
  tier2SkippedAt?: string;
  catalogLoopEscapedAt?: string;
};

function gatesPath(scope: InterviewScope): string {
  return path.join(getInterviewRootDir(scope), SELECTION_DIR, GATES_FILE);
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

function defaultGates(): CatalogGates {
  return { tier1Exhausted: false, tier2Skipped: false, consecutiveCatalogSkips: 0 };
}

function normalizeGates(parsed: CatalogGates): CatalogGates {
  const streak = parsed.consecutiveCatalogSkips;
  return {
    tier1Exhausted: parsed.tier1Exhausted === true,
    tier2Skipped: parsed.tier2Skipped === true,
    consecutiveCatalogSkips:
      typeof streak === "number" && Number.isInteger(streak) && streak >= 0 ? streak : 0,
    catalogLoopEscaped: parsed.catalogLoopEscaped === true,
    ...(parsed.tier1ExhaustedAt ? { tier1ExhaustedAt: parsed.tier1ExhaustedAt } : {}),
    ...(parsed.tier2SkippedAt ? { tier2SkippedAt: parsed.tier2SkippedAt } : {}),
    ...(parsed.catalogLoopEscapedAt ? { catalogLoopEscapedAt: parsed.catalogLoopEscapedAt } : {}),
  };
}

export function readCatalogGates(scope: InterviewScope): CatalogGates {
  const p = gatesPath(scope);
  if (!fs.existsSync(p)) return defaultGates();
  try {
    return normalizeGates(JSON.parse(fs.readFileSync(p, "utf-8")) as CatalogGates);
  } catch {
    return defaultGates();
  }
}

function writeCatalogGates(scope: InterviewScope, gates: CatalogGates): void {
  writeJsonAtomic(gatesPath(scope), gates);
}

/**
 * Tier3～8 是否已解锁。
 * 正常：Gate1 耗尽且 Tier2 曾跳过；或 catalog 循环逃出（连续跳过）且 Tier2 曾跳过。
 */
export function canEnterAdvancedTiers(scope: InterviewScope): boolean {
  const gates = readCatalogGates(scope);
  if (!gates.tier2Skipped) return false;
  return gates.tier1Exhausted || gates.catalogLoopEscaped === true;
}

export function markTier1Exhausted(scope: InterviewScope): void {
  const gates = readCatalogGates(scope);
  if (gates.tier1Exhausted) return;
  writeCatalogGates(scope, {
    ...gates,
    tier1Exhausted: true,
    tier1ExhaustedAt: new Date().toISOString(),
  });
}

export function markTier2Skipped(scope: InterviewScope): void {
  const gates = readCatalogGates(scope);
  if (gates.tier2Skipped) return;
  writeCatalogGates(scope, {
    ...gates,
    tier2Skipped: true,
    tier2SkippedAt: new Date().toISOString(),
  });
}

/** Tier1/2 选题跳过：连续计数 +1，返回新值。 */
export function incrementCatalogSkipStreak(scope: InterviewScope): number {
  const gates = readCatalogGates(scope);
  const next = (gates.consecutiveCatalogSkips ?? 0) + 1;
  writeCatalogGates(scope, { ...gates, consecutiveCatalogSkips: next });
  return next;
}

/** Tier1/2 点选主题：连续跳过计数归零。 */
export function resetCatalogSkipStreak(scope: InterviewScope): void {
  const gates = readCatalogGates(scope);
  if ((gates.consecutiveCatalogSkips ?? 0) === 0) return;
  writeCatalogGates(scope, { ...gates, consecutiveCatalogSkips: 0 });
}

export function markCatalogLoopEscaped(scope: InterviewScope): void {
  const gates = readCatalogGates(scope);
  if (gates.catalogLoopEscaped) return;
  writeCatalogGates(scope, {
    ...gates,
    catalogLoopEscaped: true,
    catalogLoopEscapedAt: new Date().toISOString(),
  });
}

/** 测试：直接写入门槛状态。 */
export function seedCatalogGates(scope: InterviewScope, gates: CatalogGates): void {
  writeCatalogGates(scope, normalizeGates(gates));
}
