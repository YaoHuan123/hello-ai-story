import type { DatabaseSync } from "node:sqlite";
import { createUserWorkspace } from "../../dist/services/workspace.service.js";
import { normalizePhoneE164 } from "../../dist/utils/phone.js";

/** 测试用户 id，统一 `test-` 前缀，便于识别与清理 data/users。 */
export function testUserId(label: string): string {
  const safe = label.replace(/[^a-zA-Z0-9-]/g, "-");
  return `test-${safe}-${Date.now()}`;
}

/** 若传入 id 未带 test- 前缀则自动补上。 */
export function ensureTestUserId(userId: string): string {
  return userId.startsWith("test-") ? userId : `test-${userId}`;
}

/** 测试用手机号（138000xxxxx 段，仅集成测试使用）。 */
export function testPhone(label = ""): string {
  const h = label.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 10;
  return `138000${String(Date.now()).slice(-4)}${h}`;
}

/** 预注册短信测试用户，登录时复用 test- 前缀 userId。 */
export function registerTestPhoneUser(
  db: DatabaseSync,
  label: string,
): { userId: string; phone: string; phoneCanonical: string } {
  const userId = testUserId(label);
  const phone = testPhone(label);
  const phoneCanonical = normalizePhoneE164(phone);
  if (!phoneCanonical) {
    throw new Error(`invalid test phone: ${phone}`);
  }
  const dataDir = createUserWorkspace(userId);
  db.prepare(
    "INSERT INTO users (id, phone, data_dir, login_method, token_version) VALUES (?, ?, ?, 'phone', 1)",
  ).run(userId, phoneCanonical, dataDir);
  return { userId, phone, phoneCanonical };
}

/** 预注册 Apple 测试用户（dev mock sub）。 */
export function registerTestAppleUser(
  db: DatabaseSync,
  label: string,
  appleSub: string,
  email?: string,
): string {
  const userId = testUserId(label);
  const dataDir = createUserWorkspace(userId);
  db.prepare(
    "INSERT INTO users (id, apple_sub, apple_email, data_dir, login_method, token_version) VALUES (?, ?, ?, ?, 'apple', 1)",
  ).run(userId, appleSub, email ?? null, dataDir);
  return userId;
}
