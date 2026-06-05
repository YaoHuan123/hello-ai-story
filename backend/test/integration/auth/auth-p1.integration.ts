/**
 * P1 鉴权验收：换绑手机号、删号、token_version 撤销（mock 短信 123456）。
 *
 * 运行：`npm run build && npm run test:auth:p1`
 */
import fs from "node:fs";
import jwt from "jsonwebtoken";
import { config as loadEnv } from "dotenv";
import type { Server } from "node:http";
import { createApp } from "../../../dist/app.js";
import { JWT_EXPIRES_IN, JWT_SECRET } from "../../../dist/config.js";
import { initDb } from "../../../dist/db/init.js";
import { getUserRootDir } from "../../../dist/services/workspace.service.js";
import { AuthService } from "../../../dist/services/auth/auth.service.js";
import { AliyunSmsService, ALIYUN_SMS_DEV_MOCK_CODE } from "../../../dist/services/auth/aliyunSms.service.js";
import { AuthAuditLogService } from "../../../dist/services/auth/authAuditLog.service.js";
import { SmsRateLimitService } from "../../../dist/services/auth/smsRateLimit.service.js";

loadEnv();
process.env.ALIYUN_DYPNSAPI_DEV_MOCK = "1";

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

function uniquePhone(suffix: string): string {
  const tail = String(Date.now()).slice(-7) + suffix.padStart(3, "0");
  return `138${tail.slice(-8)}`;
}

async function smsLogin(base: string, phone: string): Promise<{ token: string; userId: string; phone: string }> {
  const res = await fetch(`${base}/api/auth/sms/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: MOCK_CODE }),
  });
  if (!res.ok) {
    throw new Error(`sms/login failed ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { token: string; userId: string; phone: string };
  return body;
}

async function main(): Promise<void> {
  const db = initDb();
  const authService = new AuthService(
    db,
    new AliyunSmsService(),
    new SmsRateLimitService(db),
    new AuthAuditLogService(db),
  );
  const app = createApp(db, authService);

  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s));
    s.on("error", reject);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    console.log("\n=== 登录 + GET /me ===");
    const phoneA = uniquePhone("1");
    const loginA = await smsLogin(base, phoneA);
    check("POST /sms/login → 200", Boolean(loginA.token && loginA.userId));

    const meRes = await fetch(`${base}/api/auth/me`, { headers: authHeader(loginA.token) });
    const meBody = (await meRes.json()) as { phone?: string; userId?: string };
    check("GET /me → 200", meRes.status === 200);
    check("GET /me phone matches", meBody.phone === phoneA, meBody);

    console.log("\n=== 换绑手机号 + token_version ===");
    const phoneB = uniquePhone("2");
    const changeRes = await fetch(`${base}/api/auth/phone`, {
      method: "PATCH",
      headers: authHeader(loginA.token),
      body: JSON.stringify({ newPhone: phoneB, oldCode: MOCK_CODE, newCode: MOCK_CODE }),
    });
    const changeBody = (await changeRes.json()) as { phone?: string; code?: string };
    check("PATCH /phone → 200", changeRes.status === 200, changeBody);
    check("PATCH /phone returns new phone", changeBody.phone === phoneB, changeBody);

    const tvRow = db
      .prepare("SELECT token_version FROM users WHERE id = ?")
      .get(loginA.userId) as { token_version?: number } | undefined;
    check("token_version bumped to 2", tvRow?.token_version === 2, tvRow);

    const oldTokenMe = await fetch(`${base}/api/auth/me`, { headers: authHeader(loginA.token) });
    const oldTokenBody = (await oldTokenMe.json()) as { code?: string };
    check("old token → 401 TOKEN_REVOKED", oldTokenMe.status === 401 && oldTokenBody.code === "TOKEN_REVOKED", oldTokenBody);

    const loginB = await smsLogin(base, phoneB);
    check("re-login with new phone", loginB.userId === loginA.userId && loginB.phone === phoneB, loginB);

    const meAfter = await fetch(`${base}/api/auth/me`, { headers: authHeader(loginB.token) });
    const meAfterBody = (await meAfter.json()) as { phone?: string };
    check("GET /me after change shows new phone", meAfterBody.phone === phoneB, meAfterBody);

    console.log("\n=== 换绑冲突 ===");
    const phoneC = uniquePhone("3");
    const loginC = await smsLogin(base, phoneC);
    const conflictRes = await fetch(`${base}/api/auth/phone`, {
      method: "PATCH",
      headers: authHeader(loginC.token),
      body: JSON.stringify({ newPhone: phoneB, oldCode: MOCK_CODE, newCode: MOCK_CODE }),
    });
    const conflictBody = (await conflictRes.json()) as { code?: string };
    check("PATCH /phone taken phone → 409", conflictRes.status === 409 && conflictBody.code === "PHONE_TAKEN", conflictBody);

    console.log("\n=== 删号 ===");
    const phoneD = uniquePhone("4");
    const loginD = await smsLogin(base, phoneD);
    const dataDir = getUserRootDir(loginD.userId);
    check("user workspace exists before delete", fs.existsSync(dataDir));

    const delRes = await fetch(`${base}/api/auth/me`, {
      method: "DELETE",
      headers: authHeader(loginD.token),
      body: JSON.stringify({ code: MOCK_CODE }),
    });
    const delBody = (await delRes.json()) as { ok?: boolean };
    check("DELETE /me → 200", delRes.status === 200 && delBody.ok === true, delBody);

    const userGone = db.prepare("SELECT id FROM users WHERE id = ?").get(loginD.userId);
    check("user row removed", userGone === undefined);

    const afterDelMe = await fetch(`${base}/api/auth/me`, { headers: authHeader(loginD.token) });
    check("token invalid after delete → 401", afterDelMe.status === 401);

    check("user workspace removed", !fs.existsSync(dataDir));

    console.log("\n=== 未登录 ===");
    const noAuth = await fetch(`${base}/api/auth/me`);
    check("GET /me without token → 401", noAuth.status === 401);

    const badTvToken = jwt.sign({ userId: loginA.userId, phone: phoneB, tv: 1 }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    });
    const staleTv = await fetch(`${base}/api/auth/me`, { headers: authHeader(badTvToken) });
    const staleBody = (await staleTv.json()) as { code?: string };
    check("stale tv in JWT → TOKEN_REVOKED", staleTv.status === 401 && staleBody.code === "TOKEN_REVOKED", staleBody);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  if (failed > 0) {
    console.error(`\ntest:auth:p1 FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:auth:p1 OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
