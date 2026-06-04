import { commitSection, getSections } from "./answeredSections.service";
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
import type { CurrentStage, TopicPick } from "../topic/types";

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
  /** 可选项：选主题=候选主题标题；普通问答=备选答案 */
  options: string[];
};

/** 提交载荷：`value` = 选主题阶段的主题标题，或普通问答阶段的答案。 */
export type SubmitInput = {
  key: string;
  text: string;
  value: string;
};

// ───────────────────────── 对外两接口 ─────────────────────────

/**
 * 读：返回当前应展示的题目（选主题 or 普通问答，见 `type`）。
 * - `出题/` 有进行中主题（未答完）→ 该主题的下一题（type="normal"）
 * - 否则 → 选主题题目（type="topic"，options 为候选主题）；待选为空则自动升 tier
 */
export async function getCurrentQuestion(userId: string): Promise<InterviewQuestion> {
  const title = readQuestionSet(userId)?.title.trim() || null;
  if (title) {
    const question = await engineGetNextQuestion(userId);
    if (question) {
      return {
        type: "normal",
        title,
        key: question.key,
        text: question.text,
        options: question.suggestions,
      };
    }
    // 兜底：取题为 null 但主题未在 submit 时清空。
    // 仅发生在 catalog「最后一道模板题答完、扩展题此刻才懒生成且结果为空」的边界
    // ——此时 submit 调 isTopicAnswered 因 extend.json 尚未生成而判为未完。
    // - 有答案 → 合并进 sections 并清空；
    // - 零答案（题目被 prep 全部去重）→ 无可问内容，直接丢弃。
    if (readAnswers(userId).length > 0) {
      commitTopic(userId);
    } else {
      clearTopicDir(userId);
    }
  }

  const topics = await pendingWithAutoPromote(userId);
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
export function submit(userId: string, input: SubmitInput): void {
  if (input.key === SELECT_TOPIC_KEY) {
    // 选主题阶段：value 为所选主题标题。
    // 守卫：已有进行中主题时拒绝，避免 initQuestion 清空其答案（客户端状态过期/重复提交）。
    if (readQuestionSet(userId)) {
      throw new Error(
        "INTERVIEW_TOPIC_IN_PROGRESS: 已有进行中主题，请先用 getCurrentQuestion 继续作答",
      );
    }
    const questionSet = getTopicQuestions(userId, input.value.trim());
    initQuestion(userId, questionSet);
  } else {
    // 答题阶段：追加答案；若本主题题目已全部答完，立即合并进 sections 并清空 `出题/`。
    engineSubmitAnswer(userId, {
      key: input.key,
      questionText: input.text,
      answer: input.value,
    });
    if (isTopicAnswered(userId)) {
      commitTopic(userId);
    }
  }
}

/**
 * 待选为空时按 tier 轮转最多一圈，自动升档直至取到非空待选。
 * 过滤掉已在「已答」中的主题：tier{N}.json 是缓存的待选，自身不会剔除刚答完的主题，
 * 否则会把已完成的主题反复重选。
 */
async function pendingWithAutoPromote(userId: string): Promise<TopicPick[]> {
  for (let i = 0; i < 8; i++) {
    const sections = getSections(userId);
    const answered = new Set(sections.map((s) => s.name.trim()));
    const topics = (await selectPendingTopics(userId, sections)).filter(
      (t) => !answered.has(t.title.trim()),
    );
    if (topics.length > 0) return topics;
    advanceStage(userId);
  }
  return [];
}

export { getCurrentStage };

// ─────────────────── 内部细粒度函数（测试/进阶调用）───────────────────

export async function getPendingTopics(userId: string): Promise<TopicPick[]> {
  return selectPendingTopics(userId, getSections(userId));
}

export async function enterTopic(userId: string, title: string): Promise<void> {
  const questionSet = getTopicQuestions(userId, title.trim());
  initQuestion(userId, questionSet);
}

export async function getNextQuestion(userId: string): Promise<NextQuestionDisplay | null> {
  return engineGetNextQuestion(userId);
}

export function submitAnswer(userId: string, params: SubmitAnswerParams): SubmittedAnswerMeta {
  return engineSubmitAnswer(userId, params);
}

/** 本节答完：合并进 `已答/sections.json` 后清空出题器目录 `出题/`。 */
export function commitTopic(userId: string): void {
  commitSection(userId, answeredSectionFromTopic(userId));
  clearTopicDir(userId);
}

export function promoteStage(userId: string): CurrentStage {
  return advanceStage(userId);
}
