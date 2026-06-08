import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { PORTIONS_PER_YEAR, QUIZ_POINTS_PER_QUESTION } from "../../campaign/constants.js";
import { localDistributionDate } from "./watchDispatchSchedule.js";

export type WatchTaskAssignmentSource = "initial" | "portion" | "redistribute";

type PlanContext = {
  planId: string;
  creatorUserId: string;
  publishId: string;
  rewardPoolBalance: number;
  quizQuestionCount: number;
};

function createAssignmentId(): string {
  return randomBytes(8).toString("base64url").slice(0, 12);
}

export class WatchTaskDispatchService {
  constructor(private readonly db: DatabaseSync) {}

  /** N = min(100, 可用用户, floor(奖池/单人最大), slotsRequested) */
  computeDispatchCount(ctx: PlanContext, slotsRequested: number): number {
    const maxPerViewer = Math.max(1, ctx.quizQuestionCount * QUIZ_POINTS_PER_QUESTION);
    const poolFunded = Math.floor(ctx.rewardPoolBalance / maxPerViewer);
    const eligibleCount = this.db
      .prepare("SELECT COUNT(*) AS c FROM users WHERE id != ?")
      .get(ctx.creatorUserId) as { c: number };
    return Math.min(PORTIONS_PER_YEAR, eligibleCount.c, poolFunded, slotsRequested);
  }

  private loadPlanContext(planId: string): PlanContext | undefined {
    const row = this.db
      .prepare(
        `SELECT cp.id AS plan_id, cp.creator_user_id, cp.reward_pool_balance,
                pv.id AS publish_id, pv.quiz_question_count
         FROM campaign_plans cp
         INNER JOIN published_videos pv ON pv.plan_id = cp.id
         WHERE cp.id = ? AND cp.status = 'active'`,
      )
      .get(planId) as
      | {
          plan_id: string;
          creator_user_id: string;
          reward_pool_balance: number;
          publish_id: string;
          quiz_question_count: number;
        }
      | undefined;
    if (!row) return undefined;
    return {
      planId: row.plan_id,
      creatorUserId: row.creator_user_id,
      publishId: row.publish_id,
      rewardPoolBalance: row.reward_pool_balance,
      quizQuestionCount: row.quiz_question_count,
    };
  }

  distributeForPortion(
    planId: string,
    portionExecutionId: string,
    source: WatchTaskAssignmentSource,
    opts?: { slotsRequested?: number; now?: Date },
  ): number {
    return this.distribute(planId, portionExecutionId, source, opts?.slotsRequested ?? PORTIONS_PER_YEAR, opts?.now);
  }

  distributeFromBacklog(
    backlogId: string,
    planId: string,
    publishId: string,
    portionExecutionId: string | null,
    pendingSlots: number,
    now = new Date(),
  ): number {
    const assigned = this.distribute(planId, portionExecutionId, "redistribute", pendingSlots, now);
    if (assigned > 0) {
      const ts = now.toISOString();
      const remaining = pendingSlots - assigned;
      if (remaining <= 0) {
        this.db.prepare(`DELETE FROM watch_task_backlog WHERE id = ?`).run(backlogId);
      } else {
        this.db
          .prepare(`UPDATE watch_task_backlog SET pending_slots = ?, updated_at = ? WHERE id = ?`)
          .run(remaining, ts, backlogId);
      }
    }
    return assigned;
  }

  private distribute(
    planId: string,
    portionExecutionId: string | null,
    source: WatchTaskAssignmentSource,
    slotsRequested: number,
    now = new Date(),
  ): number {
    const ctx = this.loadPlanContext(planId);
    if (!ctx) return 0;

    const n = this.computeDispatchCount(ctx, slotsRequested);
    if (n <= 0) {
      console.warn("[watch-dispatch] skip: N=0", { planId, source, slotsRequested });
      return 0;
    }

    const distributionDate = localDistributionDate(now);
    const alreadyAssigned = this.db
      .prepare(
        `SELECT viewer_user_id FROM watch_task_assignments
         WHERE publish_id = ? AND distribution_date = ?`,
      )
      .all(ctx.publishId, distributionDate) as { viewer_user_id: string }[];
    const excludeIds = new Set([ctx.creatorUserId, ...alreadyAssigned.map((r) => r.viewer_user_id)]);

    const candidates = this.db
      .prepare(
        `SELECT id FROM users WHERE id != ?
         ORDER BY RANDOM() LIMIT ?`,
      )
      .all(ctx.creatorUserId, n + excludeIds.size) as { id: string }[];

    const picked = candidates.map((c) => c.id).filter((id) => !excludeIds.has(id)).slice(0, n);
    if (picked.length === 0) return 0;

    const ts = now.toISOString();
    const insert = this.db.prepare(
      `INSERT INTO watch_task_assignments
        (id, plan_id, publish_id, portion_execution_id, viewer_user_id, distribution_date, status, source, assigned_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    );

    let inserted = 0;
    for (const viewerUserId of picked) {
      try {
        insert.run(
          createAssignmentId(),
          ctx.planId,
          ctx.publishId,
          portionExecutionId,
          viewerUserId,
          distributionDate,
          source,
          ts,
        );
        inserted += 1;
      } catch {
        // UNIQUE(viewer, publish, date) — skip collision
      }
    }

    if (inserted > 0) {
      this.db
        .prepare(
          `UPDATE campaign_plans SET distributed_total = distributed_total + ?, updated_at = ? WHERE id = ?`,
        )
        .run(inserted, ts, ctx.planId);
    }

    console.info("[watch-dispatch] assigned", {
      planId,
      source,
      requested: slotsRequested,
      assigned: inserted,
      distributionDate,
    });
    return inserted;
  }

  markAssignmentCompleted(viewerUserId: string, publishId: string, now = new Date()): void {
    const distributionDate = localDistributionDate(now);
    const ts = now.toISOString();
    this.db
      .prepare(
        `UPDATE watch_task_assignments
         SET status = 'completed', completed_at = ?
         WHERE viewer_user_id = ? AND publish_id = ? AND distribution_date = ? AND status = 'pending'`,
      )
      .run(ts, viewerUserId, publishId, distributionDate);
  }

  /** 测试/集成：直接写入 assignment。 */
  seedAssignment(
    viewerUserId: string,
    planId: string,
    publishId: string,
    opts?: { portionExecutionId?: string; distributionDate?: string },
  ): void {
    const distributionDate = opts?.distributionDate ?? localDistributionDate();
    const ts = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO watch_task_assignments
          (id, plan_id, publish_id, portion_execution_id, viewer_user_id, distribution_date, status, source, assigned_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 'initial', ?)`,
      )
      .run(
        createAssignmentId(),
        planId,
        publishId,
        opts?.portionExecutionId ?? null,
        viewerUserId,
        distributionDate,
        ts,
      );
  }
}
