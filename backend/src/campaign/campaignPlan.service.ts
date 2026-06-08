import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { PORTIONS_PER_YEAR } from "./constants.js";
import type { PlanPortionService } from "./planPortion.service";
import { pointsPerPortion } from "./planPortionSchedule.js";
import type { PublishedVideoService } from "./publishedVideo.service";
import type { CampaignPlanRecord, CampaignPlanSummary, CreateCampaignPlanInput } from "./types";

const PLAN_SELECT =
  "SELECT id, creator_user_id, start_year, end_year, total_points_budget, escrow_balance, reward_pool_balance, rewarded_total, distributed_total, completed_total, status, created_at, updated_at FROM campaign_plans";

const MAX_POINTS_PER_YEAR = 1_000_000;

function createPlanId(): string {
  return randomBytes(10).toString("base64url").slice(0, 14);
}

function mapPlan(row: CampaignPlanRecord, publishedVideo?: CampaignPlanSummary["publishedVideo"]): CampaignPlanSummary {
  return {
    planId: row.id,
    startYear: row.start_year,
    endYear: row.end_year,
    pointsPerYear: row.total_points_budget,
    pointsPerPortion: pointsPerPortion(row.total_points_budget),
    portionsPerYear: PORTIONS_PER_YEAR,
    rewardPoolBalance: row.reward_pool_balance,
    rewardedTotal: row.rewarded_total,
    distributedTotal: row.distributed_total ?? 0,
    completedTotal: row.completed_total ?? 0,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(publishedVideo ? { publishedVideo } : {}),
  };
}

export class CampaignPlanService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly publishedVideos: PublishedVideoService,
    private readonly planPortions: PlanPortionService,
  ) {}

  createPlan(userId: string, input: CreateCampaignPlanInput): CampaignPlanSummary {
    const endYear = input.endYear;
    const pointsPerYear = input.totalPointsBudget;
    const currentYear = new Date().getFullYear();
    const interviewId = input.interviewId?.trim() ?? "";
    const taskId = input.taskId?.trim() ?? "";
    const questions = input.questions ?? [];

    if (!interviewId || !taskId) {
      throw new Error("VIDEO_REQUIRED");
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("QUIZ_QUESTIONS_REQUIRED");
    }
    if (questions.length > 200) {
      throw new Error("QUIZ_QUESTIONS_TOO_MANY");
    }
    if (!Number.isInteger(endYear) || endYear < currentYear) {
      throw new Error("INVALID_END_YEAR");
    }
    if (!Number.isInteger(pointsPerYear) || pointsPerYear <= 0) {
      throw new Error("INVALID_BUDGET");
    }
    if (pointsPerYear > MAX_POINTS_PER_YEAR) {
      throw new Error("BUDGET_TOO_LARGE");
    }
    if (pointsPerYear % PORTIONS_PER_YEAR !== 0) {
      throw new Error("BUDGET_NOT_DIVISIBLE");
    }

    const planId = createPlanId();
    const startYear = currentYear;
    const now = new Date().toISOString();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO campaign_plans
            (id, creator_user_id, start_year, end_year, total_points_budget, escrow_balance, reward_pool_balance, rewarded_total, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, 0, 'active', ?, ?)`,
        )
        .run(planId, userId, startYear, endYear, pointsPerYear, now, now);
      const publishedVideo = this.publishedVideos.insertWithinTransaction(userId, planId, {
        interviewId,
        taskId,
        questions,
      });
      this.planPortions.seedPortionsForPlan(planId, startYear, endYear, pointsPerYear, now);
      this.db.exec("COMMIT");

      this.planPortions.executeInitialPortionForPlan(planId, new Date(now));

      const row = this.db.prepare(`${PLAN_SELECT} WHERE id = ?`).get(planId) as CampaignPlanRecord | undefined;
      if (!row) {
        throw new Error("PLAN_CREATE_FAILED");
      }
      return mapPlan(row, publishedVideo);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listMyPlans(userId: string): CampaignPlanSummary[] {
    const rows = this.db
      .prepare(`${PLAN_SELECT} WHERE creator_user_id = ? ORDER BY created_at DESC`)
      .all(userId) as CampaignPlanRecord[];
    const videoMap = this.publishedVideos.listForPlans(rows.map((r) => r.id));
    return rows.map((row) => mapPlan(row, videoMap.get(row.id)));
  }

  getPlanForCreator(userId: string, planId: string): CampaignPlanSummary | undefined {
    const row = this.db
      .prepare(`${PLAN_SELECT} WHERE id = ? AND creator_user_id = ?`)
      .get(planId, userId) as CampaignPlanRecord | undefined;
    if (!row) return undefined;
    const publishedVideo = this.publishedVideos.getForPlan(planId);
    return mapPlan(row, publishedVideo);
  }
}
