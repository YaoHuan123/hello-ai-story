import fs from "node:fs";
import path from "node:path";
import { getUserRootDir } from "./workspace.service";
import { getTopicFieldKeys } from "../topic/catalog";
import { pendingRowsToPicks } from "../topic/pendingPickRow";
import { selectTopics } from "../topic/selectTopics";
import { readTierPending, tierPendingPath, writeTierPending } from "../topic/tierPending";
import type { TierFileTier } from "../topic/tierPending";
import type {
  AnsweredSection,
  CurrentStage,
  PendingPickRow,
  PendingSelection,
  QuestionSet,
  TopicPick,
} from "../topic/types";

const SELECTION_DIR = "选题";
const STAGE_FILE = "current-stage.json";

type StageTier = CurrentStage["tier"];

function selectionDir(userId: string): string {
  return path.join(getUserRootDir(userId), SELECTION_DIR);
}

function stagePath(userId: string): string {
  return path.join(selectionDir(userId), STAGE_FILE);
}

/** 原子写：先写临时文件再 rename，避免并发部分写。 */
function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

function isNoCandidateError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("TOPIC_NO_CANDIDATE");
}

/** Tier5～8：故事素材条数不足，接口1 转为返回空列表。 */
function isMaterialMinEntriesError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("MATERIAL_MIN_ENTRIES");
}

function isMissingInputError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("TOPIC_MISSING_INPUT");
}

function readPendingForTier(userId: string, tier: StageTier): PendingSelection | null {
  return readTierPending(userId, tier);
}

function writePendingForTier(userId: string, pending: PendingSelection): void {
  writeTierPending(userId, pending, writeJsonAtomic);
}

/** 内部：读取当前阶段；无文件则初始化为 tier1 并落盘。 */
export function readCurrentStage(userId: string): CurrentStage {
  const p = stagePath(userId);
  if (fs.existsSync(p)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as CurrentStage;
      if (parsed.tier >= 1 && parsed.tier <= 8 && typeof parsed.updatedAt === "string") {
        return parsed;
      }
    } catch {
      /* fall through to init */
    }
  }
  const initial: CurrentStage = { tier: 1, updatedAt: new Date().toISOString() };
  writeCurrentStage(userId, initial.tier);
  return initial;
}

/** 内部：记录当前 tier 阶段。 */
export function writeCurrentStage(userId: string, tier: StageTier): CurrentStage {
  const stage: CurrentStage = { tier, updatedAt: new Date().toISOString() };
  writeJsonAtomic(stagePath(userId), stage);
  return stage;
}

function buildQuestionSetFromRow(row: PendingPickRow): QuestionSet {
  const pick = row.pick;
  switch (pick.kind) {
    case "catalog":
      return {
        title: pick.title,
        tier: pick.tier,
        kind: pick.kind,
        questions: getTopicFieldKeys(pick.title),
      };
    case "generated":
      return {
        title: pick.title,
        tier: pick.tier,
        kind: pick.kind,
        questions: row.questions ?? [],
      };
    case "hot_topic":
      return {
        title: pick.title,
        tier: pick.tier,
        kind: pick.kind,
        questions: [pick.title],
        suggestedAnswers:
          row.suggestedAnswers && row.suggestedAnswers.length > 0
            ? row.suggestedAnswers
            : undefined,
      };
    case "material_contradiction":
      return {
        title: pick.title,
        tier: pick.tier,
        kind: pick.kind,
        questions:
          row.questions && row.questions.length > 0
            ? row.questions
            : [`需要您确认的不一致表述：${pick.title}`],
        suggestedAnswers:
          row.suggestedAnswers && row.suggestedAnswers.length > 0
            ? row.suggestedAnswers
            : undefined,
      };
    case "material_gap":
      return {
        title: pick.title,
        tier: pick.tier,
        kind: pick.kind,
        questions: [`可以补充的细节：${pick.title}`],
      };
    case "material_turn":
      return {
        title: pick.title,
        tier: pick.tier,
        kind: pick.kind,
        questions: [pick.title],
        suggestedAnswers: pick.reason ? [pick.reason] : undefined,
      };
    case "material_inner":
      return {
        title: pick.title,
        tier: pick.tier,
        kind: pick.kind,
        questions: [pick.title],
        suggestedAnswers: ["是", "否"],
      };
    default:
      throw new Error(`TOPIC_INVALID_KIND: ${(pick as TopicPick).kind}`);
  }
}

/**
 * 阶段A：选题并持久化为**该档**待选（写入 `tier{N}.json`，覆盖该档上一轮）。
 *
 * 各档均依赖调用方传入的 `sections`（选题器不持久化 sections）。
 * 返回瘦身 {@link TopicPick}[]；题面在磁盘 `PendingPickRow` 中。
 */
export async function selectAndPersist(
  userId: string,
  params: { tier: StageTier; sections: AnsweredSection[] },
): Promise<TopicPick[]> {
  const rows = await selectTopics({ tier: params.tier, sections: params.sections });
  const pending: PendingSelection = {
    tier: params.tier,
    createdAt: new Date().toISOString(),
    picks: rows,
  };
  writePendingForTier(userId, pending);
  return pendingRowsToPicks(rows);
}

/** 读取指定档（或当前 stage）的 `tier{N}.json`；无则返回 null。 */
export function readPendingSelection(
  userId: string,
  tier?: StageTier,
): PendingSelection | null {
  const t = tier ?? readCurrentStage(userId).tier;
  return readTierPending(userId, t);
}

/**
 * 接口1：输出当前阶段待确认主题（瘦身 TopicPick，不含题面）。
 *
 * 若已有与当前 tier 一致的 `tier{N}.json`，直接返回（不重复选题）；
 * 否则调用 {@link selectAndPersist}。
 */
export async function getPendingTopics(
  userId: string,
  sections: AnsweredSection[],
): Promise<TopicPick[]> {
  const { tier } = readCurrentStage(userId);
  const existing = readPendingForTier(userId, tier);
  if (existing?.tier === tier) {
    return pendingRowsToPicks(existing.picks);
  }

  try {
    return await selectAndPersist(userId, { tier, sections });
  } catch (err) {
    if (isNoCandidateError(err) || isMaterialMinEntriesError(err) || isMissingInputError(err)) {
      const pending: PendingSelection = {
        tier,
        createdAt: new Date().toISOString(),
        picks: [],
      };
      writePendingForTier(userId, pending);
      return [];
    }
    throw err;
  }
}

/**
 * 接口2：从当前档待选轮取某一主题对应的题目（须在 advance 前调用）。
 *
 * @throws TOPIC_PICK_NOT_FOUND 无待选轮或其中无该 title
 */
export function getTopicQuestions(userId: string, title: string): QuestionSet {
  const { tier } = readCurrentStage(userId);
  const pending = readPendingForTier(userId, tier);
  if (!pending) {
    throw new Error("TOPIC_PICK_NOT_FOUND: 无待选轮，请先调用 getPendingTopics");
  }
  const row = pending.picks.find((r) => r.pick.title === title);
  if (!row) {
    throw new Error(`TOPIC_PICK_NOT_FOUND: 待选轮中无主题「${title}」`);
  }
  return buildQuestionSetFromRow(row);
}

/** 接口3：查询当前处于 tier1～8 哪个阶段。 */
export function getCurrentStage(userId: string): CurrentStage {
  return readCurrentStage(userId);
}

/** tier8→tier1 新一轮：清除各档待选，避免第二轮复用上一轮 tier{N}.json。 */
function clearAllTierPending(userId: string): void {
  for (let t = 1; t <= 8; t++) {
    const p = tierPendingPath(userId, t as TierFileTier);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }
}

/** 接口4：进入下一阶段（1→2→3→4→5→6→7→8→1 循环）。tier8→1 时清空各档 `tier{N}.json`。 */
export function advanceStage(userId: string): CurrentStage {
  const { tier } = readCurrentStage(userId);
  const next: StageTier = tier === 8 ? 1 : ((tier + 1) as StageTier);
  if (tier === 8) {
    clearAllTierPending(userId);
  }
  return writeCurrentStage(userId, next);
}
