import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { getInterviewRootDir } from "../services/interviewWorkspace.service";
import { normalizePendingPickRow } from "./pendingPickRow";
import type { PendingSelection } from "./types";

const SELECTION_DIR = "选题";
const PENDING_FILE = "pending.json";

/** tier1～8 档位（`pending.json` 内 `PendingSelection.tier`）。 */
export type TierFileTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** `{interviewRoot}/选题/pending.json` — 同一时刻仅一份，须与 `current-stage.json` 对齐。 */
export function pendingPath(scope: InterviewScope): string {
  return path.join(getInterviewRootDir(scope), SELECTION_DIR, PENDING_FILE);
}

export function deletePending(scope: InterviewScope): void {
  const p = pendingPath(scope);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
}

function parsePendingRaw(raw: unknown, expectedTier: TierFileTier): PendingSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as { tier?: number; createdAt?: string; picks?: unknown[] };
  if (parsed.tier !== expectedTier || !Array.isArray(parsed.picks) || typeof parsed.createdAt !== "string") {
    return null;
  }
  const picks = parsed.picks
    .map((item) => normalizePendingPickRow(item, expectedTier))
    .filter((row): row is NonNullable<typeof row> => row !== null);
  return { tier: expectedTier, createdAt: parsed.createdAt, picks };
}

/** 读当前档 pending；文件缺失、tier 不一致或损坏时返回 null。 */
export function readPending(scope: InterviewScope, expectedTier: TierFileTier): PendingSelection | null {
  const p = pendingPath(scope);
  if (!fs.existsSync(p)) return null;
  try {
    return parsePendingRaw(JSON.parse(fs.readFileSync(p, "utf-8")), expectedTier);
  } catch {
    return null;
  }
}

export function writePending(
  scope: InterviewScope,
  pending: PendingSelection,
  writeJson: (filePath: string, data: unknown) => void,
): void {
  writeJson(pendingPath(scope), pending);
}
