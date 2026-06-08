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

export type PublishedVideoWatchRecord = {
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
  plan_status: string;
  end_year: number;
};

export type WatchQuizSessionStatus = "in_progress" | "completed";

export type WatchQuizSessionQuestion = {
  questionId: string;
  question: string;
  referenceAnswer: string;
  rewardPoints: number;
};

export type WatchQuizSessionAnswer = {
  questionIndex: number;
  answer: string;
  correct: boolean;
  reason: string;
  pointsAwarded: number;
};

export type WatchQuizMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
  meta?: string;
  /** 判分反馈：仅答题反馈消息携带 */
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
