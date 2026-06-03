import type { GeneratedTopicPick, GatingConfidence, HotTopicPick, TopicRecommendation } from "./types";
import type { Topic } from "./catalog";
import { allowedHotTopicDomainIds, hotTopicDomainNameById } from "./hotTopicMap";

const TIER3_MIN_QUESTIONS = 1;
const TIER3_MAX_QUESTIONS = 3;
const TIER4_Q_MAX_LEN = 80;
const TIER4_MAX_SUGGESTIONS = 4;
const TIER4_SUGGESTION_MAX_LEN = 40;

/** 将 LLM 返回的一条话题行映射为 TopicRecommendation。 */
export function mapPickRow(
  candidates: Topic[],
  row: { name?: string; confidence?: string; reason?: string },
  label: string,
): TopicRecommendation {
  const name = String(row.name ?? "").trim();
  const matched = candidates.find((t) => t.name === name);
  if (!matched) {
    throw new Error(`TOPIC_LLM_INVALID: ${label}「${name}」不在候选中`);
  }
  const confidence = String(row.confidence ?? "").trim();
  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") {
    throw new Error(`TOPIC_LLM_INVALID: ${label} confidence 非法（${confidence}）`);
  }
  const reason = String(row.reason ?? "").trim();
  if (!reason) {
    throw new Error(`TOPIC_LLM_INVALID: ${label} reason 缺失`);
  }
  return {
    name: matched.name,
    confidence,
    reason,
  };
}

/** 将 LLM 返回的一条 Tier3 创意主题映射为 {@link GeneratedTopicPick}。 */
export function mapGeneratedPickRow(
  row: { title?: string; reason?: string; questions?: unknown },
  label: string,
): GeneratedTopicPick {
  const title = String(row.title ?? "").trim();
  if (!title) {
    throw new Error(`TOPIC_LLM_INVALID: ${label}.title 缺失`);
  }
  const reason = String(row.reason ?? "").trim();
  if (!reason) {
    throw new Error(`TOPIC_LLM_INVALID: ${label}.reason 缺失`);
  }
  if (!Array.isArray(row.questions)) {
    throw new Error(`TOPIC_LLM_INVALID: ${label}.questions 须为数组`);
  }
  const questions: string[] = [];
  for (let i = 0; i < row.questions.length; i++) {
    const q = String(row.questions[i] ?? "").trim();
    if (!q) {
      throw new Error(`TOPIC_LLM_INVALID: ${label}.questions[${i}] 为空`);
    }
    questions.push(q);
  }
  if (questions.length < TIER3_MIN_QUESTIONS || questions.length > TIER3_MAX_QUESTIONS) {
    throw new Error(
      `TOPIC_LLM_INVALID: ${label}.questions 须 ${TIER3_MIN_QUESTIONS}～${TIER3_MAX_QUESTIONS} 条，实际 ${questions.length} 条`,
    );
  }
  return { title, reason, questions };
}

/**
 * 将 LLM 返回的一条 Tier4 热点问句映射为 {@link HotTopicPick}。
 *
 * @param seenInBatch 本批已接纳的问句（用于批内去重）
 */
export function mapHotTopicRow(
  row: {
    domainId?: string;
    domainName?: string;
    q?: string;
    suggestedAnswers?: unknown;
  },
  label: string,
  seenInBatch: Set<string>,
): HotTopicPick {
  const domainId = String(row.domainId ?? "").trim();
  if (!domainId || !allowedHotTopicDomainIds().has(domainId)) {
    throw new Error(`TOPIC_LLM_INVALID: ${label}.domainId 非法（${domainId}）`);
  }
  let domainName = String(row.domainName ?? "").trim();
  if (!domainName) {
    domainName = hotTopicDomainNameById(domainId) ?? "";
  }
  if (!domainName) {
    throw new Error(`TOPIC_LLM_INVALID: ${label}.domainName 缺失`);
  }
  const q = String(row.q ?? "").trim();
  if (!q) {
    throw new Error(`TOPIC_LLM_INVALID: ${label}.q 缺失`);
  }
  if (q.length > TIER4_Q_MAX_LEN) {
    throw new Error(`TOPIC_LLM_INVALID: ${label}.q 超过 ${TIER4_Q_MAX_LEN} 字`);
  }
  if (seenInBatch.has(q)) {
    throw new Error(`TOPIC_LLM_INVALID: ${label}.q 与本批问句重复`);
  }

  const suggestedAnswers: string[] = [];
  if (row.suggestedAnswers !== undefined) {
    if (!Array.isArray(row.suggestedAnswers)) {
      throw new Error(`TOPIC_LLM_INVALID: ${label}.suggestedAnswers 须为数组`);
    }
    if (row.suggestedAnswers.length > TIER4_MAX_SUGGESTIONS) {
      throw new Error(
        `TOPIC_LLM_INVALID: ${label}.suggestedAnswers 超过 ${TIER4_MAX_SUGGESTIONS} 条`,
      );
    }
    for (let j = 0; j < row.suggestedAnswers.length; j++) {
      const s = String(row.suggestedAnswers[j] ?? "").trim();
      if (!s) continue;
      if (s.length > TIER4_SUGGESTION_MAX_LEN) {
        throw new Error(
          `TOPIC_LLM_INVALID: ${label}.suggestedAnswers[${j}] 超过 ${TIER4_SUGGESTION_MAX_LEN} 字`,
        );
      }
      suggestedAnswers.push(s);
    }
  }

  seenInBatch.add(q);
  return { domainId, domainName, q, suggestedAnswers };
}
