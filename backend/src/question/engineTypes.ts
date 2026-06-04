import type { ExtendQuestionItem, QuestionSet, TemplatePrepResult } from "./types";

export type { TemplatePrepResult as PrepPersisted } from "./types";
import type { AnsweredSection } from "../topic/types";

/** 单条已提交答案（`出题/{title}/answers.json`） */
export type TopicAnswerRecord = {
  key: string;
  questionText: string;
  answer: string;
};

/** 扩展追问缓存（`extend.json`） */
export type ExtendPersisted = {
  questions: ExtendQuestionItem[];
};

export type NextQuestionDisplay = {
  key: string;
  text: string;
  suggestions: string[];
};

export type SubmitAnswerParams = {
  key: string;
  questionText: string;
  answer: string;
};

export type SubmittedAnswerMeta = {
  key: string;
  text: string;
};

export type { QuestionSet, AnsweredSection };
