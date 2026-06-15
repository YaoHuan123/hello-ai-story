import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "./interviewWorkspace.service";
import { getInterviewRootDir } from "./interviewWorkspace.service";

const SELECTION_DIR = "选题";
const GATES_FILE = "catalog-gates.json";

export type CatalogGates = {
  tier1Exhausted: boolean;
  tier2Skipped: boolean;
  tier1ExhaustedAt?: string;
  tier2SkippedAt?: string;
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
  return { tier1Exhausted: false, tier2Skipped: false };
}

export function readCatalogGates(scope: InterviewScope): CatalogGates {
  const p = gatesPath(scope);
  if (!fs.existsSync(p)) return defaultGates();
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as CatalogGates;
    return {
      tier1Exhausted: parsed.tier1Exhausted === true,
      tier2Skipped: parsed.tier2Skipped === true,
      ...(parsed.tier1ExhaustedAt ? { tier1ExhaustedAt: parsed.tier1ExhaustedAt } : {}),
      ...(parsed.tier2SkippedAt ? { tier2SkippedAt: parsed.tier2SkippedAt } : {}),
    };
  } catch {
    return defaultGates();
  }
}

function writeCatalogGates(scope: InterviewScope, gates: CatalogGates): void {
  writeJsonAtomic(gatesPath(scope), gates);
}

/** Tier3～8 是否已解锁（Tier1 耗尽且 Tier2 曾跳过选题）。 */
export function canEnterAdvancedTiers(scope: InterviewScope): boolean {
  const gates = readCatalogGates(scope);
  return gates.tier1Exhausted && gates.tier2Skipped;
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

/** 测试：直接写入门槛状态。 */
export function seedCatalogGates(scope: InterviewScope, gates: CatalogGates): void {
  writeCatalogGates(scope, gates);
}
