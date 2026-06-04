/**
 * Tier7 转折选题集成测试（真实 LLM）。
 *
 * 运行：`npm run test:topic:tier7`
 */
import { config as loadEnv } from "dotenv";
import { setupUserWithInterview } from "../../fixtures/interviewScope";

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

const TEST_USER = `topic-tier7-${Date.now()}`;

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，tier7 集成测试需真实 LLM。");
    process.exit(0);
  }

  const fs = await import("node:fs");
  const { luxunSections } = await import("../../fixtures/sections.luxun");
  const { tierPendingPath, readTierPending } = await import("../../../src/topic/tierPending");
  const {
    writeCurrentStage,
    getPendingTopics,
    getTopicQuestions,
    advanceStage,
  } = await import("../../../src/services/topicSelection.service");

  const sections = luxunSections();
  const scope = setupUserWithInterview(TEST_USER);
  writeCurrentStage(scope, 7);

  console.log("\n=== Tier7：sections → tier7.json + getPendingTopics ===");
  const picks = await getPendingTopics(scope, sections);
  console.log("  picks:", JSON.stringify(picks, null, 2));

  check("tier7.json 已生成", fs.existsSync(tierPendingPath(scope, 7)));
  check("返回数组", Array.isArray(picks), picks);
  check("tier pending.tier === 7", readTierPending(scope, 7)?.tier === 7);

  if (picks.length > 0) {
    const first = picks[0];
    check("kind 为 material_turn", first.kind === "material_turn", first);
    check("无 turnOrder", !("turnOrder" in first), first);
    check("无 presentScore", !("presentScore" in first), first);
    check("无 segmentIndex", !("segmentIndex" in first), first);
    check("reason 非空", typeof first.reason === "string" && first.reason.length > 0, first);

    const qs = getTopicQuestions(scope, first.title);
    console.log("  questions:", JSON.stringify(qs, null, 2));
    check("questions 为 [title]", qs.questions[0] === first.title, qs);
    check("含 suggestedAnswers（reason）", (qs.suggestedAnswers?.length ?? 0) >= 1, qs);
    check("tier 为 7", qs.tier === 7, qs);
  } else {
    console.warn("  [warn] 模型未列出转折，跳过取题断言");
  }

  console.log("\n=== advance 7→8 ===");
  check("进入 tier8", advanceStage(scope).tier === 8);

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
