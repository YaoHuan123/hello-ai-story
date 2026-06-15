/**
 * Tier5 矛盾选题集成测试（真实 LLM）。
 *
 * 使用 `luxunSections()`，验证 sections → tier5.json → getPendingTopics → getTopicQuestions。
 *
 * 运行：`npm run test:topic:tier5`
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

const TEST_USER = `topic-tier5-${Date.now()}`;

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，tier5 集成测试需真实 LLM。");
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
  writeCurrentStage(scope, 5);

  console.log("\n=== Tier5：sections → pending.json + getPendingTopics ===");
  const picks = await getPendingTopics(scope, sections);
  console.log("  picks:", JSON.stringify(picks, null, 2));

  check("pending.json 已生成", fs.existsSync(pendingPath(scope)));
  check("返回数组", Array.isArray(picks), picks);

  const pending = readPending(scope, 5);
  check("tier pending.tier === 5", pending?.tier === 5, pending);

  if (picks.length > 0) {
    const first = picks[0];
    const row = pending?.picks.find((r) => r.pick.title === first.title);
    check("kind 为 material_contradiction", first.kind === "material_contradiction", first);
    check("无 contradictionId", !("contradictionId" in first), first);
    check("无 involvedIds", !("involvedIds" in first), first);
    check("接口1 不返回 questions", !("questions" in first), first);
    check("pending row questions 非空", (row?.questions?.length ?? 0) >= 1, row);

    const qText = row!.questions![0];
    check("题目为短问句", qText.length <= 200 && !qText.includes("Briefly explain"), qText);
    check("题目不含节摘录块", !sections.some((s) => s.name && qText.includes(`[${s.name}]`)), qText);
    check(
      "题目像口语问句",
      qText.includes("?") || qText.startsWith("Please clarify"),
      qText,
    );

    const qs = getTopicQuestions(scope, first.title);
    console.log("  questions length:", qs.questions[0]?.length);
    check("接口2 复用 row.questions", qs.questions[0] === row!.questions![0], qs);
    check("tier 为 5", qs.tier === 5, qs);
  } else {
    console.warn("  [warn] 模型未检出矛盾，跳过取题断言");
  }

  console.log("\n=== advance 5→6 ===");
  const next = advanceStage(scope);
  check("进入 tier6", next.tier === 6, next);

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
