import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { QUIZ_POINTS_PER_QUESTION } from "./constants.js";
import { resolvePublishableVideo } from "./publishableVideos";
import type { PublishedQuizQuestion, PublishedVideoSummary, SelectedQuizQuestion } from "./types";

const PUBLISH_SELECT =
  "SELECT id, plan_id, owner_user_id, interview_id, task_id, title, reward_points, quiz_question_count, status, published_at FROM published_videos";

const QUESTION_SELECT =
  "SELECT id, publish_id, sort_order, question_text, reference_answer, reward_points FROM published_quiz_questions";

function createPublishId(): string {
  return randomBytes(10).toString("base64url").slice(0, 14);
}

function createQuestionId(): string {
  return randomBytes(8).toString("base64url");
}

type PublishedVideoRow = {
  id: string;
  plan_id: string;
  owner_user_id: string;
  interview_id: string;
  task_id: string;
  title: string;
  reward_points: number;
  quiz_question_count: number;
  status: string;
  published_at: string;
};

type QuestionRow = {
  id: string;
  publish_id: string;
  sort_order: number;
  question_text: string;
  reference_answer: string;
  reward_points: number;
};

function mapQuestion(row: QuestionRow): PublishedQuizQuestion {
  return {
    questionId: row.id,
    question: row.question_text,
    referenceAnswer: row.reference_answer,
    rewardPoints: row.reward_points,
    sortOrder: row.sort_order,
  };
}

function mapPublished(row: PublishedVideoRow, questions?: PublishedQuizQuestion[]): PublishedVideoSummary {
  return {
    publishId: row.id,
    planId: row.plan_id,
    interviewId: row.interview_id,
    taskId: row.task_id,
    title: row.title,
    rewardPoints: row.reward_points,
    quizQuestionCount: row.quiz_question_count,
    status: row.status as PublishedVideoSummary["status"],
    publishedAt: row.published_at,
    ...(questions?.length ? { questions } : {}),
  };
}

function normalizeSelectedQuestions(questions: SelectedQuizQuestion[]): SelectedQuizQuestion[] {
  const out: SelectedQuizQuestion[] = [];
  const seen = new Set<string>();
  for (const item of questions) {
    const question = item.question?.trim() ?? "";
    const referenceAnswer = item.referenceAnswer?.trim() ?? "";
    if (!question || !referenceAnswer) continue;
    const key = question.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ question, referenceAnswer });
  }
  return out;
}

export class PublishedVideoService {
  constructor(private readonly db: DatabaseSync) {}

  /** 调用方须已 BEGIN IMMEDIATE，与计划创建同事务。 */
  insertWithinTransaction(
    userId: string,
    planId: string,
    input: {
      interviewId: string;
      taskId: string;
      title?: string;
      questions: SelectedQuizQuestion[];
    },
  ): PublishedVideoSummary {
    const video = resolvePublishableVideo(this.db, userId, input.interviewId, input.taskId);
    const selected = normalizeSelectedQuestions(input.questions);
    if (selected.length === 0) {
      throw new Error("QUIZ_QUESTIONS_REQUIRED");
    }

    const publishId = createPublishId();
    const now = new Date().toISOString();
    const title = input.title?.trim() || video.title;

    this.db
      .prepare(
        `INSERT INTO published_videos
          (id, plan_id, owner_user_id, interview_id, task_id, title, reward_points, quiz_question_count, status, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`,
      )
      .run(
        publishId,
        planId,
        userId,
        video.interviewId,
        video.taskId,
        title,
        QUIZ_POINTS_PER_QUESTION,
        selected.length,
        now,
      );

    const insertQuestion = this.db.prepare(
      `INSERT INTO published_quiz_questions
        (id, publish_id, sort_order, question_text, reference_answer, reward_points, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    selected.forEach((q, index) => {
      insertQuestion.run(
        createQuestionId(),
        publishId,
        index,
        q.question,
        q.referenceAnswer,
        QUIZ_POINTS_PER_QUESTION,
        now,
      );
    });

    const row = this.db.prepare(`${PUBLISH_SELECT} WHERE id = ?`).get(publishId) as PublishedVideoRow | undefined;
    if (!row) {
      throw new Error("VIDEO_PUBLISH_FAILED");
    }
    const questions = this.listQuestionsForPublish(publishId);
    return mapPublished(row, questions);
  }

  listQuestionsForPublish(publishId: string): PublishedQuizQuestion[] {
    const rows = this.db
      .prepare(`${QUESTION_SELECT} WHERE publish_id = ? ORDER BY sort_order ASC`)
      .all(publishId) as QuestionRow[];
    return rows.map(mapQuestion);
  }

  getForPlan(planId: string): PublishedVideoSummary | undefined {
    const row = this.db
      .prepare(`${PUBLISH_SELECT} WHERE plan_id = ? ORDER BY published_at DESC LIMIT 1`)
      .get(planId) as PublishedVideoRow | undefined;
    if (!row) return undefined;
    const questions = this.listQuestionsForPublish(row.id);
    return mapPublished(row, questions);
  }

  listForPlans(planIds: string[]): Map<string, PublishedVideoSummary> {
    const map = new Map<string, PublishedVideoSummary>();
    if (planIds.length === 0) return map;
    const placeholders = planIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT id, plan_id, owner_user_id, interview_id, task_id, title, reward_points, quiz_question_count, status, published_at
         FROM published_videos
         WHERE plan_id IN (${placeholders})
         ORDER BY published_at DESC`,
      )
      .all(...planIds) as PublishedVideoRow[];
    for (const row of rows) {
      if (!map.has(row.plan_id)) {
        const questions = this.listQuestionsForPublish(row.id);
        map.set(row.plan_id, mapPublished(row, questions));
      }
    }
    return map;
  }
}
