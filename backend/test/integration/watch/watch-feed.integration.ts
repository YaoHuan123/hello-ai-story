/**
 * 观看 Feed：创作者发布 → 其他用户可见、可播。
 *
 * 运行：`npm run build && npm run test:watch`
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { Server } from "node:http";
import { createApp } from "../../../dist/app.js";
import { initDb } from "../../../dist/db/init.js";
import { CampaignPlanService } from "../../../dist/campaign/campaignPlan.service.js";
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
    const { phone: creatorPhone, userId: creatorUserId } = registerTestPhoneUser(db, "watch-creator");
    const { phone: viewerPhone, userId: viewerUserId } = registerTestPhoneUser(db, "watch-viewer");
    const creatorToken = await smsLogin(base, creatorPhone);

    const interview = createInterview(creatorUserId, { title: "观看测试故事" });
    seedCommittedSections({ userId: creatorUserId, interviewId: interview.id }, FIXTURE);
    const taskId = "watch-feed-video-01";
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
    const planBody = (await create.json()) as { planId?: string; publishedVideo?: { publishId?: string } };
    const publishId = planBody.publishedVideo?.publishId ?? "";
    const planId = planBody.planId ?? "";
    check("creator publish plan", create.status === 201 && Boolean(publishId), planBody);
    watchDispatch.seedAssignment(viewerUserId, planId, publishId);

    console.log("\n=== 创作者 Feed 不含自己 ===");
    const creatorFeed = await fetch(`${base}/api/watch/feed`, { headers: authHeader(creatorToken) });
    const creatorFeedBody = (await creatorFeed.json()) as { items?: Array<{ publishId?: string }> };
    check("creator feed excludes own video", !creatorFeedBody.items?.some((i) => i.publishId === publishId), creatorFeedBody.items);
    const creatorDetail = await fetch(`${base}/api/watch/${publishId}`, { headers: authHeader(creatorToken) });
    check("creator cannot GET own watch detail → 404", creatorDetail.status === 404);

    console.log("\n=== 观众 Feed ===");
    const viewerToken = await smsLogin(base, viewerPhone);

    const feed = await fetch(`${base}/api/watch/feed`, { headers: authHeader(viewerToken) });
    const feedBody = (await feed.json()) as { items?: Array<{ publishId?: string }> };
    check("GET /watch/feed → 200", feed.status === 200 && (feedBody.items?.length ?? 0) >= 1, feedBody);
    check("feed contains publishId", feedBody.items?.some((i) => i.publishId === publishId), feedBody.items?.[0]);

    const detail = await fetch(`${base}/api/watch/${publishId}`, { headers: authHeader(viewerToken) });
    check("GET /watch/:id → 200", detail.status === 200);

    console.log("\n=== 媒体 ===");
    const cover = await fetch(`${base}/api/watch/${publishId}/cover?token=${encodeURIComponent(viewerToken)}`);
    check("GET /watch/:id/cover", cover.status === 200 || cover.status === 404, cover.status);

    const video = await fetch(`${base}/api/watch/${publishId}/video`, { headers: authHeader(viewerToken) });
    check("GET /watch/:id/video → 200", video.status === 200, video.status);

    console.log("\n=== 未登录 ===");
    const noAuth = await fetch(`${base}/api/watch/feed`);
    check("feed without token → 401", noAuth.status === 401);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  if (failed > 0) {
    console.error(`\ntest:watch FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:watch OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
