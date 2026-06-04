import fs from "node:fs";
import path from "node:path";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { getInterviewRootDir } from "../services/interviewWorkspace.service";
import { normalizePendingPickRow } from "./pendingPickRow";
import type { PendingSelection } from "./types";

const SELECTION_DIR = "选题";

/** tier1～8 各档待选文件档位。 */
export type TierFileTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** `{interviewRoot}/选题/tier{N}.json` */
export function tierPendingPath(scope: InterviewScope, tier: TierFileTier): string {
  return path.join(getInterviewRootDir(scope), SELECTION_DIR, `tier${tier}.json`);
}

export function readTierPending(scope: InterviewScope, tier: TierFileTier): PendingSelection | null {
  const p = tierPendingPath(scope, tier);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as {
      tier?: number;
      createdAt?: string;
      picks?: unknown[];
    };
    if (parsed.tier !== tier || !Array.isArray(parsed.picks) || typeof parsed.createdAt !== "string") {
      return null;
    }
    const picks = parsed.picks
      .map((item) => normalizePendingPickRow(item, tier))
      .filter((row): row is NonNullable<typeof row> => row !== null);
    return { tier, createdAt: parsed.createdAt, picks };
  } catch {
    return null;
  }
}

export function writeTierPending(
  scope: InterviewScope,
  pending: PendingSelection,
  writeJson: (filePath: string, data: unknown) => void,
): void {
  const tier = pending.tier as TierFileTier;
  writeJson(tierPendingPath(scope, tier), pending);
}
