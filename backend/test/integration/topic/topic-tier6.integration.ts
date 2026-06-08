/**
 * Tier6 缺口选题集成测试（真实 LLM）。
 *
 * 使用 `luxunSections()`，验证 sections → tier6.json → getPendingTopics → getTopicQuestions。
 *
 * 运行：`npm run test:topic:tier6`
 */
import { config as loadEnv } from "dotenv";
import { setupUserWithInterview } from "../../fixtures/interviewScope";
import { testUserId } from "../../helpers/testAccount";

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

const TEST_USER = testUserId("topic-tier6");

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，tier6 集成测试需真实 LLM。");
    process.exit(0);
  }

  const fs = await import("node:fs");
  const { luxunSections } = await import("../../fixtures/sections.luxun");
  const { pendingPath, readPending } = await import("../../../src/topic/tierPending");
  const {
    writeCurrentStage,
    getPendingTopics,
    getTopicQuestions,
    advanceStage,
  } = await import("../../../src/services/topicSelection.service");

  const sections = luxunSections();
  const scope = setupUserWithInterview(TEST_USER);
  writeCurrentStage(scope, 6);

  console.log("\n=== Tier6：sections → pending.json + getPendingTopics ===");
  const picks = await getPendingTopics(scope, sections);
  console.log("  picks:", JSON.stringify(picks, null, 2));

  check("pending.json 已生成", fs.existsSync(pendingPath(scope)));
  check("返回数组", Array.isArray(picks), picks);

  const pending = readPending(scope, 6);
  check("tier pending.tier === 6", pending?.tier === 6, pending);

  if (picks.length > 0) {
    const first = picks[0];
    check("kind 为 material_gap", first.kind === "material_gap", first);
    check("无 gapIndex", !("gapIndex" in first), first);
    check("title 非空", typeof first.title === "string" && first.title.length > 0, first);

    const qs = getTopicQuestions(scope, first.title);
    console.log("  questions:", JSON.stringify(qs, null, 2));
    check("出题含补充句式", qs.questions[0]?.includes("可以补充的细节"), qs);
    check("tier 为 6", qs.tier === 6, qs);
    check("kind 为 material_gap", qs.kind === "material_gap", qs);
  } else {
    console.warn("  [warn] 模型未列出缺口，跳过取题断言");
  }

  console.log("\n=== advance 6→7 ===");
  const next = advanceStage(scope);
  check("进入 tier7", next.tier === 7, next);

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
