import fs from "node:fs";
import path from "node:path";
import { isBasicProfileTopicName } from "../topic/catalog";
import type { TopicPick, TopicPickKind } from "../topic/types";
import type { InterviewScope } from "./interviewWorkspace.service";
import { getInterviewRootDir } from "./interviewWorkspace.service";

const ANSWERED_DIR = "已答";
const TIER_COMMITS_FILE = "tier-commits.json";

export type TierCommitRecord = {
  tier: TopicPick["tier"];
  kind: TopicPickKind;
  /** canonical 节名 */
  title: string;
  committedAt: string;
};

function ledgerPath(scope: InterviewScope): string {
  return path.join(getInterviewRootDir(scope), ANSWERED_DIR, TIER_COMMITS_FILE);
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

/** 读取 tier 提交账本（按时间顺序追加）。 */
export function readTierCommits(scope: InterviewScope): TierCommitRecord[] {
  const p = ledgerPath(scope);
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as TierCommitRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 主题答完落库时追加一条 tier 记录（基本档案冷启动不计费、不写入）。 */
export function appendTierCommit(
  scope: InterviewScope,
  pick: Pick<TopicPick, "tier" | "kind" | "title">,
): void {
  const title = pick.title.trim();
  if (!title || isBasicProfileTopicName(title)) return;

  const row: TierCommitRecord = {
    tier: pick.tier,
    kind: pick.kind,
    title,
    committedAt: new Date().toISOString(),
  };
  const committed = readTierCommits(scope);
  committed.push(row);
  writeJsonAtomic(ledgerPath(scope), committed);
}

/** 测试 / 迁移：直接写入账本。 */
export function seedTierCommits(scope: InterviewScope, rows: TierCommitRecord[]): void {
  writeJsonAtomic(ledgerPath(scope), rows);
}
