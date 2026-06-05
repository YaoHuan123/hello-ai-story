import { commitSection, getSections } from "./answeredSections.service";
import { runWithQuestionTrace, traceQuestionStep } from "../question/questionTrace";
import {
  answeredSectionFromTopic,
  getNextQuestion as engineGetNextQuestion,
  initQuestion,
  isTopicAnswered,
  submitAnswer as engineSubmitAnswer,
  type NextQuestionDisplay,
  type SubmitAnswerParams,
  type SubmittedAnswerMeta,
} from "./questionEngine.service";
import { clearTopicDir, readAnswers, readQuestionSet } from "../question/topicPersist";
import {
  advanceStage,
  getCurrentStage,
  getPendingTopics as selectPendingTopics,
  getTopicQuestions,
} from "./topicSelection.service";
import { getTopicFieldKeys, getTopicFieldMeta } from "../topic/catalog";
import { normalizeFieldAnswer } from "../topic/fieldAnswer";
import type { InterviewFieldType } from "../topic/fieldMeta";
import type { InterviewScope } from "./interviewWorkspace.service";
import type { CurrentStage, QuestionSet, TopicPick } from "../topic/types";

/** 新用户冷启动固定主题（与 template-config.v2.json 子类名一致）。 */
export const BASIC_PROFILE_TITLE = "基本档案";

function basicProfileQuestionSet(): QuestionSet {
  return {
    title: BASIC_PROFILE_TITLE,
    tier: 1,
    kind: "catalog",
    questions: getTopicFieldKeys(BASIC_PROFILE_TITLE),
  };
}

/**
 * 无已答、无进行中主题时初始化基本档案并取第一题。
 * @returns 第一道题展示；无题可问时 null（由调用方按空主题处理）
 */
async function startBasicProfileColdStart(scope: InterviewScope): Promise<NextQuestionDisplay | null> {
  initQuestion(scope, basicProfileQuestionSet());
  return engineGetNextQuestion(scope);
}

export type {
  NextQuestionDisplay,
  SubmitAnswerParams,
  SubmittedAnswerMeta,
} from "./questionEngine.service";

/** 选主题阶段的固定题目 key。 */
export const SELECT_TOPIC_KEY = "__select_topic__";

/**
 * 统一「题目」：可能是选主题，也可能是普通问答，由 `type` 区分。
 * 客户端始终拿到一个题目对象，按 `type` 渲染、把用户输入经 `submit` 交回。
 */
export type InterviewQuestion = {
  /** "topic" = 选主题；"normal" = 普通问答 */
  type: "topic" | "normal";
  /** 普通问答=当前主题标题；选主题=null */
  title: string | null;
  /** 题目 key：普通问答=题目 key；选主题=`SELECT_TOPIC_KEY` */
  key: string;
  /** 展示文案：选主题=提示语；普通问答=问句 */
  text: string;
  /** 可选项：选主题=候选主题标题；普通问答=LLM 备选答案 */
  options: string[];
  /** catalog 控件类型；缺省 text */
  fieldType?: InterviewFieldType;
  /** select 时的固定选项 */
  fieldChoices?: string[];
};

function toNormalQuestion(title: string, question: NextQuestionDisplay): InterviewQuestion {
  const meta = getTopicFieldMeta(title, question.key);
  return {
    type: "normal",
    title,
    key: question.key,
    text: question.text,
    options: question.suggestions,
    fieldType: meta?.fieldType ?? "text",
    ...(meta?.fieldChoices ? { fieldChoices: meta.fieldChoices } : {}),
  };
}

/** 提交载荷：`value` = 选主题阶段的主题标题，或普通问答阶段的答案。 */
export type SubmitInput = {
  key: string;
  text: string;
  value: string;
};

/** 对外：带 trace 的 getCurrentQuestion（HTTP 层调用）。 */
export async function getCurrentQuestionTraced(scope: InterviewScope): Promise<InterviewQuestion> {
  return runWithQuestionTrace(scope, "getCurrentQuestion", () => getCurrentQuestion(scope));
}

/**
 * 读：返回当前应展示的题目（选主题 or 普通问答，见 `type`）。
 * - `出题/` 有进行中主题（未答完）→ 该主题的下一题（type="normal"）
 * - 否则 → 选主题题目（type="topic"，options 为候选主题）；待选为空则自动升 tier
 */
export async function getCurrentQuestion(scope: InterviewScope): Promise<InterviewQuestion> {
  const title = readQuestionSet(scope)?.title.trim() || null;
  if (title) {
    const question = await engineGetNextQuestion(scope);
    if (question) {
      return toNormalQuestion(title, question);
    }
    // 兜底：取题为 null 但主题未在 submit 时清空。
    // 仅发生在 catalog「最后一道模板题答完、扩展题此刻才懒生成且结果为空」的边界
    // ——此时 submit 调 isTopicAnswered 因 extend.json 尚未生成而判为未完。
    // - 有答案 → 合并进 sections 并清空；
    // - 零答案（题目被 prep 全部去重）→ 无可问内容，直接丢弃。
    if (readAnswers(scope).length > 0) {
      commitTopic(scope);
    } else {
      clearTopicDir(scope);
    }
  }

  // 新用户冷启动：无已答且无进行中主题 → 直接进入基本档案，不走选题器。
  if (getSections(scope).length === 0 && !readQuestionSet(scope)) {
    const question = await startBasicProfileColdStart(scope);
    if (question) {
      return toNormalQuestion(BASIC_PROFILE_TITLE, question);
    }
    clearTopicDir(scope);
  }

  const topics = await pendingWithAutoPromote(scope);
  return {
    type: "topic",
    title: null,
    key: SELECT_TOPIC_KEY,
    text: "请选择一个主题",
    options: topics.map((t) => t.title),
  };
}

/**
 * 交：把用户输入交回，后端按当前阶段路由落盘；下一题由 `getCurrentQuestion` 读取。
 * - 选主题阶段：`value` 作为主题标题进入该主题
 * - 普通问答阶段：`value` 作为答案落盘；答完由 `getCurrentQuestion` 自动 commit
 */
export function submit(scope: InterviewScope, input: SubmitInput): void {
  if (input.key === SELECT_TOPIC_KEY) {
    // 选主题阶段：value 为所选主题标题。
    // 守卫：已有进行中主题时拒绝，避免 initQuestion 清空其答案（客户端状态过期/重复提交）。
    if (readQuestionSet(scope)) {
      throw new Error(
        "INTERVIEW_TOPIC_IN_PROGRESS: 已有进行中主题，请先用 getCurrentQuestion 继续作答",
      );
    }
    const questionSet = getTopicQuestions(scope, input.value.trim());
    initQuestion(scope, questionSet);
  } else {
    const topicTitle = readQuestionSet(scope)?.title.trim();
    const meta = topicTitle ? getTopicFieldMeta(topicTitle, input.key) : undefined;
    const normalized = normalizeFieldAnswer(meta, input.value);
    if (!normalized.ok) {
      throw new Error(`INVALID_FIELD_ANSWER: ${normalized.message}`);
    }
    // 答题阶段：追加答案；若本主题题目已全部答完，立即合并进 sections 并清空 `出题/`。
    engineSubmitAnswer(scope, {
      key: input.key,
      questionText: input.text,
      answer: normalized.value,
    });
    if (isTopicAnswered(scope)) {
      commitTopic(scope);
    }
  }
}

/**
 * 待选为空时按 tier 轮转最多一圈，自动升档直至取到非空待选。
 * 过滤掉已在「已答」中的主题：tier 文件升档后会删，同档内仍靠内存过滤避免重选刚答完的主题。
 */
async function pendingWithAutoPromote(scope: InterviewScope): Promise<TopicPick[]> {
  for (let i = 0; i < 8; i++) {
    const sections = getSections(scope);
    const answered = new Set(sections.map((s) => s.name.trim()));
    const topics = (
      await traceQuestionStep("topic.selectPending", () => selectPendingTopics(scope, sections))
    ).filter((t) => !answered.has(t.title.trim()));
    if (topics.length > 0) return topics;
    advanceStage(scope);
  }
  return [];
}

export { getCurrentStage };

// ─────────────────── 内部细粒度函数（测试/进阶调用）───────────────────

export async function getPendingTopics(scope: InterviewScope): Promise<TopicPick[]> {
  return selectPendingTopics(scope, getSections(scope));
}

export async function enterTopic(scope: InterviewScope, title: string): Promise<void> {
  const questionSet = getTopicQuestions(scope, title.trim());
  initQuestion(scope, questionSet);
}

export async function getNextQuestion(scope: InterviewScope): Promise<NextQuestionDisplay | null> {
  return engineGetNextQuestion(scope);
}

export function submitAnswer(scope: InterviewScope, params: SubmitAnswerParams): SubmittedAnswerMeta {
  return engineSubmitAnswer(scope, params);
}

/** 本节答完：合并进 `已答/sections.json` 后清空出题器目录 `出题/`。 */
export function commitTopic(scope: InterviewScope): void {
  commitSection(scope, answeredSectionFromTopic(scope));
  clearTopicDir(scope);
}

export function promoteStage(scope: InterviewScope): CurrentStage {
  return advanceStage(scope);
}
