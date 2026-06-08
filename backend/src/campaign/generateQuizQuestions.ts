import { randomBytes, randomInt } from "node:crypto";
import { chatJson } from "../topic/llm.js";
import { QUIZ_GENERATE_BATCH_SIZE } from "./constants.js";
import { loadWatchQuizGeneratePrompt } from "./loadWatchQuizPrompt.js";
import type { QuizQuestionDraft } from "./types.js";

const ERR = "QUIZ_GENERATE_INVALID";

function isStubMode(): boolean {
  return process.env.WATCH_QUIZ_STUB === "1" || process.env.NODE_ENV === "test";
}

function normalizeQuestionKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function createDraftId(): string {
  return randomBytes(8).toString("base64url");
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function splitStorySnippets(storyArticle: string): string[] {
  return storyArticle
    .split(/[。！？!?.\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

function stubQuestions(storyArticle: string, excludeQuestions: string[], count: number): QuizQuestionDraft[] {
  const exclude = new Set(excludeQuestions.map(normalizeQuestionKey));
  const snippets = shuffle(splitStorySnippets(storyArticle));
  const out: QuizQuestionDraft[] = [];
  let idx = 0;
  for (const snippet of snippets) {
    if (out.length >= count) break;
    const question = `根据视频内容，「${snippet.slice(0, 36)}${snippet.length > 36 ? "…" : ""}」这一点是否正确？`;
    if (exclude.has(normalizeQuestionKey(question))) continue;
    out.push({
      draftId: createDraftId(),
      question,
      referenceAnswer: snippet,
    });
    idx += 1;
    if (idx > snippets.length * 2 && out.length < count) break;
  }
  while (out.length < count) {
    const n = out.length + 1;
    const question = `根据视频，故事中第 ${n} 个关键细节是什么？`;
    if (exclude.has(normalizeQuestionKey(question))) continue;
    out.push({
      draftId: createDraftId(),
      question,
      referenceAnswer: "请参考视频中的具体叙述。",
    });
  }
  return out.slice(0, count);
}

type LlmQuestionRow = { question?: string; referenceAnswer?: string };
type LlmOutput = { questions?: LlmQuestionRow[]; error?: string };

function parseLlmQuestions(raw: LlmOutput, excludeQuestions: string[], count: number): QuizQuestionDraft[] {
  if (raw.error) {
    throw new Error(`${ERR}: ${raw.error}`);
  }
  const exclude = new Set(excludeQuestions.map(normalizeQuestionKey));
  const rows = Array.isArray(raw.questions) ? raw.questions : [];
  const out: QuizQuestionDraft[] = [];
  for (const row of rows) {
    const question = typeof row.question === "string" ? row.question.trim() : "";
    const referenceAnswer = typeof row.referenceAnswer === "string" ? row.referenceAnswer.trim() : "";
    if (!question || !referenceAnswer) continue;
    if (exclude.has(normalizeQuestionKey(question))) continue;
    out.push({ draftId: createDraftId(), question, referenceAnswer });
    if (out.length >= count) break;
  }
  return out;
}

export async function generateQuizQuestionBatch(input: {
  storyArticle: string;
  excludeQuestions?: string[];
  count?: number;
}): Promise<QuizQuestionDraft[]> {
  const storyArticle = input.storyArticle.trim();
  if (!storyArticle) {
    throw new Error("QUIZ_CONTENT_MISSING");
  }
  const count = input.count ?? QUIZ_GENERATE_BATCH_SIZE;
  const excludeQuestions = input.excludeQuestions ?? [];

  if (isStubMode()) {
    return stubQuestions(storyArticle, excludeQuestions, count);
  }

  const { systemText, userSuffix } = loadWatchQuizGeneratePrompt();
  const payload = {
    storyArticle: storyArticle.slice(0, 12_000),
    excludeQuestions: excludeQuestions.slice(0, 80),
    count,
  };
  const userContent = userSuffix.replace("{{INPUT_JSON}}", JSON.stringify(payload, null, 2));
  const raw = await chatJson<LlmOutput>([
    { role: "system", content: systemText },
    { role: "user", content: userContent },
  ]);

  let questions = parseLlmQuestions(raw, excludeQuestions, count);
  if (questions.length < count) {
    const mergedExclude = [...excludeQuestions, ...questions.map((q) => q.question)];
    const filler = stubQuestions(storyArticle, mergedExclude, count - questions.length);
    questions = [...questions, ...filler];
  }
  return shuffle(questions).slice(0, count);
}
