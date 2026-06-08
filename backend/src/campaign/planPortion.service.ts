import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { WalletService } from "../wallet/wallet.service";
import type { WatchTaskDispatchService } from "../watch/dispatch/watchTaskDispatch.service.js";
import { PORTIONS_PER_YEAR } from "./constants.js";
import {
  nextRetryDate,
  pointsPerPortion,
  scheduledDateForSlot,
  todayIsoDate,
} from "./planPortionSchedule.js";

export type PortionExecutionStatus = "pending" | "succeeded" | "failed";

type PlanRow = {
  id: string;
  creator_user_id: string;
  start_year: number;
  end_year: number;
  total_points_budget: number;
  reward_pool_balance: number;
  status: string;
};

type PortionRow = {
  id: string;
  plan_id: string;
  calendar_year: number;
  slot_index: number;
  points_amount: number;
  status: string;
  scheduled_date: string;
  next_attempt_on: string | null;
  executed_at: string | null;
  fail_reason: string | null;
};

function createPortionId(): string {
  return randomBytes(8).toString("base64url");
}

export class PlanPortionService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly wallet: WalletService,
    private readonly dispatch?: WatchTaskDispatchService,
  ) {}

  /** 创建计划后写入各年 100 份执行记录（首年跳过创建日之前的份）。 */
  seedPortionsForPlan(planId: string, startYear: number, endYear: number, pointsPerYear: number, createdAt: string): void {
    const amount = pointsPerPortion(pointsPerYear);
    const createdDate = createdAt.slice(0, 10);
    const insert = this.db.prepare(
      `INSERT INTO plan_portion_executions
        (id, plan_id, calendar_year, slot_index, points_amount, status, scheduled_date, next_attempt_on, executed_at, fail_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, NULL, ?, ?)`,
    );
    const now = createdAt;
    for (let year = startYear; year <= endYear; year += 1) {
      for (let slot = 0; slot < PORTIONS_PER_YEAR; slot += 1) {
        const scheduled = scheduledDateForSlot(year, slot);
        if (year === startYear && scheduled < createdDate) {
          continue;
        }
        insert.run(createPortionId(), planId, year, slot, amount, scheduled, now, now);
      }
    }
  }

  runDueExecutions(now = new Date()): { attempted: number; succeeded: number; failed: number } {
    const today = todayIsoDate(now);
    const rows = this.db
      .prepare(
        `SELECT ppe.id, ppe.plan_id, ppe.calendar_year, ppe.slot_index, ppe.points_amount, ppe.status,
                ppe.scheduled_date, ppe.next_attempt_on, ppe.executed_at, ppe.fail_reason
         FROM plan_portion_executions ppe
         INNER JOIN campaign_plans cp ON cp.id = ppe.plan_id
         WHERE cp.status = 'active'
           AND ppe.status IN ('pending', 'failed')
           AND (
             (ppe.status = 'pending' AND ppe.scheduled_date <= ?)
             OR (ppe.status = 'failed' AND ppe.next_attempt_on IS NOT NULL AND ppe.next_attempt_on <= ?)
           )`,
      )
      .all(today, today) as PortionRow[];

    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      const result = this.tryExecutePortion(row, now);
      if (result === "succeeded") succeeded += 1;
      else if (result === "failed") failed += 1;
      if (result !== "skipped") attempted += 1;
    }
    return { attempted, succeeded, failed };
  }

  /** 新建计划后立即执行当前年最早的一份（忽略 scheduled_date）。 */
  executeInitialPortionForPlan(planId: string, now = new Date()): "succeeded" | "failed" | "skipped" {
    const row = this.db
      .prepare(
        `SELECT id, plan_id, calendar_year, slot_index, points_amount, status,
                scheduled_date, next_attempt_on, executed_at, fail_reason
         FROM plan_portion_executions
         WHERE plan_id = ? AND status IN ('pending', 'failed')
         ORDER BY calendar_year ASC, slot_index ASC
         LIMIT 1`,
      )
      .get(planId) as PortionRow | undefined;
    if (!row) return "skipped";
    return this.tryExecutePortion(row, now, "initial");
  }

  private tryExecutePortion(
    row: PortionRow,
    now: Date,
    dispatchSource: "initial" | "portion" = "portion",
  ): "succeeded" | "failed" | "skipped" {
    const plan = this.db
      .prepare(
        `SELECT id, creator_user_id, start_year, end_year, total_points_budget, reward_pool_balance, status
         FROM campaign_plans WHERE id = ?`,
      )
      .get(row.plan_id) as PlanRow | undefined;
    if (!plan || plan.status !== "active") return "skipped";
    if (row.calendar_year < plan.start_year || row.calendar_year > plan.end_year) return "skipped";

    const ts = now.toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const claimed = this.db
        .prepare(
          `UPDATE plan_portion_executions
           SET status = 'succeeded', executed_at = ?, next_attempt_on = NULL, fail_reason = NULL, updated_at = ?
           WHERE id = ? AND status IN ('pending', 'failed')`,
        )
        .run(ts, ts, row.id);
      if (claimed.changes !== 1) {
        this.db.exec("ROLLBACK");
        return "skipped";
      }

      this.wallet.applyDeltaWithinTransaction(plan.creator_user_id, -row.points_amount, "plan_portion", {
        refType: "plan_portion",
        refId: row.id,
        note: `plan portion y${row.calendar_year} s${row.slot_index}`,
      });
      this.db
        .prepare(
          `UPDATE campaign_plans
           SET reward_pool_balance = reward_pool_balance + ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(row.points_amount, ts, plan.id);
      this.db.exec("COMMIT");
      if (this.dispatch) {
        this.dispatch.distributeForPortion(row.plan_id, row.id, dispatchSource, { now });
      }
      return "succeeded";
    } catch (error) {
      this.db.exec("ROLLBACK");
      const reason = error instanceof Error ? error.message : "EXECUTE_FAILED";
      const retryBase = row.status === "failed" && row.next_attempt_on ? row.next_attempt_on : row.scheduled_date;
      const nextAttempt = nextRetryDate(retryBase);
      this.db
        .prepare(
          `UPDATE plan_portion_executions
           SET status = 'failed', next_attempt_on = ?, fail_reason = ?, updated_at = ?
           WHERE id = ? AND status IN ('pending', 'failed')`,
        )
        .run(nextAttempt, reason, ts, row.id);
      return "failed";
    }
  }
}
