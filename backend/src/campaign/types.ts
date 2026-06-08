export type CampaignPlanStatus = "active" | "ended" | "cancelled";

export type CampaignPlanRecord = {
  id: string;
  creator_user_id: string;
  start_year: number;
  end_year: number;
  total_points_budget: number;
  escrow_balance: number;
  reward_pool_balance: number;
  rewarded_total: number;
  distributed_total: number;
  completed_total: number;
  status: CampaignPlanStatus;
  created_at: string;
  updated_at: string;
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

export type PublishedQuizQuestion = {
  questionId: string;
  question: string;
  referenceAnswer: string;
  rewardPoints: number;
  sortOrder: number;
};

export type CreateCampaignPlanInput = {
  endYear: number;
  /** 每年投入积分（须能被 100 整除）。 */
  totalPointsBudget: number;
  interviewId: string;
  taskId: string;
  questions: SelectedQuizQuestion[];
};

export type PublishableVideoItem = {
  interviewId: string;
  interviewTitle?: string;
  taskId: string;
  productionMode: string;
  createdAt: string;
  title: string;
};

export type PublishedVideoStatus = "published" | "unpublished";

export type PublishedVideoSummary = {
  publishId: string;
  planId: string;
  interviewId: string;
  taskId: string;
  title: string;
  rewardPoints: number;
  quizQuestionCount: number;
  status: PublishedVideoStatus;
  publishedAt: string;
  questions?: PublishedQuizQuestion[];
};

export type CampaignPlanSummary = {
  planId: string;
  startYear: number;
  endYear: number;
  pointsPerYear: number;
  pointsPerPortion: number;
  portionsPerYear: number;
  rewardPoolBalance: number;
  rewardedTotal: number;
  distributedTotal: number;
  completedTotal: number;
  status: CampaignPlanStatus;
  createdAt: string;
  updatedAt: string;
  publishedVideo?: PublishedVideoSummary;
};

export type GenerateQuizQuestionsInput = {
  interviewId: string;
  taskId: string;
  excludeQuestions?: string[];
};
