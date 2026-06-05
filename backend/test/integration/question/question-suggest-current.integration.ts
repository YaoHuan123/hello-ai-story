/**
 * 步骤 6：逐题备选集成测试。
 *
 * 运行：`npm run test:question:suggest-current`
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
  const { parseSuggestCurrent } = await import("../../../src/question/parseSuggestCurrent");
  const { suggestCurrentAnswers, shouldSuggestCurrentQuestion } = await import(
    "../../../src/question/suggestCurrent"
  );
  const { refineCurrentQuestion } = await import("../../../src/question/refineCurrent");
  const { runTemplatePrep } = await import("../../../src/question/runTemplatePrep");
  const { getTopicFieldKeys } = await import("../../../src/topic/catalog");
  const { stubSections } = await import("../../fixtures/sections.stub");

  console.log("\n=== parseSuggestCurrent（无 LLM）===");
  const values = parseSuggestCurrent({
    suggestedAnswers: ["1970-09", "1970-09", ""],
  });
  check("解析字符串数组并去重", values.length === 1 && values[0] === "1970-09", values);

  const legacyValues = parseSuggestCurrent({
    suggestedAnswers: [
      {
        value: "1970-09",
        confidence: 0.9,
        inferenceType: "calculation",
        basis: "入学 1964-09 加小学学制",
      },
      {
        value: "1971-01",
        confidence: 0.5,
        inferenceType: "calculation",
        basis: "低置信应过滤",
      },
    ],
  });
  check("兼容旧对象数组", legacyValues.length === 2 && legacyValues[0] === "1970-09", legacyValues);

  const sections = stubSections();

  console.log("\n=== suggestCurrentAnswers 边界（无 LLM）===");
  check("无已答不必 suggest", shouldSuggestCurrentQuestion([]) === false);
  const empty = await suggestCurrentAnswers({
    sections,
    questionSet: { title: "小学", tier: 1, kind: "catalog", questions: ["入学时间（必填）"] },
    currentQuestion: "入学时间（必填）",
    questionText: "你是哪年入学的？",
    answeredInTopic: [],
  });
  check("无已答返回空", empty.suggestedAnswers.length === 0, empty);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过 suggest-current LLM 段。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log("\n=== suggestCurrentAnswers（真实 LLM，prep + refine 后第 2 题）===");
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
  const answeredInTopic = [
    {
      question: q1,
      questionText: prep.questionTexts[q1] ?? q1,
      answer: "1964-09",
    },
  ];
  const refined = await refineCurrentQuestion({
    sections,
    questionSet,
    currentQuestion: q2,
    batchQuestionText: prep.questionTexts[q2] ?? q2,
    answeredInTopic,
  });

  const result = await suggestCurrentAnswers({
    sections,
    questionSet,
    currentQuestion: q2,
    questionText: refined.questionText,
    answeredInTopic,
  });
  console.log("  ", JSON.stringify(result, null, 2));

  check(
    "suggestedAnswers ≤4 且为短字符串",
    result.suggestedAnswers.length <= 4 &&
      result.suggestedAnswers.every((v) => v.length > 0 && v.length <= 40),
    result,
  );

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
