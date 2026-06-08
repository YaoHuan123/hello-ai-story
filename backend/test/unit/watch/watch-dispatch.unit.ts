/**
 * 日任务分发：N 计算、日终结算、日初重发。
 *
 * 运行：`npm run build && npm run test:watch-dispatch`
 */
import { config as loadEnv } from "dotenv";
import { initDb } from "../../../dist/db/init.js";
import { WatchTaskDispatchService } from "../../../dist/watch/dispatch/watchTaskDispatch.service.js";
import { WatchDaySettlementService } from "../../../dist/watch/dispatch/watchDaySettlement.service.js";
import { WatchRewardSettlementService } from "../../../dist/watch/watchRewardSettlement.service.js";
import { WalletService } from "../../../dist/wallet/wallet.service.js";
import { localDistributionDate } from "../../../dist/watch/dispatch/watchDispatchSchedule.js";
import { registerTestPhoneUser } from "../../helpers/testAccount";

loadEnv();

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  [ok] ${label}`);
  } else {
    failed += 1;
    const extra = detail !== undefined ? ` | ${JSON.stringify(detail)}` : "";
    console.error(`  [FAIL] ${label}${extra}`);
  }
}

function main(): void {
  const db = initDb();
  const dispatch = new WatchTaskDispatchService(db);
  const wallet = new WalletService(db);
  const settlement = new WatchDaySettlementService(db, dispatch, new WatchRewardSettlementService(db, wallet));

  const { userId: creatorId } = registerTestPhoneUser(db, "dispatch-creator");
  registerTestPhoneUser(db, "dispatch-viewer-a");
  registerTestPhoneUser(db, "dispatch-viewer-b");
  registerTestPhoneUser(db, "dispatch-viewer-c");

  check(
    "N limited by pool and users",
    dispatch.computeDispatchCount(
      {
        planId: "p1",
        creatorUserId: creatorId,
        publishId: "pub1",
        rewardPoolBalance: 8,
        quizQuestionCount: 2,
      },
      100,
    ) === 2,
  );

  check(
    "N=0 when pool below maxPerViewer",
    dispatch.computeDispatchCount(
      {
        planId: "p1",
        creatorUserId: creatorId,
        publishId: "pub1",
        rewardPoolBalance: 3,
        quizQuestionCount: 2,
      },
      100,
    ) === 0,
  );

  const planId = `test-dispatch-plan-${Date.now()}`;
  const publishId = `test-dispatch-pub-${Date.now()}`;
  const now = new Date();
  const distributionDate = localDistributionDate(now);
  const ts = now.toISOString();

  db.prepare(
    `INSERT INTO campaign_plans
      (id, creator_user_id, start_year, end_year, total_points_budget, escrow_balance,
       reward_pool_balance, rewarded_total, distributed_total, completed_total, status, created_at, updated_at)
     VALUES (?, ?, 2026, 2026, 400, 0, 8, 0, 0, 0, 'active', ?, ?)`,
  ).run(planId, creatorId, ts, ts);

  db.prepare(
    `INSERT INTO published_videos
      (id, plan_id, owner_user_id, interview_id, task_id, title, reward_points, quiz_question_count, status, published_at)
     VALUES (?, ?, ?, ?, ?, 't', 2, 2, 'published', ?)`,
  ).run(publishId, planId, creatorId, `iv-${planId}`, `tk-${planId}`, ts);

  const viewers = db
    .prepare("SELECT id FROM users WHERE id != ? LIMIT 2")
    .all(creatorId) as { id: string }[];

  for (const v of viewers) {
    const status = v.id === viewers[0].id ? "completed" : "pending";
    db.prepare(
      `INSERT INTO watch_task_assignments
        (id, plan_id, publish_id, portion_execution_id, viewer_user_id, distribution_date, status, source, assigned_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, 'initial', ?)`,
    ).run(`a-${v.id}`, planId, publishId, v.id, distributionDate, status, ts);
  }

  const endResult = settlement.runDayEnd(now);
  const ourPending = db
    .prepare(
      `SELECT COUNT(*) AS c FROM watch_task_backlog WHERE plan_id = ?`,
    )
    .get(planId) as { c: number };
  check("day end backlog for plan", ourPending.c >= 1, ourPending);
  check(
    "assignments cleared for date",
    (db.prepare("SELECT COUNT(*) AS c FROM watch_task_assignments WHERE distribution_date = ? AND plan_id = ?").get(distributionDate, planId) as { c: number }).c === 0,
  );

  const backlog = db
    .prepare("SELECT pending_slots FROM watch_task_backlog WHERE plan_id = ?")
    .get(planId) as { pending_slots?: number };
  check("backlog stores pending slots", (backlog.pending_slots ?? 0) === 1, backlog);

  const planRow = db
    .prepare("SELECT completed_total FROM campaign_plans WHERE id = ?")
    .get(planId) as { completed_total?: number };
  check("plan completed_total updated", (planRow.completed_total ?? 0) === 1, planRow);

  const assigned = settlement.runDayStart(now);
  check("day start redistributes from backlog", assigned >= 1, { assigned, endResult });

  const afterRedistribute = db
    .prepare(
      "SELECT COUNT(*) AS c FROM watch_task_assignments WHERE distribution_date = ? AND plan_id = ? AND status = 'pending'",
    )
    .get(distributionDate, planId) as { c: number };
  check("new pending assignment exists for plan", afterRedistribute.c >= 1, afterRedistribute);

  if (failed > 0) {
    console.error(`\ntest:watch-dispatch FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:watch-dispatch OK (${passed} checks)`);
}

main();
