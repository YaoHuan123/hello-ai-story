import fs from "node:fs";
import path from "node:path";
import type {
  ExtendPersisted,
  PrepPersisted,
  TopicAnswerRecord,
} from "./engineTypes";
import type { AnsweredSection, QuestionSet } from "../topic/types";
import { getSections } from "../services/answeredSections.service";
import type { InterviewScope } from "../services/interviewWorkspace.service";
import { getInterviewRootDir } from "../services/interviewWorkspace.service";

const QUESTION_DIR = "出题";

const FILES = {
  questionSet: "questionSet.json",
  prep: "prep.json",
  extend: "extend.json",
  answers: "answers.json",
} as const;

/**
 * 出题器工作目录：`<采访根>/出题/`，同一时刻只承载一个进行中主题。
 * 主题标题存于 `questionSet.json.title`；本节 commit 后整目录清空。
 */
function topicDir(scope: InterviewScope): string {
  return path.join(getInterviewRootDir(scope), QUESTION_DIR);
}

function filePath(scope: InterviewScope, file: keyof typeof FILES): string {
  return path.join(topicDir(scope), FILES[file]);
}

export function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

export function resetTopicDir(scope: InterviewScope, questionSet: QuestionSet): void {
  clearTopicDir(scope);
  writeJsonAtomic(filePath(scope, "questionSet"), questionSet);
  writeJsonAtomic(filePath(scope, "answers"), []);
}

/** 清空出题器目录 `出题/`（本节 commit 进 sections 后调用）。 */
export function clearTopicDir(scope: InterviewScope): void {
  const dir = topicDir(scope);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function readQuestionSet(scope: InterviewScope): QuestionSet | null {
  const p = filePath(scope, "questionSet");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as QuestionSet;
  } catch {
    return null;
  }
}

export function readPrep(scope: InterviewScope): PrepPersisted | null {
  const p = filePath(scope, "prep");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as PrepPersisted;
  } catch {
    return null;
  }
}

export function writePrep(scope: InterviewScope, prep: PrepPersisted): void {
  writeJsonAtomic(filePath(scope, "prep"), prep);
}

export function hasExtendFile(scope: InterviewScope): boolean {
  return fs.existsSync(filePath(scope, "extend"));
}

export function readExtend(scope: InterviewScope): ExtendPersisted | null {
  const p = filePath(scope, "extend");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ExtendPersisted;
  } catch {
    return null;
  }
}

export function writeExtend(scope: InterviewScope, data: ExtendPersisted): void {
  writeJsonAtomic(filePath(scope, "extend"), data);
}

export function readAnswers(scope: InterviewScope): TopicAnswerRecord[] {
  const p = filePath(scope, "answers");
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as TopicAnswerRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendAnswer(scope: InterviewScope, record: TopicAnswerRecord): void {
  const answers = readAnswers(scope);
  answers.push(record);
  writeJsonAtomic(filePath(scope, "answers"), answers);
}

/** 扩展题 key 前缀（与 catalog 模板 field key 区分）。 */
export function isExtendKey(key: string): boolean {
  return key.startsWith("__extend_");
}

export function templateAnswers(records: TopicAnswerRecord[]): TopicAnswerRecord[] {
  return records.filter((r) => !isExtendKey(r.key));
}

export function extendedAnswers(records: TopicAnswerRecord[]): TopicAnswerRecord[] {
  return records.filter((r) => isExtendKey(r.key));
}

/** committed sections + 本主题进行中 answers 合成一节，供 LLM 使用。 */
export function sectionsForPrompt(scope: InterviewScope): AnsweredSection[] {
  const name = readQuestionSet(scope)?.title.trim();
  const committed = getSections(scope);
  if (!name) return committed;

  const answers = readAnswers(scope);
  const without = committed.filter((s) => s.name.trim() !== name);
  if (answers.length === 0) {
    return without;
  }
  const qa = answers.map((r) => ({ q: r.questionText, a: r.answer }));
  return [...without, { name, qa }];
}

export function answeredSectionFromRecords(
  title: string,
  records: TopicAnswerRecord[],
): AnsweredSection {
  return {
    name: title.trim(),
    qa: records.map((r) => ({ q: r.questionText, a: r.answer })),
  };
}
