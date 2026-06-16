/**
 * 选主题提交：展示标题 → pending canonical title。
 *
 * 运行：`npm run test:interview:topic-submit-resolve`
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

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

async function main(): Promise<void> {
  const { setupUserWithInterview } = await import("../../fixtures/interviewScope");
  const { getInterviewRootDir } = await import("../../../src/services/interviewWorkspace.service");
  const {
    resolveTopicTitleFromPendingSync,
    resolveTopicTitleForSubmit,
    writeCurrentStage,
  } = await import("../../../src/services/topicSelection.service");
  const { writePending } = await import("../../../src/topic/tierPending");
  const { runWithDisplayLocale } = await import("../../../src/content/displayLocale");
  const { SELECT_TOPIC_KEY, submit, getCurrentQuestion, getCurrentQuestionTraced } = await import(
    "../../../src/services/interviewOrchestrator.service"
  );
  const { getSections } = await import("../../../src/services/answeredSections.service");
  const { stubSections } = await import("../../fixtures/sections.stub");
  const { readQuestionSet } = await import("../../../src/question/topicPersist");
  const { seedCommittedSections } = await import("../../../src/services/answeredSections.service");
  const { seedCatalogGates } = await import("../../../src/services/catalogGates.service");

  const scope = setupUserWithInterview(`topic-submit-${Date.now()}`);
  seedCommittedSections(scope, stubSections());
  seedCatalogGates(scope, { tier1Exhausted: true, tier2Skipped: true });
  writeCurrentStage(scope, 3);

  const enTitle = "Rural childhood memories in Tongmiao Village, Gushi County";
  const zhTitle = "固始县铜庙村的乡村童年回忆";

  const enQuestion = "What do you remember most about village life?";
  const zhQuestion = "你还记得村里生活什么印象最深？";

  writePending(
    scope,
    {
      tier: 3,
      createdAt: new Date().toISOString(),
      picks: [
        {
          pick: { tier: 3, kind: "generated", title: enTitle, reason: "test" },
          questions: [enQuestion],
        },
      ],
    },
    (p, d) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(d, null, 2), "utf-8");
    },
  );

  const cachePath = path.join(getInterviewRootDir(scope), "display-translate-cache.json");
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(
    cachePath,
    JSON.stringify({ [enTitle]: zhTitle, [enQuestion]: zhQuestion }, null, 2),
    "utf-8",
  );

  console.log("\n=== resolveTopicTitleFromPendingSync（展示缓存反查）===");
  const syncResolved = resolveTopicTitleFromPendingSync(scope, zhTitle, "zh");
  check("中文展示名 → canonical 英文", syncResolved === enTitle, syncResolved);

  console.log("\n=== resolveTopicTitleForSubmit ====");
  const asyncResolved = await resolveTopicTitleForSubmit(scope, zhTitle, "zh");
  check("async 解析一致", asyncResolved === enTitle, asyncResolved);

  console.log("\n=== submit 选 Tier3 中文展示名 ====");
  const qTopic = await runWithDisplayLocale("zh", async () => getCurrentQuestion(scope));
  check("读=选主题", qTopic.type === "topic", qTopic);

  await runWithDisplayLocale("zh", async () =>
    submit(scope, { key: SELECT_TOPIC_KEY, text: qTopic.text, value: zhTitle }),
  );
  const qs = readQuestionSet(scope);
  check("submit 后 questionSet.title=英文 canonical", qs?.title === enTitle, qs?.title);

  console.log("\n=== submit 后 GET current（Tier3 第一题）===");
  const qNormal = await runWithDisplayLocale("zh", async () => getCurrentQuestionTraced(scope));
  check("type=normal", qNormal.type === "normal", qNormal.type);
  check("问句已译或含 village", /village|村|生活/i.test(qNormal.text), qNormal.text);

  console.log("\n=== Tier3 答一题 submit ====");
  await runWithDisplayLocale("zh", async () =>
    submit(scope, {
      key: enQuestion,
      text: qNormal.text,
      value: "经常在村口的大树下玩",
    }),
  );
  check(
    "答完写入 sections",
    getSections(scope).some((s) => s.name === enTitle && s.qa.length === 1),
    getSections(scope),
  );

  console.log(`\n${failed === 0 ? "ALL PASSED" : "FAILED"} (${passed} ok, ${failed} fail)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
