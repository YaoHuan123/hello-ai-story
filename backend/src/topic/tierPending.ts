import fs from "node:fs";
import path from "node:path";
import { getUserRootDir } from "../services/workspace.service";
import { normalizePendingPickRow } from "./pendingPickRow";
import type { PendingSelection } from "./types";

const SELECTION_DIR = "选题";

/** tier1～8 各档待选文件档位。 */
export type TierFileTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** `{userRoot}/选题/tier{N}.json` */
export function tierPendingPath(userId: string, tier: TierFileTier): string {
  return path.join(getUserRootDir(userId), SELECTION_DIR, `tier${tier}.json`);
}

export function readTierPending(userId: string, tier: TierFileTier): PendingSelection | null {
  const p = tierPendingPath(userId, tier);
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
  userId: string,
  data: PendingSelection,
  writeJsonAtomic: (filePath: string, payload: unknown) => void,
): void {
  const tier = data.tier;
  if (tier < 1 || tier > 8) {
    throw new Error(`TIER_PENDING_INVALID: 无效 tier ${tier}`);
  }
  for (const row of data.picks) {
    if (row.pick.tier !== tier) {
      throw new Error(
        `TIER_PENDING_INVALID: pick.tier ${row.pick.tier} 与文件 tier ${tier} 不一致`,
      );
    }
  }
  writeJsonAtomic(tierPendingPath(userId, tier as TierFileTier), data);
}
