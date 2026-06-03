/**
 * 步骤 7：refineAndSuggestCurrent 集成测试。
 *
 * 运行：`npm run test:question:refine-suggest`
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
  const { mergeSuggestedAnswersForDisplay } = await import(
    "../../../src/question/mergeSuggestedAnswers"
  );
  const { refineAndSuggestCurrent } = await import(
    "../../../src/question/refineAndSuggestCurrent"
  );
  const { runTemplatePrep } = await import("../../../src/question/runTemplatePrep");
  const { getTopicFieldKeys } = await import("../../../src/topic/catalog");
  const { stubSections } = await import("../../fixtures/sections.stub");

  console.log("\n=== mergeSuggestedAnswersForDisplay（无 LLM）===");
  const merged = mergeSuggestedAnswersForDisplay(
    ["1970-09", "1970-09"],
    ["1964-09", "1971-01", "extra"],
  );
  check(
    "逐题优先、去重、最多 4",
    merged.length === 4 &&
      merged[0] === "1970-09" &&
      merged[1] === "1964-09" &&
      merged[2] === "1971-01" &&
      merged[3] === "extra",
    merged,
  );

  const sections = stubSections();

  console.log("\n=== refineAndSuggestCurrent 第 1 题（无 LLM 逐题段）===");
  const prepStub: QuestionSet = {
    title: "小学",
    tier: 1,
    kind: "catalog",
    questions: ["入学时间（必填）", "学校名称（必填）"],
  };
  const q0 = "入学时间（必填）";
  const first = await refineAndSuggestCurrent({
    sections,
    questionSet: prepStub,
    currentQuestion: q0,
    batchQuestionText: "你是哪年入学的？",
    batchSuggestedAnswers: ["1964-09", "1965-09"],
    answeredInTopic: [],
  });
  check("第 1 题文案为批量", first.questionText === "你是哪年入学的？", first);
  check(
    "第 1 题合并=仅批量",
    first.suggestedAnswers.join(",") === "1964-09,1965-09",
    first.suggestedAnswers,
  );

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过 refine-suggest LLM 段。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log("\n=== refineAndSuggestCurrent（真实 LLM，prep 后第 2 题）===");
  const questionSet: QuestionSet = {
    title: "小学",
    tier: 1,
    kind: "catalog",
    questions: getTopicFieldKeys("小学"),
  };
  const prep = await runTemplatePrep({ sections, questionSet });
  if (prep.askQuestions.length < 2) {
    console.warn("  [SKIP] askQuestions 不足 2 道。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const q1 = prep.askQuestions[0]!;
  const q2 = prep.askQuestions[1]!;
  const result = await refineAndSuggestCurrent({
    sections,
    questionSet,
    currentQuestion: q2,
    batchQuestionText: prep.questionTexts[q2] ?? q2,
    batchSuggestedAnswers: prep.answerSuggestions[q2] ?? [],
    answeredInTopic: [
      {
        question: q1,
        questionText: prep.questionTexts[q1] ?? q1,
        answer: "1964-09",
      },
    ],
  });
  console.log("  ", JSON.stringify(result, null, 2));

  check("questionText 非空", result.questionText.length > 0, result);
  check("suggestedAnswers ≤4", result.suggestedAnswers.length <= 4, result);

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
