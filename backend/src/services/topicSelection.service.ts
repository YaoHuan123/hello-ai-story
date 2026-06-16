import fs from "node:fs";
import path from "node:path";
import type { DisplayLocale } from "../content/displayLocale";
import { getInterviewDisplayLocale } from "../content/displayLocale";
import { shouldUseLegacyDisplayTranslation } from "../content/interviewOutputLocale";
import { toCanonicalTopicNameFromDisplay, toDisplayTopicName } from "../content/translate/display";
import { toDisplayYesNo } from "../content/translate/yesNo";
import {
  lookupCanonicalEnFromDisplayCache,
  translateTextsForDisplay,
} from "../content/translate/runtime";
import type { InterviewScope } from "./interviewWorkspace.service";
import { getInterviewRootDir } from "./interviewWorkspace.service";
import { getTopicFieldKeys } from "../topic/catalog";
import {
  contradictionQuestionFallback,
  gapQuestionText,
  MATERIAL_INNER_SUGGESTIONS,
} from "../topic/materialCopy";
import { splitIntoSingleQuestions } from "../topic/parse";
import { pendingRowsToPicks } from "../topic/pendingPickRow";
import { selectTopics } from "../topic/selectTopics";
import { deletePending, readPending, writePending } from "../topic/tierPending";
import { canEnterAdvancedTiers, markTier1Exhausted } from "./catalogGates.service";
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

function selectionDir(scope: InterviewScope): string {
  return path.join(getInterviewRootDir(scope), SELECTION_DIR);
}

function stagePath(scope: InterviewScope): string {
  return path.join(selectionDir(scope), STAGE_FILE);
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

function readPendingForTier(scope: InterviewScope, tier: StageTier): PendingSelection | null {
  return readPending(scope, tier);
}

function writePendingForTier(scope: InterviewScope, pending: PendingSelection): void {
  writePending(scope, pending, writeJsonAtomic);
}

/** 内部：读取当前阶段；无文件则初始化为 tier1 并落盘。 */
export function readCurrentStage(scope: InterviewScope): CurrentStage {
  const p = stagePath(scope);
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
  writeCurrentStage(scope, initial.tier);
  return initial;
}

/** 内部：记录当前 tier 阶段。 */
export function writeCurrentStage(scope: InterviewScope, tier: StageTier): CurrentStage {
  const stage: CurrentStage = { tier, updatedAt: new Date().toISOString() };
  writeJsonAtomic(stagePath(scope), stage);
  return stage;
}

function buildQuestionSetFromRow(row: PendingPickRow, locale: DisplayLocale): QuestionSet {
  const pick = row.pick;
  switch (pick.kind) {
    case "catalog":
      return {
        title: pick.title,
        tier: pick.tier,
        kind: pick.kind,
        questions: getTopicFieldKeys(pick.title),
      };
    case "generated": {
      const flat: string[] = [];
      for (const raw of row.questions ?? []) {
        for (const q of splitIntoSingleQuestions(String(raw))) {
          if (q && !flat.includes(q)) flat.push(q);
        }
      }
      return {
        title: pick.title,
        tier: pick.tier,
        kind: pick.kind,
        questions: flat.length > 0 ? flat.slice(0, 3) : [],
      };
    }
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
            : [contradictionQuestionFallback(pick.title, locale)],
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
        questions: [gapQuestionText(pick.title, locale)],
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
        suggestedAnswers: MATERIAL_INNER_SUGGESTIONS.map((s) => toDisplayYesNo(s, locale)),
      };
    default:
      throw new Error(`TOPIC_INVALID_KIND: ${(pick as TopicPick).kind}`);
  }
}

/**
 * 阶段A：选题并持久化为当前档待选（写入 `pending.json`）。
 */
export async function selectAndPersist(
  scope: InterviewScope,
  params: { tier: StageTier; sections: AnsweredSection[] },
): Promise<TopicPick[]> {
  const rows = await selectTopics({ tier: params.tier, sections: params.sections });
  const pending: PendingSelection = {
    tier: params.tier,
    createdAt: new Date().toISOString(),
    picks: rows,
  };
  writePendingForTier(scope, pending);
  return pendingRowsToPicks(rows);
}

/** 读取指定档（或当前 stage）的 `pending.json`；无或与 tier 不一致则返回 null。 */
export function readPendingSelection(
  scope: InterviewScope,
  tier?: StageTier,
): PendingSelection | null {
  const t = tier ?? readCurrentStage(scope).tier;
  return readPending(scope, t);
}

/**
 * 接口1：输出当前阶段待确认主题（瘦身 TopicPick，不含题面）。
 *
 * 若已有与当前 tier 一致的 `pending.json`，直接返回（不重复选题）；
 * 否则调用 {@link selectAndPersist}。
 *
 * 产品路径：用户逐档完成 tier 后再 advance（见 docs/topic-selection-module.md §2.1）。
 * 同档内忽略 sections 复用 pending 是预期；下一档在 advance 删档后用最新 sections 重算。
 */
export async function getPendingTopics(
  scope: InterviewScope,
  sections: AnsweredSection[],
): Promise<TopicPick[]> {
  const { tier } = readCurrentStage(scope);
  const existing = readPendingForTier(scope, tier);
  if (existing) {
    const picks = pendingRowsToPicks(existing.picks);
    if (tier === 1 && picks.length === 0) {
      markTier1Exhausted(scope);
    }
    return picks;
  }

  try {
    const picks = await selectAndPersist(scope, { tier, sections });
    if (tier === 1 && picks.length === 0) {
      markTier1Exhausted(scope);
    }
    return picks;
  } catch (err) {
    if (isNoCandidateError(err) || isMaterialMinEntriesError(err) || isMissingInputError(err)) {
      const pending: PendingSelection = {
        tier,
        createdAt: new Date().toISOString(),
        picks: [],
      };
      writePendingForTier(scope, pending);
      if (tier === 1) {
        markTier1Exhausted(scope);
      }
      return [];
    }
    throw err;
  }
}

/**
 * 选主题提交：将用户点选的展示标题还原为 pending 中的 canonical `pick.title`。
 * catalog 走中英文名映射；generated / hot_topic 等走缓存或展示翻译对齐。
 */
export function resolveTopicTitleFromPendingSync(
  scope: InterviewScope,
  displayValue: string,
  locale: DisplayLocale,
): string | null {
  const value = displayValue.trim();
  if (!value) return null;

  const { tier } = readCurrentStage(scope);
  const pending = readPendingForTier(scope, tier);
  if (!pending) return null;

  for (const row of pending.picks) {
    const title = row.pick.title.trim();
    if (title === value) return title;
    if (toDisplayTopicName(title, locale) === value) return title;
    if (locale === "zh") {
      const fromCache = lookupCanonicalEnFromDisplayCache(scope, value);
      if (fromCache === title) return title;
    }
  }
  return null;
}

/**
 * 选主题提交：优先 pending 同步匹配，必要时复用展示翻译管道（与 getCurrentQuestion 一致）。
 *
 * @throws TOPIC_PICK_NOT_FOUND 待选轮中无匹配主题
 * @throws CATALOG_TOPIC_NOT_FOUND 无 pending 且非 catalog 名
 */
export async function resolveTopicTitleForSubmit(
  scope: InterviewScope,
  displayValue: string,
  locale: DisplayLocale,
): Promise<string> {
  const value = displayValue.trim();
  if (!value) {
    throw new Error("TOPIC_PICK_NOT_FOUND: 空主题名");
  }

  const sync = resolveTopicTitleFromPendingSync(scope, value, locale);
  if (sync) return sync;

  const { tier } = readCurrentStage(scope);
  const pending = readPendingForTier(scope, tier);
  if (pending && pending.picks.length > 0 && locale === "zh") {
    const titles = pending.picks.map((r) => r.pick.title.trim()).filter(Boolean);
    const legacyTitles = titles.filter((t) => shouldUseLegacyDisplayTranslation(t, locale));
    if (legacyTitles.length > 0) {
      const displayed = await translateTextsForDisplay(scope, legacyTitles, locale);
      for (let i = 0; i < legacyTitles.length; i++) {
        if (displayed[i] === value) return legacyTitles[i]!;
      }
    }
  }

  try {
    return toCanonicalTopicNameFromDisplay(value, locale);
  } catch {
    throw new Error(`TOPIC_PICK_NOT_FOUND: 待选轮中无主题「${displayValue}」`);
  }
}

/**
 * 接口2：从当前档待选轮取某一主题对应的题目（须在 advance 前调用）。
 *
 * catalog 时 `questions` 为 field key 列表；口语问句由出题模块 `runTemplatePrep` 生成（见 docs/topic-selection-module.md §4.2）。
 *
 * @throws TOPIC_PICK_NOT_FOUND 无待选轮或其中无该 title
 */
export function getTopicQuestions(scope: InterviewScope, title: string): QuestionSet {
  const { tier } = readCurrentStage(scope);
  const pending = readPendingForTier(scope, tier);
  if (!pending) {
    throw new Error("TOPIC_PICK_NOT_FOUND: 无待选轮，请先调用 getPendingTopics");
  }
  const row = pending.picks.find((r) => r.pick.title === title);
  if (!row) {
    throw new Error(`TOPIC_PICK_NOT_FOUND: 待选轮中无主题「${title}」`);
  }
  return buildQuestionSetFromRow(row, getInterviewDisplayLocale(scope));
}

/** 接口3：查询当前处于 tier1～8 哪个阶段。 */
export function getCurrentStage(scope: InterviewScope): CurrentStage {
  return readCurrentStage(scope);
}

/** 接口4：进入下一阶段（1→2→3→4→5→6→7→8→1 循环）。升档时删除 `pending.json`。 */
export function advanceStage(scope: InterviewScope): CurrentStage {
  const { tier } = readCurrentStage(scope);
  deletePending(scope);
  const next: StageTier = tier === 8 ? 1 : ((tier + 1) as StageTier);
  return writeCurrentStage(scope, next);
}

function nextTierWithGates(scope: InterviewScope, tier: StageTier): StageTier {
  if (tier === 1) return 2;
  if (tier === 2) return canEnterAdvancedTiers(scope) ? 3 : 1;
  if (tier === 8) return 1;
  return (tier + 1) as StageTier;
}

/**
 * 带 Tier3～8 解锁门槛的升档：Tier2 答完/跳过后，未解锁则回到 Tier1 而非 Tier3。
 */
export function advanceStageWithGates(scope: InterviewScope): CurrentStage {
  const { tier } = readCurrentStage(scope);
  deletePending(scope);
  return writeCurrentStage(scope, nextTierWithGates(scope, tier));
}

/** Tier3～8 未解锁时，将阶段重置回 Tier1（不触发 LLM）。 */
export function resetToCatalogPhase(scope: InterviewScope): CurrentStage {
  deletePending(scope);
  return writeCurrentStage(scope, 1);
}
