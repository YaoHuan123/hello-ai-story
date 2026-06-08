/**
 * 观看答题：观众开始 → 提交 → 积分发放 + 托管扣减。
 *
 * 运行：`npm run build && npm run test:watch-quiz`
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
import { WatchRewardSettlementService } from "../../../dist/watch/watchRewardSettlement.service.js";
import { localDistributionDate } from "../../../dist/watch/dispatch/watchDispatchSchedule.js";

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
      { q: "童年？", a: "在江南水乡长大，每天帮爷爷看鱼篓。" },
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

async function smsLogin(base: string, phone: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/sms/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: MOCK_CODE }),
  });
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("login failed");
  return body.token;
}

function seedSuccessVideoTask(userId: string, interviewId: string, taskId: string): void {
  const scope = { userId, interviewId };
  const paths = getVideoTaskPaths(scope, taskId);
  const mergedAbs = path.join(paths.taskRoot, MERGED_VIDEO_REL.split("/").join(path.sep));
  fs.mkdirSync(path.dirname(mergedAbs), { recursive: true });
  fs.writeFileSync(mergedAbs, "fake-video-bytes");
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
  const { campaignPlanService, watchDispatch } = createCampaignServices(db, walletService);
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
    const { phone: creatorPhone, userId: creatorUserId } = registerTestPhoneUser(db, "quiz-creator");
    const { phone: viewerPhone, userId: viewerUserId } = registerTestPhoneUser(db, "quiz-viewer");
    const creatorToken = await smsLogin(base, creatorPhone);

    const interview = createInterview(creatorUserId, { title: "答题测试故事" });

    seedCommittedSections({ userId: creatorUserId, interviewId: interview.id }, FIXTURE);
    const taskId = "watch-quiz-video-01";
    seedSuccessVideoTask(creatorUserId, interview.id, taskId);

    const gen = await fetch(`${base}/api/campaigns/quiz-questions/generate`, {
      method: "POST",
      headers: authHeader(creatorToken),
      body: JSON.stringify({ interviewId: interview.id, taskId }),
    });
    const genBody = (await gen.json()) as { questions?: Array<{ question?: string; referenceAnswer?: string }> };

    await fetch(`${base}/api/wallet/recharge/mock`, {
      method: "POST",
      headers: authHeader(creatorToken),
      body: JSON.stringify({ amount: 500 }),
    });

    const create = await fetch(`${base}/api/campaigns/plans`, {
      method: "POST",
      headers: authHeader(creatorToken),
      body: JSON.stringify({
        endYear: currentYear,
        totalPointsBudget: 400,
        interviewId: interview.id,
        taskId,
        questions: (genBody.questions ?? []).slice(0, 2).map((q) => ({
          question: q.question!,
          referenceAnswer: q.referenceAnswer!,
        })),
      }),
    });
    const planBody = (await create.json()) as { publishedVideo?: { publishId?: string }; planId?: string };
    const publishId = planBody.publishedVideo?.publishId ?? "";
    const planId = planBody.planId ?? "";
    check("creator publish plan", create.status === 201 && Boolean(publishId), planBody);
    watchDispatch.seedAssignment(viewerUserId, planId, publishId);

    console.log("\n=== 观众答题 ===");
    const viewerToken = await smsLogin(base, viewerPhone);

    const ownerStart = await fetch(`${base}/api/watch/${publishId}/quiz/start`, {
      method: "POST",
      headers: authHeader(creatorToken),
    });
    check("creator cannot quiz own video → 403", ownerStart.status === 403);

    const start = await fetch(`${base}/api/watch/${publishId}/quiz/start`, {
      method: "POST",
      headers: authHeader(viewerToken),
    });
    const startBody = (await start.json()) as {
      sessionStatus?: string;
      totalQuestions?: number;
      currentQuestion?: { text?: string };
    };
    check("POST /quiz/start → 200", start.status === 200 && startBody.sessionStatus === "in_progress", startBody);
    check("session has questions", (startBody.totalQuestions ?? 0) >= 1, startBody.totalQuestions);

    const balanceBefore = await fetch(`${base}/api/wallet/balance`, { headers: authHeader(viewerToken) });
    const balanceBeforeBody = (await balanceBefore.json()) as { balance?: number };

    const submit = await fetch(`${base}/api/watch/${publishId}/quiz/submit`, {
      method: "POST",
      headers: authHeader(viewerToken),
      body: JSON.stringify({ answer: "江南水乡" }),
    });
    const submitBody = (await submit.json()) as {
      correct?: boolean;
      pointsAwarded?: number;
      earnedPointsTotal?: number;
      sessionStatus?: string;
    };
    check("POST /quiz/submit → 200", submit.status === 200, submitBody);
    check("stub grades correct", submitBody.correct === true, submitBody);
    check("pending 2 points on correct", submitBody.pointsAwarded === 2, submitBody);

    const balanceAfterSubmit = await fetch(`${base}/api/wallet/balance`, { headers: authHeader(viewerToken) });
    const balanceAfterSubmitBody = (await balanceAfterSubmit.json()) as { balance?: number };
    check(
      "wallet unchanged before day settlement",
      (balanceAfterSubmitBody.balance ?? 0) === (balanceBeforeBody.balance ?? 0),
      { before: balanceBeforeBody.balance, afterSubmit: balanceAfterSubmitBody.balance },
    );

    const current = await fetch(`${base}/api/watch/${publishId}/quiz/current`, {
      headers: authHeader(viewerToken),
    });
    const currentBody = (await current.json()) as { earnedPoints?: number; messages?: unknown[] };
    check("GET /quiz/current → 200", current.status === 200, currentBody);
    check("earned points tracked", (currentBody.earnedPoints ?? 0) >= 2, currentBody.earnedPoints);

    const restart = await fetch(`${base}/api/watch/${publishId}/quiz/start`, {
      method: "POST",
      headers: authHeader(viewerToken),
    });
    const restartBody = (await restart.json()) as { earnedPoints?: number };
    check("restart returns same session", restart.status === 200 && (restartBody.earnedPoints ?? 0) >= 2, restartBody);

    const submit2 = await fetch(`${base}/api/watch/${publishId}/quiz/submit`, {
      method: "POST",
      headers: authHeader(viewerToken),
      body: JSON.stringify({ answer: "1965" }),
    });
    const submit2Body = (await submit2.json()) as { sessionStatus?: string };
    check("second submit completes session", submit2.status === 200 && submit2Body.sessionStatus === "completed", submit2Body);

    const today = localDistributionDate();
    const assignment = db
      .prepare(
        `SELECT status FROM watch_task_assignments
         WHERE publish_id = ? AND viewer_user_id = ? AND distribution_date = ? LIMIT 1`,
      )
      .get(publishId, viewerUserId, today) as { status?: string } | undefined;
    check("assignment marked completed after quiz", assignment?.status === "completed", assignment);

    console.log("\n=== 23 点日终发奖 ===");
    const rewardSettlement = new WatchRewardSettlementService(db, walletService);
    const paid = rewardSettlement.settleForDistributionDate(today);
    check("day settlement pays rewards", paid.totalPoints >= 2, paid);

    const balanceAfterSettle = await fetch(`${base}/api/wallet/balance`, { headers: authHeader(viewerToken) });
    const balanceAfterSettleBody = (await balanceAfterSettle.json()) as { balance?: number };
    check(
      "viewer wallet credited after settlement",
      (balanceAfterSettleBody.balance ?? 0) === paid.totalPoints,
      { paid: paid.totalPoints, balance: balanceAfterSettleBody.balance },
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  if (failed > 0) {
    console.error(`\ntest:watch-quiz FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:watch-quiz OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
