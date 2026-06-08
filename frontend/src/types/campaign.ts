export type CampaignPlanStatus = "active" | "ended" | "cancelled";

export type PublishedQuizQuestion = {
  questionId: string;
  question: string;
  referenceAnswer: string;
  rewardPoints: number;
  sortOrder: number;
};

export type PublishedVideoSummary = {
  publishId: string;
  planId: string;
  interviewId: string;
  taskId: string;
  title: string;
  rewardPoints: number;
  quizQuestionCount: number;
  status: "published" | "unpublished";
  publishedAt: string;
  questions?: PublishedQuizQuestion[];
};

export type CampaignPlan = {
  planId: string;
  startYear: number;
  endYear: number;
  pointsPerYear: number;
  pointsPerPortion: number;
  portionsPerYear: number;
  rewardPoolBalance: number;
  rewardedTotal: number;
  distributedTotal?: number;
  completedTotal?: number;
  status: CampaignPlanStatus;
  createdAt: string;
  updatedAt: string;
  publishedVideo?: PublishedVideoSummary;
};

export type CampaignPlanListResponse = {
  plans: CampaignPlan[];
};

export type PublishableVideo = {
  interviewId: string;
  interviewTitle?: string;
  taskId: string;
  productionMode: string;
  createdAt: string;
  title: string;
};

export type PublishableVideoListResponse = {
  videos: PublishableVideo[];
};

export type QuizQuestionDraft = {
  draftId: string;
  question: string;
  referenceAnswer: string;
};

export type SelectedQuizQuestion = {
  question: string;
  referenceAnswer: string;
};

export const QUIZ_POINTS_PER_QUESTION = 2;

export type GenerateQuizQuestionsResponse = {
  questions: QuizQuestionDraft[];
};

export type CampaignPlanDraft = {
  endYear: string;
  budget: string;
  selectedVideo: PublishableVideo | null;
  selectedQuestions: SelectedQuizQuestion[];
};
