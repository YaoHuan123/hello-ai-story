import type { DatabaseSync } from "node:sqlite";
import { localDistributionDate } from "./watchDispatchSchedule.js";
import type { WatchTaskDispatchService } from "./watchTaskDispatch.service.js";
import type { WatchRewardSettlementService } from "../watchRewardSettlement.service.js";

type BacklogRow = {
  id: string;
  plan_id: string;
  publish_id: string;
  portion_execution_id: string | null;
  pending_slots: number;
};

export class WatchDaySettlementService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly dispatch: WatchTaskDispatchService,
    private readonly rewardSettlement: WatchRewardSettlementService,
  ) {}

  runDayEnd(now = new Date()): { completed: number; pending: number; backlogRows: number; rewardPointsPaid: number } {
    const distributionDate = localDistributionDate(now);
    const ts = now.toISOString();

    const rewardResult = this.rewardSettlement.settleForDistributionDate(distributionDate, now);

    const stats = this.db
      .prepare(
        `SELECT plan_id,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
         FROM watch_task_assignments
         WHERE distribution_date = ?
         GROUP BY plan_id`,
      )
      .all(distributionDate) as { plan_id: string; completed: number; pending: number }[];

    let totalCompleted = 0;
    let totalPending = 0;
    for (const row of stats) {
      totalCompleted += row.completed;
      totalPending += row.pending;
      this.db
        .prepare(
          `UPDATE campaign_plans
           SET completed_total = completed_total + ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(row.completed, ts, row.plan_id);
    }

    const pendingByPortion = this.db
      .prepare(
        `SELECT plan_id, publish_id, portion_execution_id, COUNT(*) AS pending_count
         FROM watch_task_assignments
         WHERE distribution_date = ? AND status = 'pending'
         GROUP BY plan_id, publish_id, portion_execution_id`,
      )
      .all(distributionDate) as {
      plan_id: string;
      publish_id: string;
      portion_execution_id: string | null;
      pending_count: number;
    }[];

    const upsertBacklog = this.db.prepare(
      `INSERT INTO watch_task_backlog (id, plan_id, publish_id, portion_execution_id, pending_slots, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET pending_slots = pending_slots + excluded.pending_slots, updated_at = excluded.updated_at`,
    );

    let backlogRows = 0;
    for (const row of pendingByPortion) {
      const backlogId = `${row.plan_id}:${row.publish_id}:${row.portion_execution_id ?? "none"}`;
      upsertBacklog.run(
        backlogId,
        row.plan_id,
        row.publish_id,
        row.portion_execution_id,
        row.pending_count,
        ts,
        ts,
      );
      backlogRows += 1;
    }

    this.db.prepare(`DELETE FROM watch_task_assignments WHERE distribution_date = ?`).run(distributionDate);

    console.info("[watch-settlement] day end", {
      distributionDate,
      totalCompleted,
      totalPending,
      backlogRows,
      rewardPointsPaid: rewardResult.totalPoints,
    });
    return { completed: totalCompleted, pending: totalPending, backlogRows, rewardPointsPaid: rewardResult.totalPoints };
  }

  runDayStart(now = new Date()): number {
    const rows = this.db
      .prepare(
        `SELECT id, plan_id, publish_id, portion_execution_id, pending_slots
         FROM watch_task_backlog WHERE pending_slots > 0`,
      )
      .all() as BacklogRow[];

    let totalAssigned = 0;
    for (const row of rows) {
      totalAssigned += this.dispatch.distributeFromBacklog(
        row.id,
        row.plan_id,
        row.publish_id,
        row.portion_execution_id,
        row.pending_slots,
        now,
      );
    }

    console.info("[watch-settlement] day start redistribute", { backlogCount: rows.length, totalAssigned });
    return totalAssigned;
  }
}
