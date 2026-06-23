import { apiRequest } from "./client";

export type AdminVideoStatusCounts = {
  total: number;
  success: number;
  failed: number;
  running: number;
  queued: number;
  pending: number;
  other: number;
};

export type AdminInterviewUsage = {
  interviewId: string;
  interviewIdShort: string;
  createdAt: string;
  interviewStatus?: "active" | "complete";
  answerCount: number;
  videos: AdminVideoStatusCounts;
};

export type AdminUserUsage = {
  userId: string;
  userIdShort: string;
  createdAt: string;
  interviewCount: number;
  answerCount: number;
  videos: AdminVideoStatusCounts;
  interviews: AdminInterviewUsage[];
};

export type AdminUsageResponse = {
  generatedAt: string;
  summary: {
    userCount: number;
    interviewCount: number;
    answerCount: number;
    videos: AdminVideoStatusCounts;
  };
  users: AdminUserUsage[];
};

export function fetchAdminUsage(): Promise<AdminUsageResponse> {
  return apiRequest<AdminUsageResponse>("/api/admin/usage", {}, true);
}
