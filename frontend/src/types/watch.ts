export type WatchFeedItem = {
  publishId: string;
  title: string;
  rewardPoints: number;
  quizQuestionCount: number;
  publishedAt: string;
  planEndYear: number;
};

export type WatchVideoDetail = WatchFeedItem & {
  planId: string;
};

export type WatchFeedResponse = {
  items: WatchFeedItem[];
  nextCursor?: string;
};

export type WatchQuizSessionStatus = "in_progress" | "completed";

export type WatchQuizMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
  meta?: string;
  feedback?: "correct" | "incorrect";
  pointsAwarded?: number;
};

export type WatchQuizCurrentResponse = {
  sessionId: string;
  sessionStatus: WatchQuizSessionStatus;
  currentIndex: number;
  totalQuestions: number;
  earnedPoints: number;
  currentQuestion: { index: number; text: string } | null;
  messages: WatchQuizMessage[];
};

export type WatchQuizSubmitResponse = {
  correct: boolean;
  reason: string;
  pointsAwarded: number;
  earnedPointsTotal: number;
  sessionStatus: WatchQuizSessionStatus;
  currentQuestion: { index: number; text: string } | null;
  messages: WatchQuizMessage[];
};
