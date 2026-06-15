/**
 * 鲁迅生平数据 · 选题器一轮集成测试（真实 LLM）。
 *
 * 使用公开史料整理的 {@link luxunSections}，按 tier 1→2→3→4 各调用一次
 * `getPendingTopics`，并抽样验证 `getTopicQuestions` 与阶段推进。
 *
 * 运行：`npm run test:topic:luxun`
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { setupUserWithInterview } from "../../fixtures/interviewScope";
import { getInterviewRootDir } from "../../../src/services/interviewWorkspace.service";

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

const TEST_USER = `topic-luxun-${Date.now()}`;

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，鲁迅生平集成测试需真实 LLM。");
    process.exit(0);
  }

  const { luxunSections } = await import("../../fixtures/sections.luxun");
  const {
    getCurrentStage,
    advanceStage,
    getPendingTopics,
    getTopicQuestions,
    readPendingSelection,
    writeCurrentStage,
  } = await import("../../../src/services/topicSelection.service");

  const sections = luxunSections();
  const scope = setupUserWithInterview(TEST_USER);
  writeCurrentStage(scope, 1);

  const selectionDir = path.join(getInterviewRootDir(scope), "选题");
  console.log("\n=== 被试资料：鲁迅（节选 sections）===");
  console.log(JSON.stringify(sections, null, 2));

  const tiers = [1, 2, 3, 4] as const;

  for (const expectTier of tiers) {
    console.log(`\n=== Tier${expectTier}：getPendingTopics ===`);
    const stage = getCurrentStage(scope);
    check(`当前阶段为 tier${expectTier}`, stage.tier === expectTier, stage);

    const picks = await getPendingTopics(scope, sections);
    console.log("  picks:", JSON.stringify(picks, null, 2));

    check(`tier${expectTier} 返回数组`, Array.isArray(picks), picks);
    const pending = readPendingSelection(scope, expectTier);
    check(`tier${expectTier}.json tier 一致`, pending?.tier === expectTier, pending);

    if (expectTier === 1) {
      check("tier1 至多 1 条", picks.length <= 1, picks.length);
    } else if (expectTier === 2) {
      check("tier2 至多 6 条", picks.length <= 6, picks.length);
    } else if (expectTier === 3) {
      check("tier3 至多 6 条", picks.length <= 6, picks.length);
    } else {
      check("tier4 至多 6 条", picks.length <= 6, picks.length);
    }

    if (picks.length > 0) {
      const first = picks[0];
      check("首条含 title/reason/kind", Boolean(first.title && first.reason && first.kind), first);
      check("首条 tier 与档位一致", first.tier === expectTier, first);

      const qs = getTopicQuestions(scope, first.title);
      console.log("  questions:", JSON.stringify(qs, null, 2));
      check("QuestionSet.title 一致", qs.title === first.title, qs);
      check("QuestionSet.kind 一致", qs.kind === first.kind, qs);
      check("questions 非空或 catalog 允许空字段列表", Array.isArray(qs.questions), qs);

      const row = pending?.picks.find((r) => r.pick.title === first.title);
      if (first.kind === "generated") {
        check("generated pending 含 questions", (row?.questions?.length ?? 0) > 0, row);
      }
      if (first.kind === "hot_topic" && (row?.suggestedAnswers?.length ?? 0) > 0) {
        check("hot_topic 带出 suggestedAnswers", (qs.suggestedAnswers?.length ?? 0) > 0, qs);
      }
    } else {
      console.warn(`  [warn] tier${expectTier} 无候选，跳过取题断言`);
    }

    if (expectTier < 4) {
      const next = advanceStage(scope);
      check(`advance → tier${expectTier + 1}`, next.tier === expectTier + 1, next);
    }
  }

  console.log("\n=== 持久化 ===");
  const fs = await import("node:fs");
  check("选题目录存在", fs.existsSync(selectionDir));
  check("current-stage.json 存在", fs.existsSync(path.join(selectionDir, "current-stage.json")));
  check("pending.json 存在", fs.existsSync(path.join(selectionDir, "pending.json")));
  check("无 pending-selection.json", !fs.existsSync(path.join(selectionDir, "pending-selection.json")));
  check("末档应为 tier4", getCurrentStage(scope).tier === 4);

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
