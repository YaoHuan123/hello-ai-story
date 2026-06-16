/**
 * Tier5 矛盾检测：解析 LLM 输出的 `factContradictions.items`。
 *
 * 与 `prompts/preprocess/contradiction.md` 的 JSON 约定对齐。
 */

const USER_QUESTION_MAX_LEN = 200;

/** 模型单条矛盾。 */
export type FactContradictionRaw = {
  /** 互斥叙述所涉节名，须全部存在于输入 `polishedEventSummaries` */
  involvedIds: string[];
  /** 矛盾类型/判定逻辑摘要（展示用，不含具体年月地名） */
  summary: string;
  /** 一句口语化开放问句，直接展示给用户 */
  userQuestion: string;
  needsUserFix: "yes" | "maybe" | "no";
  /** 0～2 条可选消解方向，映射为 PendingPickRow.suggestedAnswers */
  reconciliationHypotheses: string[];
};

function isNeedsUserFix(x: unknown): x is FactContradictionRaw["needsUserFix"] {
  return x === "yes" || x === "maybe" || x === "no";
}

/** 解析模型输出的 factContradictions.items。 */
export function parseFactContradictions(parsed: unknown, validIds: Set<string>): FactContradictionRaw[] {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("CONTRADICTION_INVALID: 模型输出不是对象");
  }
  const fc = (parsed as Record<string, unknown>).factContradictions;
  if (!fc || typeof fc !== "object" || Array.isArray(fc)) {
    throw new Error("CONTRADICTION_INVALID: 缺少 factContradictions");
  }
  const itemsRaw = (fc as Record<string, unknown>).items;
  if (!Array.isArray(itemsRaw)) {
    throw new Error("CONTRADICTION_INVALID: items 不是数组");
  }

  const out: FactContradictionRaw[] = [];
  for (const item of itemsRaw) {
    if (!item || typeof item !== "object") {
      throw new Error("CONTRADICTION_INVALID: items 含非对象项");
    }
    const o = item as Record<string, unknown>;
    const involvedIds = Array.isArray(o.involvedIds)
      ? o.involvedIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (involvedIds.length < 1) {
      throw new Error("CONTRADICTION_INVALID: involvedIds 须非空");
    }
    for (const id of involvedIds) {
      if (!validIds.has(id)) {
        throw new Error(`CONTRADICTION_INVALID: involvedIds 含未知 id「${id}」`);
      }
    }
    const summary = typeof o.summary === "string" ? o.summary.trim() : "";
    if (!summary) {
      throw new Error("CONTRADICTION_INVALID: summary 为空");
    }
    let userQuestion = typeof o.userQuestion === "string" ? o.userQuestion.trim() : "";
    if (!userQuestion) {
      userQuestion = `Please clarify: ${summary}`;
    }
    if (userQuestion.length > USER_QUESTION_MAX_LEN) {
      throw new Error("CONTRADICTION_INVALID: userQuestion 过长");
    }
    if (!isNeedsUserFix(o.needsUserFix)) {
      throw new Error("CONTRADICTION_INVALID: needsUserFix 非法");
    }
    let rh: string[] = [];
    if (o.reconciliationHypotheses != null) {
      if (!Array.isArray(o.reconciliationHypotheses)) {
        throw new Error("CONTRADICTION_INVALID: reconciliationHypotheses 须为数组");
      }
      rh = o.reconciliationHypotheses
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean)
        .slice(0, 2);
    }
    out.push({
      involvedIds,
      summary,
      userQuestion,
      needsUserFix: o.needsUserFix,
      reconciliationHypotheses: rh,
    });
  }
  return out;
}
