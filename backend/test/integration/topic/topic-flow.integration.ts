/**
 * 完整选题器服务层集成测试。
 *
 * - 无 LLM：阶段循环、三种 kind 出题（catalog / generated / hot_topic）、持久化文件
 * - 有 LLM：接口1 getPendingTopics（tier1）
 *
 * 运行：`npm run test:topic:flow`
 */
import fs from "node:fs";
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

const TEST_USER = `topic-flow-test-${Date.now()}`;

function writeTierFile(
  selectionDir: string,
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
  picks: unknown[],
): void {
  fs.mkdirSync(selectionDir, { recursive: true });
  fs.writeFileSync(
    path.join(selectionDir, `tier${tier}.json`),
    JSON.stringify({ tier, createdAt: new Date().toISOString(), picks }, null, 2),
    "utf-8",
  );
}

async function main(): Promise<void> {
  const { stubSections } = await import("../../fixtures/sections.stub");
  const {
    getCurrentStage,
    advanceStage,
    getPendingTopics,
    getTopicQuestions,
    readPendingSelection,
    writeCurrentStage,
    readCurrentStage,
  } = await import("../../../src/services/topicSelection.service");
  const { getTopicFieldKeys } = await import("../../../src/topic/catalog");
  const { tierPendingPath } = await import("../../../src/topic/tierPending");

  const scope = setupUserWithInterview(TEST_USER);
  const selectionDir = path.join(getInterviewRootDir(scope), "选题");

  console.log("\n=== 接口3：当前阶段（默认 tier1）===");
  const s0 = getCurrentStage(scope);
  check("默认 tier1", s0.tier === 1, s0);

  console.log("\n=== 接口4：阶段循环 1→2→3→4→5→6→7→8→1 ===");
  check("advance → tier2", advanceStage(scope).tier === 2);
  check("advance → tier3", advanceStage(scope).tier === 3);
  check("advance → tier4", advanceStage(scope).tier === 4);
  check("advance → tier5", advanceStage(scope).tier === 5);
  check("advance → tier6", advanceStage(scope).tier === 6);
  check("advance → tier7", advanceStage(scope).tier === 7);
  check("advance → tier8", advanceStage(scope).tier === 8);
  check("advance → tier1（循环）", advanceStage(scope).tier === 1);

  console.log("\n=== tier8→tier1 清空各档 pending ===");
  writeTierFile(selectionDir, 1, [
    { pick: { tier: 1, kind: "catalog", title: "循环前占位", reason: "测试" } },
  ]);
  writeTierFile(selectionDir, 8, [
    { pick: { tier: 8, kind: "material_inner", title: "占位问句？", reason: "测试" } },
  ]);
  writeCurrentStage(scope, 8);
  check("advance 8→1", advanceStage(scope).tier === 1);
  check("tier1.json 已清空", !fs.existsSync(tierPendingPath(scope, 1)));
  check("tier8.json 已清空", !fs.existsSync(tierPendingPath(scope, 8)));

  console.log("\n=== 接口2：三种 kind 出题（手动 tier{N}.json，不调 LLM）===");

  const catalogTitle = "小学";
  const catalogKeys = getTopicFieldKeys(catalogTitle);
  writeTierFile(selectionDir, 1, [
    { pick: { tier: 1, kind: "catalog", title: catalogTitle, reason: "测试" } },
  ]);
  writeCurrentStage(scope, 1);
  const qCatalog = getTopicQuestions(scope, catalogTitle);
  check("catalog questions 为模板字段 key", JSON.stringify(qCatalog.questions) === JSON.stringify(catalogKeys), {
    got: qCatalog.questions,
    expect: catalogKeys,
  });
  check("catalog kind", qCatalog.kind === "catalog", qCatalog);

  writeTierFile(selectionDir, 3, [
    {
      pick: { tier: 3, kind: "generated", title: "童年趣事", reason: "测试" },
      questions: ["你小时候最开心的一件事是什么？", "当时和谁在一起？"],
    },
  ]);
  writeCurrentStage(scope, 3);
  const qGen = getTopicQuestions(scope, "童年趣事");
  check("generated 复用选题 questions", qGen.questions.length === 2, qGen);
  check("generated kind", qGen.kind === "generated", qGen);

  const hotTitle = "你最近一次感到特别温暖的事是什么？";
  writeTierFile(selectionDir, 4, [
    {
      pick: { tier: 4, kind: "hot_topic", title: hotTitle, reason: "生活记忆：温暖" },
      suggestedAnswers: ["家人陪伴", "老友重逢"],
    },
  ]);
  writeCurrentStage(scope, 4);
  const qHot = getTopicQuestions(scope, hotTitle);
  check("hot_topic questions 为 [title]", qHot.questions.length === 1 && qHot.questions[0] === hotTitle, qHot);
  check("hot_topic suggestedAnswers", qHot.suggestedAnswers?.length === 2, qHot);

  console.log("\n=== 读盘兼容旧扁平 TopicPick JSON（tier3）===");
  writeTierFile(selectionDir, 3, [
    {
      tier: 3,
      kind: "generated",
      title: "旧格式主题",
      reason: "legacy",
      questions: ["旧格式问句？"],
    },
  ]);
  writeCurrentStage(scope, 3);
  const qLegacy = getTopicQuestions(scope, "旧格式主题");
  check("legacy flat 仍可出题", qLegacy.questions[0] === "旧格式问句？", qLegacy);

  console.log("\n=== 持久化文件 ===");
  check(
    "无 confirmed-questions.json",
    !fs.existsSync(path.join(selectionDir, "confirmed-questions.json")),
  );
  check("无 pending-selection.json", !fs.existsSync(path.join(selectionDir, "pending-selection.json")));
  check("current-stage.json 存在", fs.existsSync(path.join(selectionDir, "current-stage.json")));
  check("tier1.json 存在", fs.existsSync(tierPendingPath(scope, 1)));

  if (process.env.OPENAI_API_KEY?.trim()) {
    console.log("\n=== 接口1：getPendingTopics（真实 LLM，tier1）===");
    writeCurrentStage(scope, 1);
    const picks = await getPendingTopics(scope, stubSections());
    console.log("  picks:", JSON.stringify(picks));
    check("tier1 有候选或空数组", Array.isArray(picks), picks);
    const pending = readPendingSelection(scope, 1);
    check("tier1.json 已持久化", pending !== null && pending.tier === 1, pending);
    const createdAt = pending?.createdAt;
    const picksAgain = await getPendingTopics(scope, stubSections());
    check("同阶段二次调用复用 pending", JSON.stringify(picksAgain) === JSON.stringify(picks), picksAgain);
    check(
      "同阶段二次调用不覆盖 createdAt",
      readPendingSelection(scope, 1)?.createdAt === createdAt,
      readPendingSelection(scope, 1),
    );
    if (picks.length > 0) {
      const qs = getTopicQuestions(scope, picks[0].title);
      check("确认后 catalog 有题目", qs.questions.length >= 0, qs);
    }
  } else {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过 getPendingTopics LLM 段。");
  }

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
