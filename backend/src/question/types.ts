/**
 * 出题模块类型：只消费选题器接口 2 的 `QuestionSet`，不读 template-config。
 *
 * 管道顺序：
 * - 开答前：去重(Q1) → 口语化(Q2) → 批量备选(Q3)，`runTemplatePrep` 串联
 * - 填表时：逐题 refine(Q4)、逐题备选(Q5)、`refineAndSuggestCurrent`、扩展追问(Q6)
 *
 * 详见 `docs/question-generation-module.md`。
 */
import { isBasicProfileTopicName } from "../topic/catalog";
import type { AnsweredSection, QuestionSet } from "../topic/types";

/** 全量已答小节（定义见 [`topic/types`](../topic/types.ts) 的 `AnsweredSection`） */
export type { AnsweredSection };
/** 接口 2 题集（定义见 [`topic/types`](../topic/types.ts) 的 `QuestionSet`） */
export type { QuestionSet };

// ─── 步骤 1：去重 ─────────────────────────────────────────────

/** 去重单条判定（与 dedupe prompt 的 `decisions[]` 对齐）。 */
export type DedupeDecision = {
  /** 模板题 key，与 `questionSet.questions` 某项字面一致 */
  question: string;
  /** true = sections 已能覆盖，本轮不必再问 */
  skip: boolean;
  /** 兼容旧 trace / 旧模型输出；新 prompt 不再要求模型输出 */
  reason?: string;
};

/** 步骤 1 入参。 */
export type DedupeQuestionsParams = {
  /** 全量已答小节（含本主题草稿合并后的 qa） */
  sections: AnsweredSection[];
  /** 本轮 catalog 题集；`kind`/`title` 用于守卫，`questions` 为待去重列表 */
  questionSet: QuestionSet;
};

/** 步骤 1 结果。 */
export type DedupeQuestionsResult = {
  /** 每道待去重题的判定列表，顺序与入参 `questionSet.questions` 子集一致 */
  decisions: DedupeDecision[];
  /** 去重判定为 skip 的题（仍为模板 key 文案） */
  skippedQuestions: string[];
  /** 去重后仍要问的题，顺序与 `decisions` 中 skip:false 一致 */
  askQuestions: string[];
};

// ─── 步骤 2：口语化 ───────────────────────────────────────────

/** 口语化单条（与 colloquialize prompt 的 `questions[]` 对齐）。 */
export type ColloquializeItem = {
  /** 模板题 key，与 `questionSet.questions` 某项字面一致 */
  question: string;
  /** 访谈展示用问句（canonical 英文），≤180 字符 */
  questionText: string;
  /** 兼容旧 trace / 旧模型输出；新 prompt 不再要求模型输出 */
  reason?: string;
};

/** 步骤 2 入参。 */
export type ColloquializeQuestionsParams = {
  /** 全量已答小节 */
  sections: AnsweredSection[];
  /** 本轮 catalog 题集 */
  questionSet: QuestionSet;
  /** 待口语化的模板 key 列表，通常为步骤 1 的 `askQuestions` */
  askQuestions: string[];
};

/**
 * 步骤 2 结果。
 * `questionTexts` 为 question key → 展示问句 映射，便于按 key 查找。
 */
export type ColloquializeQuestionsResult = {
  /** 与 prompt 对齐的逐条口语化结果 */
  questions: ColloquializeItem[];
  /** 展示问句映射：模板 key → `questionText` */
  questionTexts: Record<string, string>;
};

// ─── 步骤 3：批量备选 ─────────────────────────────────────────

/** 批量备选单条（与 suggest-batch prompt 的 `suggestions[]` 对齐）。 */
export type SuggestBatchItem = {
  /** 模板题 key */
  question: string;
  /** 可点选短答案，0～4 条，每条 ≤40 字 */
  suggestedAnswers: string[];
};

/** 步骤 3 入参。 */
export type SuggestBatchQuestionsParams = {
  /** 全量已答小节 */
  sections: AnsweredSection[];
  /** 本轮 catalog 题集 */
  questionSet: QuestionSet;
  /** 待推测备选的模板 key 列表 */
  askQuestions: string[];
  /** 展示问句映射，须来自步骤 2 的 `questionTexts` */
  questionTexts: Record<string, string>;
};

/** 步骤 3 结果。 */
export type SuggestBatchQuestionsResult = {
  /** 与 prompt 对齐的逐条批量备选 */
  suggestions: SuggestBatchItem[];
  /** 点选备选映射：模板 key → 0～4 条短答案 */
  answerSuggestions: Record<string, string[]>;
};

// ─── 步骤 4：开答前编排 ───────────────────────────────────────

/** 步骤 4 入参（一次调用跑 Q1→Q2→Q3）。 */
export type TemplatePrepParams = {
  /** 全量已答小节 */
  sections: AnsweredSection[];
  /** 本轮 catalog 题集 */
  questionSet: QuestionSet;
};

/**
 * 步骤 4 结果（扁平汇总，不含各步 `DedupeQuestionsResult` 等子结构）。
 *
 * 需要单步明细时直接调用 `dedupeQuestions` / `colloquializeQuestions` / `suggestBatchAnswers`。
 */
export type TemplatePrepResult = {
  /**
   * 是否整包跳过 Q1～Q3 LLM（基本档案、gen_* 等）。
   * true 时 `questionTexts` 为模板题原文，`answerSuggestions` 为空。
   * 与 `skippedQuestions` 不同：后者仅在跑过去重后表示「被去重掉的题」。
   */
  skipped: boolean;
  /** 本轮实际要向用户展示的题（模板 key 列表） */
  askQuestions: string[];
  /** 去重后不必再问的题；`skipped===true` 时恒为 `[]` */
  skippedQuestions: string[];
  /** 展示问句：模板 key → 口语化文案（或跳过时与 key 相同） */
  questionTexts: Record<string, string>;
  /** 点选备选：模板 key → 0～4 条短答案（开答前批量推测） */
  answerSuggestions: Record<string, string[]>;
};

// ─── 填表共用：本主题已答 ─────────────────────────────────────

/**
 * 本主题**当前条**内已答一题（按答题顺序）。
 * 用于步骤 5/6/7 的 `answeredInTopic`（均不得含当前待问题）。
 */
export type AnsweredInTopicItem = {
  /** 模板题 key，与 `questionSet.questions` 某项字面一致 */
  question: string;
  /** 用户当时看到的问句（prep / refine 后的文案） */
  questionText: string;
  /** 用户提交的答案 */
  answer: string;
};

// ─── 步骤 5：逐题 refine ──────────────────────────────────────
//
// 触发：同子类从第 2 道模板题起，每展示一题前（第 1 题用 prep 的 questionTexts）。
// 展示：refine 的 questionText 覆盖该题开答前的批量口语化结果。

/** 步骤 5 入参。 */
export type RefineCurrentQuestionParams = {
  /** 全量已答小节 */
  sections: AnsweredSection[];
  /**
   * 与 prep 相同一轮的 `QuestionSet`。
   * - `kind` / `title`：守卫
   * - `title` → prompt
   * - `questions`：key 白名单（整表不送入 prompt）
   */
  questionSet: QuestionSet;
  /** 当前待展示的模板题 key */
  currentQuestion: string;
  /** 开答前批量口语化文案：`runTemplatePrep(...).questionTexts[currentQuestion]` */
  batchQuestionText: string;
  /**
   * 本主题已答；为空时不调 LLM，返回 `batchQuestionText`（第 1 题）。
   * 不得含 `currentQuestion`。
   */
  answeredInTopic: AnsweredInTopicItem[];
};

/** 步骤 5 结果（仅 open 问句，不输出备选）。 */
export type RefineCurrentQuestionResult = {
  /** 固定为 `open`（与 parse 输出对齐） */
  mode: "open";
  /** 结合已答上下文后的展示问句 */
  questionText: string;
  /** 改写说明，≤60 字；新 prompt 不再要求输出 */
  reason?: string;
};

// ─── 步骤 6：逐题备选 ─────────────────────────────────────────
//
// 与步骤 5 同轮；依据本主题已答推断当前题备选。
// UI：`(prep.answerSuggestions[current] ∪ suggestedAnswers)` 去重后最多 4 条。

/** 步骤 6 入参。 */
export type SuggestCurrentQuestionParams = {
  /** 全量已答小节 */
  sections: AnsweredSection[];
  /** @see RefineCurrentQuestionParams.questionSet */
  questionSet: QuestionSet;
  /** 当前模板题 key */
  currentQuestion: string;
  /**
   * 当前展示问句：第 1 题用 `prep.questionTexts[q]`；
   * 第 2 题起多为 `refineCurrentQuestion(...).questionText`。
   */
  questionText: string;
  /**
   * 本主题已答；为空时不调 LLM，返回空备选（第 1 题通常只用 prep 批量备选）。
   * 不得含 `currentQuestion`。
   */
  answeredInTopic: AnsweredInTopicItem[];
};

/** 步骤 6 结果。 */
export type SuggestCurrentQuestionResult = {
  /** 高置信答案列表，供合并进 UI chip；最多 4 条 */
  suggestedAnswers: string[];
};

// ─── 步骤 7：逐题 refine + 备选（合并）────────────────────────
//
// 填表展示一题时的一次调用：步骤 5 → 步骤 6 → 合并 batch 与逐题备选。

/** 步骤 7 入参。 */
export type RefineAndSuggestCurrentParams = {
  /** 全量已答小节 */
  sections: AnsweredSection[];
  /** 与 prep 相同一轮的 `QuestionSet` */
  questionSet: QuestionSet;
  /** 当前模板题 key */
  currentQuestion: string;
  /** 开答前批量口语化文案：`runTemplatePrep(...).questionTexts[currentQuestion]` */
  batchQuestionText: string;
  /** 开答前批量备选：`runTemplatePrep(...).answerSuggestions[currentQuestion]`，默认 `[]` */
  batchSuggestedAnswers?: string[];
  /** 本主题已答；不得含 `currentQuestion` */
  answeredInTopic: AnsweredInTopicItem[];
};

/**
 * 步骤 7 结果（扁平，供 UI 直接用）。
 *
 * `suggestedAnswers` = 逐题备选 ∪ 批量备选，去重，最多 4 条（逐题优先）。
 */
export type RefineAndSuggestCurrentResult = {
  /** 当前题展示问句（第 1 题多为批量口语化，第 2 题起多为 refine 结果） */
  questionText: string;
  /** 步骤 5 的改写说明 */
  refineReason: string;
  /** 逐题 ∪ 批量备选，去重，最多 4 条（逐题优先） */
  suggestedAnswers: string[];
};

// ─── 步骤 8：扩展追问 ─────────────────────────────────────────
//
// 触发：catalog 子类模板答完后，由调用方在适当时机调用（`templateAnswered` 非空）。
// 扩展题条数上限由编排层控制；本期出题模块不落盘 aiExtended。

/** 扩展追问单条（与 extend prompt 的 `questions[]` 对齐）。 */
export type ExtendQuestionItem = {
  /** 开放追问文案（canonical 英文），≤180 字符 */
  q: string;
  /** 0～4 条点选备选，仅轻量摘录/归一，每条 ≤40 字 */
  suggestedAnswers: string[];
};

/** 步骤 8 入参。 */
export type ExtendSubCategoryParams = {
  /** 全量已答小节（跨节去重、叙述者画像） */
  sections: AnsweredSection[];
  /** 须为 catalog；`title` 写入 prompt */
  questionSet: QuestionSet;
  /** 本子类当前条已答模板题（必填+选填），键为 question 原文 */
  templateAnswered: Record<string, string>;
};

/** 步骤 8 结果。 */
export type ExtendSubCategoryResult = {
  /** 0～3 条扩展开放题 */
  questions: ExtendQuestionItem[];
};

// ─── 编排守卫（各步共用）────────────────────────────────────

/**
 * 非 catalog 题集（生成题、热点、素材题等）不适用本模块 LLM 管道。
 * 单步调用抛 `*_NOT_APPLICABLE`；`runTemplatePrep` 抛 `TEMPLATE_PREP_NOT_APPLICABLE`。
 */
export function isCatalogPrepNotApplicable(questionSet: QuestionSet): boolean {
  return questionSet.kind !== "catalog";
}

/**
 * catalog 但豁免 LLM：标题为空、基本档案、gen_*。
 * `runTemplatePrep` 返回 `skipped: true`；单步直接调用抛 `*_SKIPPED`。
 */
export function isCatalogPrepSkipped(questionSet: QuestionSet): boolean {
  const title = questionSet.title.trim();
  if (!title || isBasicProfileTopicName(title)) return true;
  if (title.startsWith("gen_")) return true;
  return false;
}

/** @see isCatalogPrepNotApplicable */
export function isDedupeNotApplicable(questionSet: QuestionSet): boolean {
  return isCatalogPrepNotApplicable(questionSet);
}

/** @see isCatalogPrepSkipped */
export function isDedupeSkipped(questionSet: QuestionSet): boolean {
  return isCatalogPrepSkipped(questionSet);
}

/** @see isCatalogPrepNotApplicable */
export function isColloquializeNotApplicable(questionSet: QuestionSet): boolean {
  return isCatalogPrepNotApplicable(questionSet);
}

/** @see isCatalogPrepSkipped */
export function isColloquializeSkipped(questionSet: QuestionSet): boolean {
  return isCatalogPrepSkipped(questionSet);
}

/** @see isCatalogPrepNotApplicable */
export function isSuggestBatchNotApplicable(questionSet: QuestionSet): boolean {
  return isCatalogPrepNotApplicable(questionSet);
}

/** @see isCatalogPrepSkipped */
export function isSuggestBatchSkipped(questionSet: QuestionSet): boolean {
  return isCatalogPrepSkipped(questionSet);
}

/** @see isCatalogPrepSkipped */
export function isTemplatePrepSkipped(questionSet: QuestionSet): boolean {
  return isCatalogPrepSkipped(questionSet);
}

/** @see isCatalogPrepNotApplicable */
export function isTemplatePrepNotApplicable(questionSet: QuestionSet): boolean {
  return isCatalogPrepNotApplicable(questionSet);
}

/** @see isCatalogPrepNotApplicable */
export function isRefineNotApplicable(questionSet: QuestionSet): boolean {
  return isCatalogPrepNotApplicable(questionSet);
}

/** @see isCatalogPrepSkipped */
export function isRefineSkipped(questionSet: QuestionSet): boolean {
  return isCatalogPrepSkipped(questionSet);
}

/** @see isCatalogPrepNotApplicable */
export function isSuggestCurrentNotApplicable(questionSet: QuestionSet): boolean {
  return isCatalogPrepNotApplicable(questionSet);
}

/** @see isCatalogPrepSkipped */
export function isSuggestCurrentSkipped(questionSet: QuestionSet): boolean {
  return isCatalogPrepSkipped(questionSet);
}

/** 扩展追问：非 catalog 不适用。 @see isCatalogPrepNotApplicable */
export function isExtendNotApplicable(questionSet: QuestionSet): boolean {
  return isCatalogPrepNotApplicable(questionSet);
}

/** 扩展追问：基本档案、gen_* 等跳过。 @see isCatalogPrepSkipped */
export function isExtendSkipped(questionSet: QuestionSet): boolean {
  return isCatalogPrepSkipped(questionSet);
}
