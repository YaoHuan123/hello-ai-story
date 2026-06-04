import type {
  NextQuestionDisplay,
  PrepPersisted,
  SubmitAnswerParams,
  SubmittedAnswerMeta,
  TopicAnswerRecord,
} from "../question/engineTypes";
import type { AnsweredInTopicItem } from "../question/types";
import {
  appendAnswer,
  answeredSectionFromRecords,
  extendedAnswers,
  hasExtendFile,
  readAnswers,
  readExtend,
  readPrep,
  readQuestionSet,
  resetTopicDir,
  sectionsForPrompt,
  templateAnswers,
  writeExtend,
  writePrep,
} from "../question/topicPersist";
import {
  extendSubCategoryQuestions,
  isExtendNotApplicable,
  isExtendSkipped,
  isRefineSkipped,
  isTemplatePrepNotApplicable,
  refineAndSuggestCurrent,
  runTemplatePrep,
} from "./questionGeneration.service";
import type { AnsweredSection, QuestionSet } from "../topic/types";

function isCatalog(questionSet: QuestionSet): boolean {
  return questionSet.kind === "catalog";
}

function extendKey(index: number): string {
  return `__extend_${index}`;
}

function templateAnsweredMap(records: TopicAnswerRecord[]): Record<string, string> {
  return Object.fromEntries(templateAnswers(records).map((r) => [r.key, r.answer]));
}

function toAnsweredInTopic(records: TopicAnswerRecord[]): AnsweredInTopicItem[] {
  return templateAnswers(records).map((r) => ({
    question: r.key,
    questionText: r.questionText,
    answer: r.answer,
  }));
}

async function ensureCatalogPrep(
  userId: string,
  questionSet: QuestionSet,
): Promise<PrepPersisted> {
  const existing = readPrep(userId);
  if (existing) return existing;

  const sections = sectionsForPrompt(userId);
  const prep = await runTemplatePrep({ sections, questionSet });
  writePrep(userId, prep);
  return prep;
}

async function ensureExtend(
  userId: string,
  questionSet: QuestionSet,
  answers: TopicAnswerRecord[],
): Promise<void> {
  if (hasExtendFile(userId)) return;

  if (isExtendNotApplicable(questionSet) || isExtendSkipped(questionSet)) {
    writeExtend(userId, { questions: [] });
    return;
  }

  const templateAnswered = templateAnsweredMap(answers);
  if (Object.keys(templateAnswered).length === 0) {
    writeExtend(userId, { questions: [] });
    return;
  }

  const sections = sectionsForPrompt(userId);
  const extended = await extendSubCategoryQuestions({
    sections,
    questionSet,
    templateAnswered,
  });
  writeExtend(userId, { questions: extended.questions });
}

async function buildCatalogTemplateDisplay(
  userId: string,
  questionSet: QuestionSet,
  prep: PrepPersisted,
  answers: TopicAnswerRecord[],
): Promise<NextQuestionDisplay> {
  const template = templateAnswers(answers);
  const key = prep.askQuestions[template.length]!;
  const batchText = prep.questionTexts[key] ?? key;
  const batchSuggested = prep.answerSuggestions[key] ?? [];

  let questionText = batchText;
  let suggestions = batchSuggested;

  if (!isRefineSkipped(questionSet) && template.length > 0) {
    const sections = sectionsForPrompt(userId);
    const display = await refineAndSuggestCurrent({
      sections,
      questionSet,
      currentQuestion: key,
      batchQuestionText: batchText,
      batchSuggestedAnswers: batchSuggested,
      answeredInTopic: toAnsweredInTopic(answers),
    });
    questionText = display.questionText;
    suggestions = display.suggestedAnswers;
  }

  return {
    key,
    text: questionText,
    suggestions,
  };
}

/** 非 catalog：按 questionSet.questions 顺序推进，无 prep / extend / refine。 */
function getNextQuestionNonCatalog(
  questionSet: QuestionSet,
  answers: TopicAnswerRecord[],
): NextQuestionDisplay | null {
  const questions = questionSet.questions.map((q) => q.trim()).filter(Boolean);
  const index = answers.length;
  if (index >= questions.length) return null;

  const key = questions[index]!;
  const suggestions = questionSet.suggestedAnswers ?? [];

  return {
    key,
    text: key,
    suggestions,
  };
}

async function getNextQuestionCatalog(
  userId: string,
  questionSet: QuestionSet,
  answers: TopicAnswerRecord[],
): Promise<NextQuestionDisplay | null> {
  const prep = await ensureCatalogPrep(userId, questionSet);
  if (prep.askQuestions.length === 0) {
    return null;
  }

  const template = templateAnswers(answers);
  if (template.length < prep.askQuestions.length) {
    return buildCatalogTemplateDisplay(userId, questionSet, prep, answers);
  }

  await ensureExtend(userId, questionSet, answers);

  const extend = readExtend(userId);
  if (!extend || extend.questions.length === 0) {
    return null;
  }

  return buildExtendedDisplay(extend, answers);
}

function buildExtendedDisplay(
  extend: NonNullable<ReturnType<typeof readExtend>>,
  answers: TopicAnswerRecord[],
): NextQuestionDisplay | null {
  const extended = extendedAnswers(answers);
  const index = extended.length;
  if (index >= extend.questions.length) return null;

  const item = extend.questions[index]!;
  const key = extendKey(index);

  return {
    key,
    text: item.q,
    suggestions: item.suggestedAnswers ?? [],
  };
}

/**
 * 进入主题：重置 `出题/`，写入 questionSet 与空 answers。
 */
export function initQuestion(userId: string, questionSet: QuestionSet): void {
  const title = questionSet.title.trim();
  if (!title) {
    throw new Error("QUESTION_ENGINE_MISSING_INPUT: questionSet.title 为空");
  }
  if (isTemplatePrepNotApplicable(questionSet) && questionSet.questions.length === 0) {
    throw new Error("QUESTION_ENGINE_MISSING_INPUT: questionSet.questions 为空");
  }
  resetTopicDir(userId, questionSet);
}

/**
 * 取当前主题的下一道展示题；无题可问（或无进行中主题）返回 null。
 */
export async function getNextQuestion(userId: string): Promise<NextQuestionDisplay | null> {
  const questionSet = readQuestionSet(userId);
  if (!questionSet) {
    throw new Error("QUESTION_ENGINE_NO_SESSION: 无进行中主题，请先 initQuestion");
  }

  const answers = readAnswers(userId);

  if (!isCatalog(questionSet)) {
    return getNextQuestionNonCatalog(questionSet, answers);
  }

  return getNextQuestionCatalog(userId, questionSet, answers);
}

/**
 * 出题器中的题目是否已全部回答完毕（仅读持久化 prep/extend/answers，不触发 LLM）。
 * 无进行中主题视为「已完毕」；catalog 尚未取过题（无 prep.json）视为「未完毕」。
 */
export function isTopicAnswered(userId: string): boolean {
  const questionSet = readQuestionSet(userId);
  if (!questionSet) return true;

  const answers = readAnswers(userId);

  if (!isCatalog(questionSet)) {
    const questions = questionSet.questions.map((q) => q.trim()).filter(Boolean);
    return answers.length >= questions.length;
  }

  const prep = readPrep(userId);
  if (!prep) return false;
  if (templateAnswers(answers).length < prep.askQuestions.length) return false;

  const extend = readExtend(userId);
  if (!extend) return false;
  return extendedAnswers(answers).length >= extend.questions.length;
}

/**
 * 提交答案并追加到 answers.json。
 * 防御：已答完则拒绝（COMPLETE）；同一 key 不可二次落盘（DUPLICATE）。
 */
export function submitAnswer(userId: string, params: SubmitAnswerParams): SubmittedAnswerMeta {
  const key = params.key.trim();
  const questionText = params.questionText.trim();
  const answer = params.answer.trim();

  if (!key) throw new Error("QUESTION_ENGINE_MISSING_INPUT: key 为空");
  if (!answer) throw new Error("QUESTION_ENGINE_MISSING_INPUT: answer 为空");

  if (!readQuestionSet(userId)) {
    throw new Error("QUESTION_ENGINE_NO_SESSION: 无进行中主题");
  }
  if (isTopicAnswered(userId)) {
    throw new Error("QUESTION_ENGINE_COMPLETE: 当前主题已答完，无待答题");
  }
  if (readAnswers(userId).some((r) => r.key === key)) {
    throw new Error(`QUESTION_ENGINE_DUPLICATE: key「${key}」已作答，不能重复提交`);
  }

  appendAnswer(userId, { key, questionText, answer });
  return { key, text: questionText };
}

/** 本节结束时合并进 sections.json。 */
export function answeredSectionFromTopic(userId: string): AnsweredSection {
  const name = readQuestionSet(userId)?.title.trim();
  if (!name) {
    throw new Error("QUESTION_ENGINE_NO_SESSION: 无进行中主题");
  }
  const records = readAnswers(userId);
  if (records.length === 0) {
    throw new Error(`QUESTION_ENGINE_NO_ANSWERS: 主题「${name}」无已答记录`);
  }
  return answeredSectionFromRecords(name, records);
}

export type {
  NextQuestionDisplay,
  SubmitAnswerParams,
  SubmittedAnswerMeta,
  TopicAnswerRecord,
} from "../question/engineTypes";
