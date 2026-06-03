import type { PendingPickRow, TopicPick, TopicPickKind } from "./types";

const PICK_KEYS = ["tier", "kind", "title", "reason"] as const;

function isTopicPickKind(v: unknown): v is TopicPickKind {
  return (
    v === "catalog" ||
    v === "generated" ||
    v === "hot_topic" ||
    v === "material_contradiction" ||
    v === "material_gap" ||
    v === "material_turn" ||
    v === "material_inner"
  );
}

function parseTopicPick(raw: Record<string, unknown>, expectedTier: number): TopicPick | null {
  const tier = raw.tier;
  const kind = raw.kind;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (
    tier !== expectedTier ||
    !isTopicPickKind(kind) ||
    !title ||
    !reason
  ) {
    return null;
  }
  return { tier: tier as TopicPick["tier"], kind, title, reason };
}

function stringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const item of v) {
    const s = String(item ?? "").trim();
    if (s) out.push(s);
  }
  return out.length > 0 ? out : undefined;
}

/** 组装待写入 `tier{N}.json` 的一行。 */
export function toPendingRow(
  pick: TopicPick,
  extra?: { questions?: string[]; suggestedAnswers?: string[] },
): PendingPickRow {
  const row: PendingPickRow = { pick };
  const questions = extra?.questions?.filter((q) => q.trim());
  const suggestedAnswers = extra?.suggestedAnswers?.filter((s) => s.trim());
  if (questions && questions.length > 0) row.questions = questions;
  if (suggestedAnswers && suggestedAnswers.length > 0) row.suggestedAnswers = suggestedAnswers;
  return row;
}

/** 读盘：新格式 `{ pick }` 或旧扁平 TopicPick（含可选 questions/suggestedAnswers）。 */
export function normalizePendingPickRow(
  item: unknown,
  expectedTier: number,
): PendingPickRow | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;

  if (obj.pick && typeof obj.pick === "object") {
    const pick = parseTopicPick(obj.pick as Record<string, unknown>, expectedTier);
    if (!pick) return null;
    const row: PendingPickRow = { pick };
    const questions = stringArray(obj.questions);
    const suggestedAnswers = stringArray(obj.suggestedAnswers);
    if (questions) row.questions = questions;
    if (suggestedAnswers) row.suggestedAnswers = suggestedAnswers;
    return row;
  }

  const legacyPick: Record<string, unknown> = {};
  for (const k of PICK_KEYS) {
    if (k in obj) legacyPick[k] = obj[k];
  }
  const pick = parseTopicPick(legacyPick, expectedTier);
  if (!pick) return null;
  const row: PendingPickRow = { pick };
  const questions = stringArray(obj.questions);
  const suggestedAnswers = stringArray(obj.suggestedAnswers);
  if (questions) row.questions = questions;
  if (suggestedAnswers) row.suggestedAnswers = suggestedAnswers;
  return row;
}

export function pendingRowsToPicks(rows: PendingPickRow[]): TopicPick[] {
  return rows.map((r) => r.pick);
}
