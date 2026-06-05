/**
 * 步骤 3：批量备选集成测试。
 *
 * 运行：`npm run test:question:suggest-batch`
 */
import { config as loadEnv } from "dotenv";
import type { QuestionSet } from "../../../src/topic/types";

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
  const { parseSuggestBatch } = await import("../../../src/question/parseSuggestBatch");
  const { suggestBatchAnswers } = await import("../../../src/question/suggestBatch");
  const { dedupeQuestions } = await import("../../../src/question/dedupe");
  const { colloquializeQuestions } = await import("../../../src/question/colloquialize");
  const { getTopicFieldKeys } = await import("../../../src/topic/catalog");
  const { stubSections } = await import("../../fixtures/sections.stub");

  const ask = ["入学时间（必填）", "学校名称（必填）"];

  console.log("\n=== parseSuggestBatch（无 LLM）===");
  // 新格式：用 i (index)
  const valid = parseSuggestBatch(
    {
      suggestions: [
        { i: 0, suggestedAnswers: ["1964-09"] },
        { i: 1, suggestedAnswers: [] },
      ],
    },
    ask,
  );
  check("新格式 (i) 合法 suggestions 解析", valid.length === 2 && valid[0].question === ask[0], valid);

  // 旧格式兼容：用 question
  const legacyValid = parseSuggestBatch(
    {
      suggestions: [
        { question: ask[0], suggestedAnswers: ["1964-09"] },
        { question: ask[1], suggestedAnswers: [] },
      ],
    },
    ask,
  );
  check("旧格式 (question) 兼容解析", legacyValid.length === 2 && legacyValid[0].question === ask[0], legacyValid);

  console.log("\n=== suggestBatchAnswers 边界（无 LLM）===");
  const sections = stubSections();
  let skipErr = "";
  try {
    await suggestBatchAnswers({
      sections,
      questionSet: { title: "基本档案", tier: 1, kind: "catalog", questions: ["怎么称呼你？"] },
      askQuestions: ["怎么称呼你？"],
      questionTexts: { "怎么称呼你？": "怎么称呼你？" },
    });
  } catch (e) {
    skipErr = e instanceof Error ? e.message : String(e);
  }
  check("基本档案跳过", skipErr.includes("SUGGEST_BATCH_SKIPPED"), skipErr);

  const empty = await suggestBatchAnswers({
    sections,
    questionSet: { title: "小学", tier: 1, kind: "catalog", questions: ask },
    askQuestions: [],
    questionTexts: {},
  });
  check("askQuestions 为空直接返回", empty.suggestions.length === 0, empty);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过批量备选 LLM 段。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log("\n=== suggestBatchAnswers（真实 LLM，dedupe → colloquialize → suggest）===");
  const questionSet: QuestionSet = {
    title: "小学",
    tier: 1,
    kind: "catalog",
    questions: getTopicFieldKeys("小学"),
  };
  const deduped = await dedupeQuestions({ sections, questionSet });
  if (deduped.askQuestions.length === 0) {
    console.warn("  [SKIP] 去重后无待问项。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const colloq = await colloquializeQuestions({
    sections,
    questionSet,
    askQuestions: deduped.askQuestions,
  });
  const result = await suggestBatchAnswers({
    sections,
    questionSet,
    askQuestions: deduped.askQuestions,
    questionTexts: colloq.questionTexts,
  });
  console.log("  ", JSON.stringify(result, null, 2));

  check(
    "suggestions 条数等于 askQuestions",
    result.suggestions.length === deduped.askQuestions.length,
    result,
  );
  check(
    "每条 suggestedAnswers ≤4 且每项 ≤40 字",
    result.suggestions.every(
      (s) =>
        s.suggestedAnswers.length <= 4 &&
        s.suggestedAnswers.every((a) => a.length > 0 && a.length <= 40),
    ),
    result,
  );
  check(
    "answerSuggestions 与 suggestions 一致",
    result.suggestions.every((s) => result.answerSuggestions[s.question] === s.suggestedAnswers),
    result,
  );
  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
