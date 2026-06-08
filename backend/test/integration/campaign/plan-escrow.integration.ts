/**
 * 活动计划托管 + 视频发布 + 问答题：充值 → 选题 → 创建计划。
 *
 * 运行：`npm run build && npm run test:campaign`
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { Server } from "node:http";
import { createApp } from "../../../dist/app.js";
import { initDb } from "../../../dist/db/init.js";
import { QuizQuestionService } from "../../../dist/campaign/quizQuestion.service.js";
import { AuthService } from "../../../dist/services/auth/auth.service.js";
import { AliyunSmsService, ALIYUN_SMS_DEV_MOCK_CODE } from "../../../dist/services/auth/aliyunSms.service.js";
import { AuthAuditLogService } from "../../../dist/services/auth/authAuditLog.service.js";
import { SmsRateLimitService } from "../../../dist/services/auth/smsRateLimit.service.js";
import { seedCommittedSections } from "../../../dist/services/answeredSections.service.js";
import { createInterview } from "../../../dist/services/interviewWorkspace.service.js";
import {
  getVideoTaskPaths,
  writeVideoTaskMeta,
} from "../../../dist/video/shared/orchestrator/videoTaskWorkspace.js";
import { MERGED_VIDEO_REL } from "../../../dist/video/studio/constants/studioFilenames.js";
import { WalletService } from "../../../dist/wallet/wallet.service.js";
import type { AnsweredSection } from "../../../dist/topic/types.js";
import { registerTestPhoneUser } from "../../helpers/testAccount";
import { createCampaignServices } from "../../helpers/campaignServicesDist";

loadEnv();
process.env.ALIYUN_DYPNSAPI_DEV_MOCK = "1";
process.env.WALLET_MOCK_RECHARGE = "1";
process.env.WATCH_QUIZ_STUB = "1";
process.env.NODE_ENV = "development";

const MOCK_CODE = ALIYUN_SMS_DEV_MOCK_CODE;
const currentYear = new Date().getFullYear();

const FIXTURE: AnsweredSection[] = [
  {
    name: "基本档案",
    qa: [
      { q: "您怎么称呼？", a: "陈建国" },
      { q: "哪年出生？", a: "1965年3月，在江南水乡长大。" },
      { q: "童年最难忘的事？", a: "每天放学后帮爷爷在河边看鱼篓。" },
    ],
  },
];

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

function authHeader(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function seedSuccessVideoTask(userId: string, interviewId: string, taskId: string): void {
  const scope = { userId, interviewId };
  const paths = getVideoTaskPaths(scope, taskId);
  const mergedAbs = path.join(paths.taskRoot, MERGED_VIDEO_REL.split("/").join(path.sep));
  fs.mkdirSync(path.dirname(mergedAbs), { recursive: true });
  fs.writeFileSync(mergedAbs, "fake-video");
  const now = new Date().toISOString();
  writeVideoTaskMeta(paths, {
    id: taskId,
    interviewId,
    productionMode: "biography_narration",
    status: "success",
    createdAt: now,
    updatedAt: now,
    completedSteps: ["260"],
  });
}

async function main(): Promise<void> {
  const db = initDb();
  const authService = new AuthService(
    db,
    new AliyunSmsService(),
    new SmsRateLimitService(db),
    new AuthAuditLogService(db),
  );
  const walletService = new WalletService(db);
  const { planPortionService, campaignPlanService } = createCampaignServices(db, walletService);
  const quizQuestionService = new QuizQuestionService(db);
  const app = createApp(db, authService, walletService, campaignPlanService, quizQuestionService);

  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s));
    s.on("error", reject);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const { phone, userId } = registerTestPhoneUser(db, "campaign");
    registerTestPhoneUser(db, "campaign-viewer");
    const loginRes = await fetch(`${base}/api/auth/sms/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code: MOCK_CODE }),
    });
    const loginBody = (await loginRes.json()) as { token?: string; userId?: string };
    check(
      "sms login",
      loginRes.status === 200 && Boolean(loginBody.token) && loginBody.userId === userId,
      loginBody,
    );
    const token = loginBody.token!;

    const interview = createInterview(userId, { title: "激励测试故事" });
    seedCommittedSections({ userId, interviewId: interview.id }, FIXTURE);
    const taskId = "test-video-task-01";
    seedSuccessVideoTask(userId, interview.id, taskId);

    console.log("\n=== 随机生成 5 题 ===");
    const gen = await fetch(`${base}/api/campaigns/quiz-questions/generate`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ interviewId: interview.id, taskId }),
    });
    const genBody = (await gen.json()) as {
      questions?: Array<{ draftId?: string; question?: string; referenceAnswer?: string }>;
    };
    check("POST /quiz-questions/generate → 5", gen.status === 200 && genBody.questions?.length === 5, genBody);

    const selected = (genBody.questions ?? []).slice(0, 2).map((q) => ({
      question: q.question!,
      referenceAnswer: q.referenceAnswer!,
    }));

    console.log("\n=== mock 充值 500 ===");
    const topup = await fetch(`${base}/api/wallet/recharge/mock`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ amount: 500 }),
    });
    const topupBody = (await topup.json()) as { balance?: number };
    check("recharge → 500", topup.status === 200 && topupBody.balance === 500, topupBody);

    console.log("\n=== 创建计划 + 视频 + 题目 ===");
    const create = await fetch(`${base}/api/campaigns/plans`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({
        endYear: currentYear,
        totalPointsBudget: 400,
        interviewId: interview.id,
        taskId,
        questions: selected,
      }),
    });
    const planBody = (await create.json()) as {
      planId?: string;
      escrowBalance?: number;
      publishedVideo?: {
        publishId?: string;
        rewardPoints?: number;
        quizQuestionCount?: number;
        questions?: Array<{ question?: string; rewardPoints?: number }>;
      };
    };
    check("POST /plans → 201", create.status === 201 && Boolean(planBody.planId), planBody);
    check(
      "initial portion deducts wallet",
      (await (await fetch(`${base}/api/wallet/balance`, { headers: authHeader(token) })).json()).balance === 496,
    );
    check("rewardPool funded on create", (planBody as { rewardPoolBalance?: number }).rewardPoolBalance === 4, planBody);
    check("pointsPerPortion 4 for 400/year", (planBody as { pointsPerPortion?: number }).pointsPerPortion === 4, planBody);
    check("quizQuestionCount 2", planBody.publishedVideo?.quizQuestionCount === 2, planBody.publishedVideo);
    check("rewardPoints per question 2", planBody.publishedVideo?.rewardPoints === 2, planBody.publishedVideo);
    check("stored questions", (planBody.publishedVideo?.questions?.length ?? 0) === 2, planBody.publishedVideo?.questions);

    const today = new Date().toISOString().slice(0, 10);
    const assignmentCount = db
      .prepare(
        `SELECT COUNT(*) AS c FROM watch_task_assignments
         WHERE plan_id = ? AND distribution_date = ?`,
      )
      .get(planBody.planId!, today) as { c?: number };
    check("createPlan assigns watch tasks", (assignmentCount.c ?? 0) >= 1, assignmentCount);

    console.log("\n=== 我的计划列表 ===");
    const mine = await fetch(`${base}/api/campaigns/plans/mine`, { headers: authHeader(token) });
    const mineBody = (await mine.json()) as {
      plans?: Array<{ planId?: string; publishedVideo?: { publishId?: string; title?: string } }>;
    };
    check("GET /plans/mine → 200", mine.status === 200, mine.status);
    check(
      "plans/mine contains created plan",
      mineBody.plans?.some((p) => p.planId === planBody.planId && Boolean(p.publishedVideo?.publishId)),
      mineBody.plans,
    );

    console.log("\n=== 份执行：余额不足 → 失败 ===");
    const portionRow = db
      .prepare("SELECT id FROM plan_portion_executions WHERE plan_id = ? AND status = 'pending' LIMIT 1")
      .get(planBody.planId!) as { id?: string };
    const portionId = portionRow.id!;
    db.prepare("UPDATE plan_portion_executions SET scheduled_date = ? WHERE id = ?").run(today, portionId);
    db.prepare("UPDATE wallets SET balance = 0 WHERE user_id = ?").run(userId);
    const failRun = planPortionService.runDueExecutions(new Date());
    check("portion run attempted", failRun.attempted >= 1, failRun);
    check("portion failed on insufficient balance", failRun.failed >= 1, failRun);

    console.log("\n=== 份执行：次年同日重试成功 ===");
    db.prepare("UPDATE plan_portion_executions SET next_attempt_on = ?, status = 'failed' WHERE id = ?").run(
      today,
      portionId,
    );
    await fetch(`${base}/api/wallet/recharge/mock`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ amount: 500 }),
    });
    const okRun = planPortionService.runDueExecutions(new Date());
    check("portion retry succeeded", okRun.succeeded >= 1, okRun);
    const planAfter = db
      .prepare("SELECT reward_pool_balance FROM campaign_plans WHERE id = ?")
      .get(planBody.planId!) as { reward_pool_balance?: number };
    check("reward pool funded", (planAfter.reward_pool_balance ?? 0) >= 8, planAfter);

    console.log("\n=== 不可整除 100 ===");
    const badBudget = await fetch(`${base}/api/campaigns/plans`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({
        endYear: currentYear + 1,
        totalPointsBudget: 250,
        interviewId: interview.id,
        taskId: "other-task-not-exist",
        questions: selected,
      }),
    });
    check("budget not divisible → 400", badBudget.status === 400);

    console.log("\n=== 无题目不可发布 ===");
    const noQ = await fetch(`${base}/api/campaigns/plans`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({
        endYear: currentYear,
        totalPointsBudget: 100,
        interviewId: interview.id,
        taskId: "other",
        questions: [],
      }),
    });
    check("empty questions → 400", noQ.status === 400);

    void planBody;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  if (failed > 0) {
    console.error(`\ntest:campaign FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:campaign OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
