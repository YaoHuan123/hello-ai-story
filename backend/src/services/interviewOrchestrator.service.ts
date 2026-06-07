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
import {
  getInterviewDisplayLocale,
  getDisplayLocale,
  interviewSkipLabel,
  selectTopicPrompt,
} from "../content/displayLocale";
import {
  toDisplayInterviewQuestionAsync,
  toCanonicalTopicNameFromDisplay,
} from "../content/translate/display";
import {
  getBasicProfileTopicName,
  getTopicFieldDef,
  getTopicFieldKeys,
  getTopicFieldMeta,
  isBasicProfileTopicName,
  resolveCanonicalFieldKey,
  resolveCanonicalTopicName,
} from "../topic/catalog";
import { isQuestionSkippable } from "../question/skip";
import { clearTopicDir, readAnswers, readQuestionSet } from "../question/topicPersist";
import {
  advanceStage,
  getCurrentStage,
  getPendingTopics as selectPendingTopics,
  getTopicQuestions,
} from "./topicSelection.service";
import { toCanonicalYesNo } from "../content/translate/yesNo";
import { normalizeFieldAnswer } from "../topic/fieldAnswer";
import type { InterviewFieldType } from "../topic/fieldMeta";
import type { InterviewScope } from "./interviewWorkspace.service";
import type { CurrentStage, QuestionSet, TopicPick } from "../topic/types";

function basicProfileQuestionSet(): QuestionSet {
  const title = getBasicProfileTopicName();
  return {
    title,
    tier: 1,
    kind: "catalog",
    questions: getTopicFieldKeys(title),
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
  /** 选主题时与 options 等长的推荐理由（tier4～8 长题摘要等） */
  optionReasons?: string[];
  /** catalog 控件类型；缺省 text */
  fieldType?: InterviewFieldType;
  /** select 时的固定选项 */
  fieldChoices?: string[];
  /** 选填 / 扩展 / 非 catalog 题可跳过 */
  skippable?: boolean;
};

function toNormalQuestion(
  questionSet: QuestionSet | null,
  title: string,
  question: NextQuestionDisplay,
): InterviewQuestion {
  const canonicalTitle = resolveCanonicalTopicName(title);
  const canonicalKey = resolveCanonicalFieldKey(canonicalTitle, question.key);
  const meta = getTopicFieldMeta(canonicalTitle, canonicalKey);
  return {
    type: "normal",
    title: canonicalTitle,
    key: canonicalKey,
    text: question.text,
    options: question.suggestions,
    fieldType: meta?.fieldType ?? "text",
    ...(meta?.fieldChoices ? { fieldChoices: meta.fieldChoices } : {}),
    ...(questionSet ? { skippable: isQuestionSkippable(questionSet, canonicalKey) } : {}),
  };
}

/** 提交载荷：`value` = 选主题阶段的主题标题，或普通问答阶段的答案。 */
export type SubmitInput = {
  key: string;
  text: string;
  value: string;
  /** 跳过当前题（仅 `skippable` 题为 true 时有效） */
  skip?: boolean;
};

/** 对外：带 trace 的 getCurrentQuestion（HTTP 层调用）。 */
export async function getCurrentQuestionTraced(scope: InterviewScope): Promise<InterviewQuestion> {
  const displayLocale = getInterviewDisplayLocale(scope);
  const q = await runWithQuestionTrace(scope, "getCurrentQuestion", () => getCurrentQuestion(scope));
  const def =
    q.type === "normal" && q.title ? getTopicFieldDef(q.title, q.key) : undefined;
  return toDisplayInterviewQuestionAsync(scope, q, displayLocale, {
    fieldType: q.fieldType,
    fieldChoices: q.fieldChoices,
    optionsKey: def?.optionsKey,
  });
}

/**
 * 读：返回当前应展示的题目（选主题 or 普通问答，见 `type`）。
 * - `出题/` 有进行中主题（未答完）→ 该主题的下一题（type="normal"）
 * - 否则 → 选主题题目（type="topic"，options 为候选主题）；待选为空则自动升 tier
 */
export async function getCurrentQuestion(scope: InterviewScope): Promise<InterviewQuestion> {
  const questionSet = readQuestionSet(scope);
  const title = questionSet?.title.trim() || null;
  if (title) {
    const question = await engineGetNextQuestion(scope);
    if (question) {
      return toNormalQuestion(questionSet, title, question);
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
      const bp = basicProfileQuestionSet();
      return toNormalQuestion(bp, bp.title, question);
    }
    clearTopicDir(scope);
  }

  const topics = await pendingWithAutoPromote(scope);
  return {
    type: "topic",
    title: null,
    key: SELECT_TOPIC_KEY,
    text: selectTopicPrompt(getInterviewDisplayLocale(scope)),
    options: topics.map((t) => t.title),
    optionReasons: topics.map((t) => t.reason),
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
    const displayLocale = getDisplayLocale();
    const canonicalTitle = toCanonicalTopicNameFromDisplay(input.value.trim(), displayLocale);
    const questionSet = getTopicQuestions(scope, canonicalTitle);
    initQuestion(scope, questionSet);
  } else {
    const questionSet = readQuestionSet(scope);
    if (!questionSet) {
      throw new Error("QUESTION_ENGINE_NO_SESSION: 无进行中主题");
    }

    const displayLocale = getDisplayLocale();
    const topicTitle = resolveCanonicalTopicName(questionSet.title.trim());
    const canonicalKey = resolveCanonicalFieldKey(topicTitle, input.key);

    let answer: string;
    if (input.skip) {
      if (!isQuestionSkippable(questionSet, canonicalKey)) {
        throw new Error("QUESTION_NOT_SKIPPABLE: 当前题目不可跳过");
      }
      answer = interviewSkipLabel(displayLocale);
    } else {
      const meta = getTopicFieldMeta(topicTitle, canonicalKey);
      const def = getTopicFieldDef(topicTitle, canonicalKey);
      let rawAnswer = input.value;
      if (questionSet.kind === "material_inner") {
        rawAnswer = toCanonicalYesNo(rawAnswer, displayLocale);
      }
      const normalized = normalizeFieldAnswer(meta, rawAnswer, {
        displayLocale,
        topicName: topicTitle,
        fieldKey: canonicalKey,
        canonicalChoices: meta?.fieldChoices,
        optionsKey: def?.optionsKey,
      });
      if (!normalized.ok) {
        throw new Error(`INVALID_FIELD_ANSWER: ${normalized.message}`);
      }
      answer = normalized.value;
    }

    engineSubmitAnswer(scope, {
      key: canonicalKey,
      questionText: input.text,
      answer,
    });
    if (isTopicAnswered(scope)) {
      commitTopic(scope);
    }
  }
}

/**
 * 待选为空时按 tier 轮转最多一圈，自动升档直至取到非空待选。
 * 过滤已在 sections 中的主题（兼容旧数据 pending 未随 commit 升档删除的情况）。
 */
async function pendingWithAutoPromote(scope: InterviewScope): Promise<TopicPick[]> {
  for (let i = 0; i < 8; i++) {
    const sections = getSections(scope);
    const answered = new Set(
      sections.map((s) => {
        try {
          return resolveCanonicalTopicName(s.name.trim());
        } catch {
          return s.name.trim();
        }
      }),
    );
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

/** 本节答完：合并进 `已答/sections.json`、清空 `出题/`，并按 §2.1 升档（基本档案冷启动除外）。 */
export function commitTopic(scope: InterviewScope): void {
  const questionSet = readQuestionSet(scope);
  const title = questionSet?.title.trim() ?? "";
  commitSection(scope, answeredSectionFromTopic(scope));
  clearTopicDir(scope);
  if (title && !isBasicProfileTopicName(title)) {
    advanceStage(scope);
  }
}

export function promoteStage(scope: InterviewScope): CurrentStage {
  return advanceStage(scope);
}
