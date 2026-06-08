/**
 * Apple identityToken 验签（dev mock + 无效 token）。
 *
 * 运行：`npm run build && npm run test:auth:apple`
 */
import { config as loadEnv } from "dotenv";
import {
  APPLE_AUTH_DEV_MOCK_SUB,
  APPLE_AUTH_DEV_MOCK_TOKEN,
  verifyAppleIdentityToken,
} from "../../../dist/services/auth/appleAuth.service.js";

loadEnv();
process.env.APPLE_AUTH_DEV_MOCK = "1";
process.env.NODE_ENV = "development";

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

async function main(): Promise<void> {
  console.log("\n=== Apple auth dev mock ===");
  const identity = await verifyAppleIdentityToken(APPLE_AUTH_DEV_MOCK_TOKEN);
  check("dev mock token → sub", identity.sub === APPLE_AUTH_DEV_MOCK_SUB, identity);
  check("dev mock token → email", identity.email === "dev@example.com", identity);

  console.log("\n=== invalid token ===");
  process.env.APPLE_BUNDLE_ID = "com.test.app";
  let invalid = false;
  try {
    await verifyAppleIdentityToken("not-a-valid-jwt");
  } catch (error) {
    invalid = error instanceof Error && error.message === "APPLE_TOKEN_INVALID";
  }
  check("garbage token → APPLE_TOKEN_INVALID", invalid);

  if (failed > 0) {
    console.error(`\ntest:auth:apple FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:auth:apple OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
