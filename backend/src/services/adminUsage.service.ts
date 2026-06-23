import type { DatabaseSync } from "node:sqlite";
import { countCommittedAnswers } from "./answeredSections.service.js";
import { listInterviews, type InterviewMeta } from "./interviewWorkspace.service.js";
import { listVideoTasks } from "../video/worker/videoTaskQuery.js";
import type { VideoTaskMeta } from "../video/shared/orchestrator/videoTaskWorkspace.js";

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
  interviewStatus?: InterviewMeta["interviewStatus"];
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

export type AdminUsageSummary = {
  userCount: number;
  interviewCount: number;
  answerCount: number;
  videos: AdminVideoStatusCounts;
};

export type AdminUsageResponse = {
  generatedAt: string;
  summary: AdminUsageSummary;
  users: AdminUserUsage[];
};

const USER_LIST_SQL = "SELECT id, created_at FROM users ORDER BY datetime(created_at) DESC";

export function shortId(id: string, len = 8): string {
  const t = id.trim();
  if (t.length <= len) {
    return t;
  }
  return t.slice(0, len);
}

function emptyVideoCounts(): AdminVideoStatusCounts {
  return { total: 0, success: 0, failed: 0, running: 0, queued: 0, pending: 0, other: 0 };
}

function addVideoStatus(counts: AdminVideoStatusCounts, status: VideoTaskMeta["status"]): void {
  counts.total += 1;
  if (status === "success") counts.success += 1;
  else if (status === "failed") counts.failed += 1;
  else if (status === "running") counts.running += 1;
  else if (status === "queued") counts.queued += 1;
  else if (status === "pending") counts.pending += 1;
  else counts.other += 1;
}

function mergeVideoCounts(into: AdminVideoStatusCounts, from: AdminVideoStatusCounts): void {
  into.total += from.total;
  into.success += from.success;
  into.failed += from.failed;
  into.running += from.running;
  into.queued += from.queued;
  into.pending += from.pending;
  into.other += from.other;
}

function collectInterviewUsage(userId: string, meta: InterviewMeta): AdminInterviewUsage {
  const scope = { userId, interviewId: meta.id };
  const videos = emptyVideoCounts();
  for (const task of listVideoTasks(scope)) {
    addVideoStatus(videos, task.status);
  }
  return {
    interviewId: meta.id,
    interviewIdShort: shortId(meta.id),
    createdAt: meta.createdAt,
    interviewStatus: meta.interviewStatus,
    answerCount: countCommittedAnswers(scope),
    videos,
  };
}

function collectUserUsage(userId: string, createdAt: string): AdminUserUsage {
  const interviews = listInterviews(userId).map((meta) => collectInterviewUsage(userId, meta));
  const videos = emptyVideoCounts();
  let answerCount = 0;
  for (const row of interviews) {
    answerCount += row.answerCount;
    mergeVideoCounts(videos, row.videos);
  }
  return {
    userId,
    userIdShort: shortId(userId),
    createdAt,
    interviewCount: interviews.length,
    answerCount,
    videos,
    interviews,
  };
}

/** 聚合全站用量（仅计数，不读取问答/故事正文）。 */
export function buildAdminUsageReport(db: DatabaseSync): AdminUsageResponse {
  const rows = db.prepare(USER_LIST_SQL).all() as Array<{ id: string; created_at: string }>;
  const users = rows.map((row) => collectUserUsage(row.id, row.created_at));

  const summary: AdminUsageSummary = {
    userCount: users.length,
    interviewCount: 0,
    answerCount: 0,
    videos: emptyVideoCounts(),
  };
  for (const user of users) {
    summary.interviewCount += user.interviewCount;
    summary.answerCount += user.answerCount;
    mergeVideoCounts(summary.videos, user.videos);
  }

  return {
    generatedAt: new Date().toISOString(),
    summary,
    users,
  };
}

/** 测试/运维：将用户设为 admin（幂等）。 */
export function grantAdminRole(db: DatabaseSync, userId: string): boolean {
  const result = db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userId.trim());
  return result.changes > 0;
}

export function readUserRole(db: DatabaseSync, userId: string): string | null {
  const row = db.prepare("SELECT role FROM users WHERE id = ?").get(userId.trim()) as { role?: string } | undefined;
  return row?.role ?? null;
}
