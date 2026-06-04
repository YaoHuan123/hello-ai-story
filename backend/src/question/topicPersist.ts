import fs from "node:fs";
import path from "node:path";
import type {
  ExtendPersisted,
  PrepPersisted,
  TopicAnswerRecord,
} from "./engineTypes";
import type { AnsweredSection, QuestionSet } from "../topic/types";
import { getSections } from "../services/answeredSections.service";
import { getUserRootDir } from "../services/workspace.service";

const QUESTION_DIR = "出题";

const FILES = {
  questionSet: "questionSet.json",
  prep: "prep.json",
  extend: "extend.json",
  answers: "answers.json",
} as const;

/**
 * 出题器工作目录：`<user>/出题/`，同一时刻只承载一个进行中主题。
 * 主题标题存于 `questionSet.json.title`；本节 commit 后整目录清空。
 */
function topicDir(userId: string): string {
  return path.join(getUserRootDir(userId), QUESTION_DIR);
}

function filePath(userId: string, file: keyof typeof FILES): string {
  return path.join(topicDir(userId), FILES[file]);
}

export function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

export function resetTopicDir(userId: string, questionSet: QuestionSet): void {
  clearTopicDir(userId);
  writeJsonAtomic(filePath(userId, "questionSet"), questionSet);
  writeJsonAtomic(filePath(userId, "answers"), []);
}

/** 清空出题器目录 `出题/`（本节 commit 进 sections 后调用）。 */
export function clearTopicDir(userId: string): void {
  const dir = topicDir(userId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function readQuestionSet(userId: string): QuestionSet | null {
  const p = filePath(userId, "questionSet");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as QuestionSet;
  } catch {
    return null;
  }
}

export function readPrep(userId: string): PrepPersisted | null {
  const p = filePath(userId, "prep");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as PrepPersisted;
  } catch {
    return null;
  }
}

export function writePrep(userId: string, prep: PrepPersisted): void {
  writeJsonAtomic(filePath(userId, "prep"), prep);
}

export function hasExtendFile(userId: string): boolean {
  return fs.existsSync(filePath(userId, "extend"));
}

export function readExtend(userId: string): ExtendPersisted | null {
  const p = filePath(userId, "extend");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ExtendPersisted;
  } catch {
    return null;
  }
}

export function writeExtend(userId: string, data: ExtendPersisted): void {
  writeJsonAtomic(filePath(userId, "extend"), data);
}

export function readAnswers(userId: string): TopicAnswerRecord[] {
  const p = filePath(userId, "answers");
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as TopicAnswerRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendAnswer(userId: string, record: TopicAnswerRecord): void {
  const answers = readAnswers(userId);
  answers.push(record);
  writeJsonAtomic(filePath(userId, "answers"), answers);
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
export function sectionsForPrompt(userId: string): AnsweredSection[] {
  const name = readQuestionSet(userId)?.title.trim();
  const committed = getSections(userId);
  if (!name) return committed;

  const answers = readAnswers(userId);
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
