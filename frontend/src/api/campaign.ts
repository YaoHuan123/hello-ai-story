import type {
  CampaignPlan,
  CampaignPlanListResponse,
  GenerateQuizQuestionsResponse,
  PublishableVideoListResponse,
  SelectedQuizQuestion,
} from "../types/campaign";
import { apiRequest } from "./client";

export async function listPublishableVideos(): Promise<PublishableVideoListResponse> {
  return apiRequest<PublishableVideoListResponse>("/api/campaigns/publishable-videos", { method: "GET" }, true);
}

export async function generateQuizQuestions(payload: {
  interviewId: string;
  taskId: string;
  excludeQuestions?: string[];
}): Promise<GenerateQuizQuestionsResponse> {
  return apiRequest<GenerateQuizQuestionsResponse>("/api/campaigns/quiz-questions/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  }, true);
}

export async function createCampaignPlan(payload: {
  endYear: number;
  totalPointsBudget: number;
  interviewId: string;
  taskId: string;
  questions: SelectedQuizQuestion[];
}): Promise<CampaignPlan> {
  return apiRequest<CampaignPlan>("/api/campaigns/plans", {
    method: "POST",
    body: JSON.stringify(payload),
  }, true);
}

export async function listMyCampaignPlans(): Promise<CampaignPlanListResponse> {
  return apiRequest<CampaignPlanListResponse>("/api/campaigns/plans/mine", { method: "GET" }, true);
}

export async function getCampaignPlan(planId: string): Promise<CampaignPlan> {
  return apiRequest<CampaignPlan>(`/api/campaigns/plans/${encodeURIComponent(planId)}`, { method: "GET" }, true);
}
