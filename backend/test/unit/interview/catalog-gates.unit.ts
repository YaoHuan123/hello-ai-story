/**
 * Tier3～8 解锁门槛：Gate1（Tier1 耗尽）+ Gate2（Tier2 跳过）。
 *
 * 运行：`npm run test:interview:catalog-gates`
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { setupUserWithInterview } from "../../fixtures/interviewScope";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { stubSections } from "../../fixtures/sections.stub";
import {
  canEnterAdvancedTiers,
  readCatalogGates,
  seedCatalogGates,
} from "../../../src/services/catalogGates.service";
import {
  advanceStageWithGates,
  getCurrentStage,
  writeCurrentStage,
} from "../../../src/services/topicSelection.service";
import { writePending } from "../../../src/topic/tierPending";
import {
  SELECT_TOPIC_KEY,
  commitTopic,
  getCurrentQuestion,
  submit,
} from "../../../src/services/interviewOrchestrator.service";
import { initQuestion } from "../../../src/services/questionEngine.service";
import { appendAnswer } from "../../../src/question/topicPersist";
import { getTopicQuestions } from "../../../src/services/topicSelection.service";

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

function writePendingFile(
  scope: ReturnType<typeof setupUserWithInterview>,
  tier: 1 | 2 | 3,
  title: string,
): void {
  writePending(
    scope,
    {
      tier,
      createdAt: new Date().toISOString(),
      picks: [{ pick: { tier, kind: "catalog", title, reason: "test" } }],
    },
    (p, d) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(d, null, 2), "utf-8");
    },
  );
}

async function main(): Promise<void> {
  console.log("\n=== canEnterAdvancedTiers ===");
  const scopeGates = setupUserWithInterview(`catalog-gates-flags-${Date.now()}`);
  check("默认未解锁", canEnterAdvancedTiers(scopeGates) === false);
  seedCatalogGates(scopeGates, { tier1Exhausted: true, tier2Skipped: false });
  check("仅 gate1 不足", canEnterAdvancedTiers(scopeGates) === false);
  seedCatalogGates(scopeGates, { tier1Exhausted: false, tier2Skipped: true });
  check("仅 gate2 不足", canEnterAdvancedTiers(scopeGates) === false);
  seedCatalogGates(scopeGates, { tier1Exhausted: true, tier2Skipped: true });
  check("gate1+gate2 解锁", canEnterAdvancedTiers(scopeGates) === true);
  seedCatalogGates(scopeGates, {
    tier1Exhausted: false,
    tier2Skipped: true,
    catalogLoopEscaped: true,
  });
  check("catalogLoopEscaped + gate2 解锁（无 gate1）", canEnterAdvancedTiers(scopeGates) === true);

  console.log("\n=== advanceStageWithGates：Tier2 未解锁 → Tier1 ===");
  const scopeAdv1 = setupUserWithInterview(`catalog-gates-adv1-${Date.now()}`);
  writeCurrentStage(scopeAdv1, 2);
  check("tier2 advance 无门槛 → tier1", advanceStageWithGates(scopeAdv1).tier === 1);

  console.log("\n=== advanceStageWithGates：Tier2 已解锁 → Tier3 ===");
  const scopeAdv2 = setupUserWithInterview(`catalog-gates-adv2-${Date.now()}`);
  seedCatalogGates(scopeAdv2, { tier1Exhausted: true, tier2Skipped: true });
  writeCurrentStage(scopeAdv2, 2);
  check("tier2 advance 已解锁 → tier3", advanceStageWithGates(scopeAdv2).tier === 3);

  console.log("\n=== submit：Tier2 跳过，gate1 未满足 → 回到 Tier1 ===");
  const scopeSkip1 = setupUserWithInterview(`catalog-gates-skip1-${Date.now()}`);
  seedCommittedSections(scopeSkip1, stubSections());
  seedCatalogGates(scopeSkip1, { tier1Exhausted: false, tier2Skipped: false });
  writeCurrentStage(scopeSkip1, 2);
  await submit(scopeSkip1, { key: SELECT_TOPIC_KEY, value: "", skip: true });
  check("skip 后 tier1", getCurrentStage(scopeSkip1).tier === 1);
  check("gate2 已标记", readCatalogGates(scopeSkip1).tier2Skipped === true);
  check("gate1 仍未满足", readCatalogGates(scopeSkip1).tier1Exhausted === false);
  check("仍未解锁 advanced", canEnterAdvancedTiers(scopeSkip1) === false);

  console.log("\n=== submit：Tier2 跳过，gate1+gate2 → Tier3 ===");
  const scopeSkip2 = setupUserWithInterview(`catalog-gates-skip2-${Date.now()}`);
  seedCommittedSections(scopeSkip2, stubSections());
  seedCatalogGates(scopeSkip2, { tier1Exhausted: true, tier2Skipped: false });
  writeCurrentStage(scopeSkip2, 2);
  await submit(scopeSkip2, { key: SELECT_TOPIC_KEY, value: "", skip: true });
  check("skip 后 tier3", getCurrentStage(scopeSkip2).tier === 3);
  check("已解锁", canEnterAdvancedTiers(scopeSkip2) === true);

  console.log("\n=== commitTopic：Tier2 点选答完 → Tier1（不进 Tier3）===");
  const scopeCommit = setupUserWithInterview(`catalog-gates-commit-${Date.now()}`);
  seedCommittedSections(scopeCommit, stubSections());
  writeCurrentStage(scopeCommit, 2);
  writePendingFile(scopeCommit, 2, "Elementary school");
  const qs = getTopicQuestions(scopeCommit, "Elementary school");
  initQuestion(scopeCommit, qs);
  appendAnswer(scopeCommit, {
    key: qs.questions[0]!,
    questionText: qs.questions[0]!,
    answer: "test answer",
  });
  commitTopic(scopeCommit);
  check("tier2 答完 → tier1", getCurrentStage(scopeCommit).tier === 1, getCurrentStage(scopeCommit));
  check("未标记 gate2", readCatalogGates(scopeCommit).tier2Skipped === false);

  console.log("\n=== pendingWithAutoPromote：Tier3 未解锁 → 重置 Tier1 ===");
  const scopePromote = setupUserWithInterview(`catalog-gates-promote-${Date.now()}`);
  seedCommittedSections(scopePromote, stubSections());
  writeCurrentStage(scopePromote, 3);
  const qPromote = await getCurrentQuestion(scopePromote);
  check("未解锁时 tier3 读题回落 catalog", getCurrentStage(scopePromote).tier === 1);
  check("返回 catalog 选题", qPromote.type === "topic", qPromote);

  console.log("\n=== 各档选题 skippable ===");
  for (const tier of [1, 2, 3] as const) {
    const scopeSkippable = setupUserWithInterview(`catalog-gates-skippable-t${tier}-${Date.now()}`);
    seedCommittedSections(scopeSkippable, stubSections());
    if (tier === 3) {
      seedCatalogGates(scopeSkippable, { tier1Exhausted: true, tier2Skipped: true });
    }
    writeCurrentStage(scopeSkippable, tier);
    if (tier === 3) {
      writePending(
        scopeSkippable,
        {
          tier: 3,
          createdAt: new Date().toISOString(),
          picks: [
            {
              pick: { tier: 3, kind: "generated", title: "Childhood fun", reason: "test" },
              questions: ["What was fun?"],
            },
          ],
        },
        (p, d) => {
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, JSON.stringify(d, null, 2), "utf-8");
        },
      );
    } else {
      writePendingFile(scopeSkippable, tier, "Elementary school");
    }
    const q = await getCurrentQuestion(scopeSkippable);
    check(`tier${tier} 选题 skippable`, q.skippable === true, q);
  }

  console.log("\n=== submit：Tier3 跳过 → Tier4 ===");
  const scopeSkipT3 = setupUserWithInterview(`catalog-gates-skip-t3-${Date.now()}`);
  seedCommittedSections(scopeSkipT3, stubSections());
  seedCatalogGates(scopeSkipT3, { tier1Exhausted: true, tier2Skipped: true });
  writeCurrentStage(scopeSkipT3, 3);
  writePending(
    scopeSkipT3,
    {
      tier: 3,
      createdAt: new Date().toISOString(),
      picks: [
        {
          pick: { tier: 3, kind: "generated", title: "Skip me", reason: "test" },
          questions: ["Q?"],
        },
      ],
    },
    (p, d) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(d, null, 2), "utf-8");
    },
  );
  await submit(scopeSkipT3, { key: SELECT_TOPIC_KEY, value: "", skip: true });
  check("tier3 skip → tier4", getCurrentStage(scopeSkipT3).tier === 4);
  check("tier3 skip 不标记 gate2", readCatalogGates(scopeSkipT3).tier2Skipped === true);

  console.log("\n=== submit：Tier1/2 连续 4 次跳过 → Tier3 逃出（无 gate1）===");
  const scopeEscape = setupUserWithInterview(`catalog-gates-escape-${Date.now()}`);
  seedCommittedSections(scopeEscape, stubSections());
  seedCatalogGates(scopeEscape, { tier1Exhausted: false, tier2Skipped: false });
  writeCurrentStage(scopeEscape, 1);
  writePendingFile(scopeEscape, 1, "Elementary school");
  await submit(scopeEscape, { key: SELECT_TOPIC_KEY, value: "", skip: true });
  check("skip1 → tier2", getCurrentStage(scopeEscape).tier === 2);
  writePendingFile(scopeEscape, 2, "Middle school");
  await submit(scopeEscape, { key: SELECT_TOPIC_KEY, value: "", skip: true });
  check("skip2 → tier1", getCurrentStage(scopeEscape).tier === 1);
  writePendingFile(scopeEscape, 1, "Elementary school");
  await submit(scopeEscape, { key: SELECT_TOPIC_KEY, value: "", skip: true });
  check("skip3 → tier2", getCurrentStage(scopeEscape).tier === 2);
  writePendingFile(scopeEscape, 2, "High school");
  await submit(scopeEscape, { key: SELECT_TOPIC_KEY, value: "", skip: true });
  const gatesEscape = readCatalogGates(scopeEscape);
  check("skip4 → tier3", getCurrentStage(scopeEscape).tier === 3);
  check("catalogLoopEscaped", gatesEscape.catalogLoopEscaped === true);
  check("gate1 仍未耗尽", gatesEscape.tier1Exhausted === false);
  check("gate2 已标记", gatesEscape.tier2Skipped === true);
  check("逃出后 advanced 解锁", canEnterAdvancedTiers(scopeEscape) === true);
  check("streak 归零", gatesEscape.consecutiveCatalogSkips === 0);

  console.log("\n=== submit：3 次跳过后点选 → streak 归零 ===");
  const scopeReset = setupUserWithInterview(`catalog-gates-streak-reset-${Date.now()}`);
  seedCommittedSections(scopeReset, stubSections());
  seedCatalogGates(scopeReset, { tier1Exhausted: false, tier2Skipped: false });
  writeCurrentStage(scopeReset, 1);
  writePendingFile(scopeReset, 1, "Elementary school");
  await submit(scopeReset, { key: SELECT_TOPIC_KEY, value: "", skip: true });
  writePendingFile(scopeReset, 2, "Middle school");
  await submit(scopeReset, { key: SELECT_TOPIC_KEY, value: "", skip: true });
  writePendingFile(scopeReset, 1, "Elementary school");
  await submit(scopeReset, { key: SELECT_TOPIC_KEY, value: "", skip: true });
  check("3 次跳过后 streak=3", readCatalogGates(scopeReset).consecutiveCatalogSkips === 3);
  writePendingFile(scopeReset, 2, "Elementary school");
  await submit(scopeReset, {
    key: SELECT_TOPIC_KEY,
    value: "Elementary school",
    skip: false,
  });
  check("点选后 streak 归零", readCatalogGates(scopeReset).consecutiveCatalogSkips === 0);

  const scopeStreakAgain = setupUserWithInterview(`catalog-gates-streak-again-${Date.now()}`);
  seedCommittedSections(scopeStreakAgain, stubSections());
  writeCurrentStage(scopeStreakAgain, 1);
  writePendingFile(scopeStreakAgain, 1, "Elementary school");
  await submit(scopeStreakAgain, { key: SELECT_TOPIC_KEY, value: "", skip: true });
  check("新轮首次跳过 streak=1", readCatalogGates(scopeStreakAgain).consecutiveCatalogSkips === 1);

  if (failed > 0) {
    console.error(`\ntest:interview:catalog-gates FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:interview:catalog-gates OK (${passed} checks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
