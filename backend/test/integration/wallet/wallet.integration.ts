/**
 * 钱包 mock 充值、余额、流水。
 *
 * 运行：`npm run build && npm run test:wallet`
 */
import { config as loadEnv } from "dotenv";
import type { Server } from "node:http";
import { createApp } from "../../../dist/app.js";
import { initDb } from "../../../dist/db/init.js";
import { AuthService } from "../../../dist/services/auth/auth.service.js";
import { AliyunSmsService, ALIYUN_SMS_DEV_MOCK_CODE } from "../../../dist/services/auth/aliyunSms.service.js";
import { AuthAuditLogService } from "../../../dist/services/auth/authAuditLog.service.js";
import { SmsRateLimitService } from "../../../dist/services/auth/smsRateLimit.service.js";
import { normalizePhoneE164 } from "../../../dist/utils/phone.js";
import { WalletService } from "../../../dist/wallet/wallet.service.js";
import { CampaignPlanService } from "../../../dist/campaign/campaignPlan.service.js";
import { PlanPortionService } from "../../../dist/campaign/planPortion.service.js";
import { PublishedVideoService } from "../../../dist/campaign/publishedVideo.service.js";
import { QuizQuestionService } from "../../../dist/campaign/quizQuestion.service.js";
import { registerTestPhoneUser } from "../../helpers/testAccount";

loadEnv();
process.env.ALIYUN_DYPNSAPI_DEV_MOCK = "1";
process.env.WALLET_MOCK_RECHARGE = "1";
process.env.NODE_ENV = "development";

const MOCK_CODE = ALIYUN_SMS_DEV_MOCK_CODE;

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

async function main(): Promise<void> {
  const db = initDb();
  const authService = new AuthService(
    db,
    new AliyunSmsService(),
    new SmsRateLimitService(db),
    new AuthAuditLogService(db),
  );
  const walletService = new WalletService(db);
  const publishedVideoService = new PublishedVideoService(db);
  const planPortionService = new PlanPortionService(db, walletService);
  const campaignPlanService = new CampaignPlanService(db, publishedVideoService, planPortionService);
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
    const { phone, userId: registeredUserId } = registerTestPhoneUser(db, "wallet");
    const loginRes = await fetch(`${base}/api/auth/sms/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code: MOCK_CODE }),
    });
    const loginBody = (await loginRes.json()) as { token?: string; userId?: string };
    check(
      "sms login",
      loginRes.status === 200 && Boolean(loginBody.token) && loginBody.userId === registeredUserId,
      loginBody,
    );
    const token = loginBody.token!;

    console.log("\n=== 初始余额 ===");
    const bal0 = await fetch(`${base}/api/wallet/balance`, { headers: authHeader(token) });
    const bal0Body = (await bal0.json()) as { balance?: number };
    check("GET /balance → 0", bal0.status === 200 && bal0Body.balance === 0, bal0Body);

    console.log("\n=== mock 充值 ===");
    const topup = await fetch(`${base}/api/wallet/recharge/mock`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ amount: 500 }),
    });
    const topupBody = (await topup.json()) as { ok?: boolean; balance?: number };
    check("POST /recharge/mock → 200", topup.status === 200 && topupBody.balance === 500, topupBody);

    const topup2 = await fetch(`${base}/api/wallet/recharge/mock`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ amount: 200 }),
    });
    const topup2Body = (await topup2.json()) as { balance?: number };
    check("second recharge → 700", topup2.status === 200 && topup2Body.balance === 700, topup2Body);

    console.log("\n=== 流水 ===");
    const tx = await fetch(`${base}/api/wallet/transactions`, { headers: authHeader(token) });
    const txBody = (await tx.json()) as { items?: Array<{ type?: string; amount?: number }> };
    check("GET /transactions ≥ 2", tx.status === 200 && (txBody.items?.length ?? 0) >= 2, txBody);
    check(
      "latest tx mock_recharge +200",
      txBody.items?.[0]?.type === "mock_recharge" && txBody.items[0]?.amount === 200,
      txBody.items?.[0],
    );

    console.log("\n=== health wallet flag ===");
    const health = await fetch(`${base}/api/health`);
    const healthBody = (await health.json()) as { wallet?: { mockRechargeEnabled?: boolean } };
    check("health mockRechargeEnabled", healthBody.wallet?.mockRechargeEnabled === true, healthBody.wallet);

    console.log("\n=== 未登录 ===");
    const noAuth = await fetch(`${base}/api/wallet/balance`);
    check("GET /balance without token → 401", noAuth.status === 401);

    void normalizePhoneE164(phone);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  if (failed > 0) {
    console.error(`\ntest:wallet FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:wallet OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
