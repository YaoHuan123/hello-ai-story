/**
 * 答题 submit 防重复发奖（乐观锁 + 日终结算发奖）。
 *
 * 运行：`npm run build && npm run test:reward-idempotency`
 */
import { config as loadEnv } from "dotenv";
import { initDb } from "../../../dist/db/init.js";
import { WalletService } from "../../../dist/wallet/wallet.service.js";
import { WatchFeedService } from "../../../dist/watch/watchFeed.service.js";
import { WatchQuizService } from "../../../dist/watch/watchQuiz.service.js";
import { WatchRewardSettlementService } from "../../../dist/watch/watchRewardSettlement.service.js";
import { localDistributionDate } from "../../../dist/watch/dispatch/watchDispatchSchedule.js";
import { PublishedVideoService } from "../../../dist/campaign/publishedVideo.service.js";
import { PlanPortionService } from "../../../dist/campaign/planPortion.service.js";
import { registerTestPhoneUser } from "../../helpers/testAccount";

loadEnv();
process.env.WATCH_QUIZ_STUB = "1";

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  [ok] ${label}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${label}${detail !== undefined ? ` | ${JSON.stringify(detail)}` : ""}`);
  }
}

async function main(): Promise<void> {
  const db = initDb();
  const wallet = new WalletService(db);
  const planPortion = new PlanPortionService(db, wallet);

  console.log("\n=== 份执行：同一 pending 份只扣款一次 ===");
  const { userId: creatorId } = registerTestPhoneUser(db, "portion-idem-creator");
  wallet.mockRecharge(creatorId, 500);
  const planId = `plan-idem-${Date.now()}`;
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO campaign_plans
      (id, creator_user_id, start_year, end_year, total_points_budget, escrow_balance,
       reward_pool_balance, rewarded_total, distributed_total, completed_total, status, created_at, updated_at)
     VALUES (?, ?, 2026, 2026, 400, 0, 0, 0, 0, 0, 'active', ?, ?)`,
  ).run(planId, creatorId, ts, ts);
  const portionId = `portion-idem-${Date.now()}`;
  db.prepare(
    `INSERT INTO plan_portion_executions
      (id, plan_id, calendar_year, slot_index, points_amount, status, scheduled_date, next_attempt_on, executed_at, fail_reason, created_at, updated_at)
     VALUES (?, ?, 2026, 0, 4, 'pending', '2026-01-01', NULL, NULL, NULL, ?, ?)`,
  ).run(portionId, planId, ts, ts);
  const before = wallet.getBalance(creatorId).balance;
  planPortion.executeInitialPortionForPlan(planId);
  planPortion.executeInitialPortionForPlan(planId);
  const after = wallet.getBalance(creatorId).balance;
  const pool = (
    db.prepare("SELECT reward_pool_balance FROM campaign_plans WHERE id = ?").get(planId) as {
      reward_pool_balance: number;
    }
  ).reward_pool_balance;
  check("initial portion debits wallet once", before - after === 4, { before, after });
  check("reward pool funded once", pool === 4, { pool });

  console.log("\n=== 答题：日终发奖 + 重复提交拒绝 ===");
  const { userId: viewerId } = registerTestPhoneUser(db, "quiz-idem-viewer");
  const publishId = `pub-idem-${Date.now()}`;
  const portionRow = db
    .prepare("SELECT id FROM plan_portion_executions WHERE plan_id = ? LIMIT 1")
    .get(planId) as { id: string };
  db.prepare(
    `UPDATE campaign_plans SET reward_pool_balance = 4 WHERE id = ?`,
  ).run(planId);
  db.prepare(
    `INSERT INTO published_videos
      (id, plan_id, owner_user_id, interview_id, task_id, title, reward_points, quiz_question_count, status, published_at)
     VALUES (?, ?, ?, ?, ?, 't', 2, 1, 'published', ?)`,
  ).run(publishId, planId, creatorId, `iv-${publishId}`, `tk-${publishId}`, ts);
  db.prepare(
    `INSERT INTO published_quiz_questions
      (id, publish_id, sort_order, question_text, reference_answer, reward_points, created_at)
     VALUES (?, ?, 0, '童年在哪？', '江南水乡', 2, ?)`,
  ).run(`q-${publishId}`, publishId, ts);

  const today = localDistributionDate();
  db.prepare(
    `INSERT INTO watch_task_assignments
      (id, plan_id, publish_id, portion_execution_id, viewer_user_id, distribution_date, status, source, assigned_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 'initial', ?)`,
  ).run(`asg-${publishId}`, planId, publishId, portionRow.id, viewerId, today, ts);

  const quiz = new WatchQuizService(db, new WatchFeedService(db), new PublishedVideoService(db));
  const settlement = new WatchRewardSettlementService(db, wallet);
  quiz.startQuiz(viewerId, publishId);
  await quiz.submitAnswer(viewerId, publishId, "江南水乡");
  check("wallet unchanged before settlement", wallet.getBalance(viewerId).balance === 0);

  let duplicateRejected = false;
  try {
    await quiz.submitAnswer(viewerId, publishId, "江南水乡");
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    duplicateRejected = code === "QUIZ_SESSION_COMPLETED" || code === "QUIZ_ANSWER_ALREADY_SUBMITTED";
  }
  check("duplicate submit rejected", duplicateRejected);

  settlement.settleForDistributionDate(today);
  check("viewer rewarded once at day end", wallet.getBalance(viewerId).balance === 2);

  if (failed > 0) {
    console.error(`\ntest:reward-idempotency FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:reward-idempotency OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
