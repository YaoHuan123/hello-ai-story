import type { DatabaseSync } from "node:sqlite";
import type { WalletService } from "../wallet/wallet.service.js";

type AssignmentRow = {
  id: string;
  plan_id: string;
  publish_id: string;
  viewer_user_id: string;
  pending_reward_points: number;
};

type SessionRow = {
  questions_json: string;
  answers_json: string;
};

type SessionQuestion = { rewardPoints: number };
type SessionAnswer = { questionIndex: number; correct: boolean };

function parseQuestions(raw: string): SessionQuestion[] {
  try {
    const parsed = JSON.parse(raw) as SessionQuestion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseAnswers(raw: string): SessionAnswer[] {
  try {
    const parsed = JSON.parse(raw) as SessionAnswer[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 日终（23 点窗口）按 assignment 逐题从奖池发奖到观众钱包。 */
export class WatchRewardSettlementService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly wallet: WalletService,
  ) {}

  settleForDistributionDate(distributionDate: string, now = new Date()): { paidAssignments: number; totalPoints: number } {
    const rows = this.db
      .prepare(
        `SELECT id, plan_id, publish_id, viewer_user_id, pending_reward_points
         FROM watch_task_assignments
         WHERE distribution_date = ?
           AND status = 'completed'
           AND reward_settled = 0
           AND pending_reward_points > 0`,
      )
      .all(distributionDate) as AssignmentRow[];

    let paidAssignments = 0;
    let totalPoints = 0;
    for (const row of rows) {
      const paid = this.settleAssignment(row, now);
      if (paid > 0) {
        paidAssignments += 1;
      }
      totalPoints += paid;
    }

    console.info("[watch-reward-settlement]", { distributionDate, paidAssignments, totalPoints });
    return { paidAssignments, totalPoints };
  }

  private settleAssignment(row: AssignmentRow, now: Date): number {
    const session = this.db
      .prepare(
        `SELECT questions_json, answers_json FROM watch_quiz_sessions
         WHERE publish_id = ? AND viewer_user_id = ? AND status = 'completed'`,
      )
      .get(row.publish_id, row.viewer_user_id) as SessionRow | undefined;
    if (!session) {
      this.markSettled(row.id, now, 0);
      return 0;
    }

    const questions = parseQuestions(session.questions_json);
    const answers = parseAnswers(session.answers_json);
    const ts = now.toISOString();
    let paidTotal = 0;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const locked = this.db
        .prepare(
          `SELECT id FROM watch_task_assignments
           WHERE id = ? AND reward_settled = 0 AND pending_reward_points > 0`,
        )
        .get(row.id) as { id: string } | undefined;
      if (!locked) {
        this.db.exec("ROLLBACK");
        return 0;
      }

      for (const ans of answers) {
        if (!ans.correct) continue;
        const q = questions[ans.questionIndex];
        if (!q) continue;
        const reward = q.rewardPoints;
        if (reward <= 0) continue;

        const poolUpdate = this.db
          .prepare(
            `UPDATE campaign_plans
             SET reward_pool_balance = reward_pool_balance - ?, rewarded_total = rewarded_total + ?, updated_at = ?
             WHERE id = ? AND reward_pool_balance >= ?`,
          )
          .run(reward, reward, ts, row.plan_id, reward);
        if (poolUpdate.changes === 0) {
          continue;
        }

        this.wallet.applyDeltaWithinTransaction(row.viewer_user_id, reward, "quiz_reward", {
          refType: "watch_settlement",
          refId: `${row.id}:q${ans.questionIndex}`,
          note: `quiz settlement ${row.publish_id} q${ans.questionIndex + 1}`,
        });
        paidTotal += reward;
      }

      this.db
        .prepare(
          `UPDATE watch_task_assignments
           SET reward_settled = 1, pending_reward_points = 0, updated_at = ?
           WHERE id = ?`,
        )
        .run(ts, row.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return paidTotal;
  }

  private markSettled(assignmentId: string, now: Date, _paid: number): void {
    this.db
      .prepare(
        `UPDATE watch_task_assignments SET reward_settled = 1, pending_reward_points = 0, updated_at = ? WHERE id = ?`,
      )
      .run(now.toISOString(), assignmentId);
  }
}
