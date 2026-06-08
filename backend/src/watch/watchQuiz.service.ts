import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { PublishedVideoService } from "../campaign/publishedVideo.service";
import { gradeQuizAnswer } from "./gradeQuizAnswer.js";
import type { WatchFeedService } from "./watchFeed.service";
import type {
  WatchQuizCurrentResponse,
  WatchQuizMessage,
  WatchQuizSessionAnswer,
  WatchQuizSessionQuestion,
  WatchQuizSessionStatus,
  WatchQuizSubmitResponse,
} from "./types";

type SessionRow = {
  id: string;
  publish_id: string;
  viewer_user_id: string;
  status: string;
  current_index: number;
  questions_json: string;
  answers_json: string;
  earned_points: number;
  created_at: string;
  updated_at: string;
};

function createSessionId(): string {
  return randomBytes(10).toString("base64url").slice(0, 14);
}

function parseQuestions(raw: string): WatchQuizSessionQuestion[] {
  try {
    const parsed = JSON.parse(raw) as WatchQuizSessionQuestion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseAnswers(raw: string): WatchQuizSessionAnswer[] {
  try {
    const parsed = JSON.parse(raw) as WatchQuizSessionAnswer[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildMessages(questions: WatchQuizSessionQuestion[], answers: WatchQuizSessionAnswer[]): WatchQuizMessage[] {
  const messages: WatchQuizMessage[] = [];
  for (let i = 0; i < answers.length; i += 1) {
    const ans = answers[i]!;
    const q = questions[ans.questionIndex];
    if (!q) continue;
    messages.push({ id: `q-${i}`, role: "ai", text: q.question, meta: `${i + 1}/${questions.length}` });
    messages.push({ id: `a-${i}`, role: "user", text: ans.answer });
    messages.push({
      id: `f-${i}`,
      role: "ai",
      text: ans.reason,
      feedback: ans.correct ? "correct" : "incorrect",
      pointsAwarded: ans.pointsAwarded,
    });
  }
  return messages;
}

export class WatchQuizService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly watchFeed: WatchFeedService,
    private readonly publishedVideos: PublishedVideoService,
  ) {}

  private getSession(viewerUserId: string, publishId: string): SessionRow | undefined {
    return this.db
      .prepare(
        `SELECT id, publish_id, viewer_user_id, status, current_index, questions_json, answers_json, earned_points, created_at, updated_at
         FROM watch_quiz_sessions WHERE publish_id = ? AND viewer_user_id = ?`,
      )
      .get(publishId, viewerUserId) as SessionRow | undefined;
  }

  private toCurrentResponse(row: SessionRow): WatchQuizCurrentResponse {
    const questions = parseQuestions(row.questions_json);
    const answers = parseAnswers(row.answers_json);
    const messages = buildMessages(questions, answers);
    const status = row.status as WatchQuizSessionStatus;
    const currentIndex = row.current_index;
    let currentQuestion: { index: number; text: string } | null = null;
    if (status === "in_progress" && currentIndex < questions.length) {
      const q = questions[currentIndex]!;
      currentQuestion = { index: currentIndex, text: q.question };
      messages.push({ id: `q-${currentIndex}`, role: "ai", text: q.question, meta: `${currentIndex + 1}/${questions.length}` });
    }
    return {
      sessionId: row.id,
      sessionStatus: status,
      currentIndex,
      totalQuestions: questions.length,
      earnedPoints: row.earned_points,
      currentQuestion,
      messages,
    };
  }

  cleanupOrphanSessions(): number {
    const result = this.db
      .prepare(
        `DELETE FROM watch_quiz_sessions
         WHERE publish_id NOT IN (SELECT id FROM published_videos)`,
      )
      .run();
    return Number(result.changes);
  }

  startQuiz(viewerUserId: string, publishId: string): WatchQuizCurrentResponse {
    this.watchFeed.assertQuizAccess(publishId, viewerUserId);

    const existing = this.getSession(viewerUserId, publishId);
    if (existing) {
      return this.toCurrentResponse(existing);
    }

    const publishedQuestions = this.publishedVideos.listQuestionsForPublish(publishId);
    if (publishedQuestions.length === 0) {
      throw new Error("QUIZ_NO_QUESTIONS");
    }

    const questions: WatchQuizSessionQuestion[] = publishedQuestions.map((q) => ({
      questionId: q.questionId,
      question: q.question,
      referenceAnswer: q.referenceAnswer,
      rewardPoints: q.rewardPoints,
    }));

    const sessionId = createSessionId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO watch_quiz_sessions
          (id, publish_id, viewer_user_id, status, current_index, questions_json, answers_json, earned_points, created_at, updated_at)
         VALUES (?, ?, ?, 'in_progress', 0, ?, '[]', 0, ?, ?)`,
      )
      .run(sessionId, publishId, viewerUserId, JSON.stringify(questions), now, now);

    const row = this.getSession(viewerUserId, publishId);
    if (!row) {
      throw new Error("QUIZ_SESSION_CREATE_FAILED");
    }
    return this.toCurrentResponse(row);
  }

  getCurrent(viewerUserId: string, publishId: string): WatchQuizCurrentResponse {
    this.watchFeed.assertQuizAccess(publishId, viewerUserId);
    const row = this.getSession(viewerUserId, publishId);
    if (!row) {
      throw new Error("QUIZ_SESSION_NOT_FOUND");
    }
    return this.toCurrentResponse(row);
  }

  getMessages(viewerUserId: string, publishId: string): WatchQuizCurrentResponse {
    return this.getCurrent(viewerUserId, publishId);
  }

  async submitAnswer(viewerUserId: string, publishId: string, answer: string): Promise<WatchQuizSubmitResponse> {
    const row = this.getSession(viewerUserId, publishId);
    if (!row) {
      throw new Error("QUIZ_SESSION_NOT_FOUND");
    }
    if (row.status !== "in_progress") {
      throw new Error("QUIZ_SESSION_COMPLETED");
    }

    const questions = parseQuestions(row.questions_json);
    const answers = parseAnswers(row.answers_json);
    const index = row.current_index;
    const question = questions[index];
    if (!question) {
      throw new Error("QUIZ_NO_CURRENT_QUESTION");
    }

    const trimmed = answer.trim();
    if (!trimmed) {
      throw new Error("QUIZ_ANSWER_EMPTY");
    }

    const grade = await gradeQuizAnswer({
      question: question.question,
      referenceAnswer: question.referenceAnswer,
      userAnswer: trimmed,
    });

    const record = this.watchFeed.getWatchableRecord(publishId, viewerUserId);
    if (!record) {
      throw new Error("WATCH_NOT_FOUND");
    }

    let pointsPending = 0;
    const now = new Date().toISOString();

    if (grade.correct) {
      pointsPending = question.rewardPoints;
    }

    const answerRow: WatchQuizSessionAnswer = {
      questionIndex: index,
      answer: trimmed,
      correct: grade.correct,
      reason: grade.reason,
      pointsAwarded: pointsPending,
    };
    const earnedTotal = row.earned_points + pointsPending;
    const nextIndex = index + 1;
    const completed = nextIndex >= questions.length;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const claimed = this.db
        .prepare(
          `UPDATE watch_quiz_sessions
           SET current_index = ?, answers_json = ?, earned_points = ?, status = ?, updated_at = ?
           WHERE id = ? AND status = 'in_progress' AND current_index = ?`,
        )
        .run(
          nextIndex,
          JSON.stringify([...answers, answerRow]),
          earnedTotal,
          completed ? "completed" : "in_progress",
          now,
          row.id,
          index,
        );
      if (claimed.changes !== 1) {
        this.db.exec("ROLLBACK");
        throw new Error("QUIZ_ANSWER_ALREADY_SUBMITTED");
      }

      if (completed) {
        this.watchFeed.markAssignmentCompleted(viewerUserId, publishId, earnedTotal, new Date(now));
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const updated = this.getSession(viewerUserId, publishId)!;
    const current = this.toCurrentResponse(updated);
    return {
      correct: grade.correct,
      reason: grade.reason,
      pointsAwarded: pointsPending,
      earnedPointsTotal: updated.earned_points,
      sessionStatus: updated.status as WatchQuizSessionStatus,
      currentQuestion: current.currentQuestion,
      messages: current.messages,
    };
  }
}
