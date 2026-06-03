/**
 * 步骤 9：出题服务层端到端集成测试。
 *
 * - 无 LLM：服务导出、基本档案跳过、generated 不适用
 * - 有 LLM：catalog「小学」prep → 逐题 refine+suggest → extend
 *
 * 运行：`npm run test:question:flow`
 */
import { config as loadEnv } from "dotenv";
import type { AnsweredInTopicItem } from "../../../src/services/questionGeneration.service";
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
  const service = await import("../../../src/services/questionGeneration.service");
  const { getTopicFieldKeys } = await import("../../../src/topic/catalog");
  const { stubSections } = await import("../../fixtures/sections.stub");

  console.log("\n=== 服务层导出（无 LLM）===");
  check("runTemplatePrep", typeof service.runTemplatePrep === "function");
  check("refineAndSuggestCurrent", typeof service.refineAndSuggestCurrent === "function");
  check("extendSubCategoryQuestions", typeof service.extendSubCategoryQuestions === "function");
  check("isCatalogPrepSkipped", typeof service.isCatalogPrepSkipped === "function");

  const sections = stubSections();

  console.log("\n=== 跳过与守卫（无 LLM，经 service）===");
  const basic = await service.runTemplatePrep({
    sections,
    questionSet: {
      title: "基本档案",
      tier: 1,
      kind: "catalog",
      questions: ["怎么称呼你？", "你是几几年几月出生的？"],
    },
  });
  check("基本档案 prep skipped", basic.skipped === true, basic);

  let prepNa = "";
  try {
    await service.runTemplatePrep({
      sections,
      questionSet: {
        title: "童年趣事",
        tier: 3,
        kind: "generated",
        questions: ["你小时候最开心的一件事是什么？"],
      },
    });
  } catch (e) {
    prepNa = e instanceof Error ? e.message : String(e);
  }
  check("generated prep 不适用", prepNa.includes("TEMPLATE_PREP_NOT_APPLICABLE"), prepNa);

  let extendSkip = "";
  try {
    await service.extendSubCategoryQuestions({
      sections,
      questionSet: {
        title: "基本档案",
        tier: 1,
        kind: "catalog",
        questions: ["怎么称呼你？"],
      },
      templateAnswered: { "怎么称呼你？": "鲁迅" },
    });
  } catch (e) {
    extendSkip = e instanceof Error ? e.message : String(e);
  }
  check("基本档案 extend 跳过", extendSkip.includes("EXTEND_SKIPPED"), extendSkip);

  console.log("\n=== catalog 填表链（无 LLM 段：第 1 题）===");
  const prepStub: QuestionSet = {
    title: "小学",
    tier: 1,
    kind: "catalog",
    questions: ["入学时间（必填）", "学校名称（必填）"],
  };
  const q0 = "入学时间（必填）";
  const first = await service.refineAndSuggestCurrent({
    sections,
    questionSet: prepStub,
    currentQuestion: q0,
    batchQuestionText: "你是哪年入学的？",
    batchSuggestedAnswers: ["1964-09"],
    answeredInTopic: [],
  });
  check("第 1 题用批量文案", first.questionText === "你是哪年入学的？", first);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过 flow LLM 段。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log("\n=== catalog 全流程（真实 LLM：prep → 逐题 → extend）===");
  const questionSet: QuestionSet = {
    title: "小学",
    tier: 1,
    kind: "catalog",
    questions: getTopicFieldKeys("小学"),
  };

  const prep = await service.runTemplatePrep({ sections, questionSet });
  check("prep 未 skipped", prep.skipped === false, prep);
  check("askQuestions 非空", prep.askQuestions.length > 0, prep);

  const answeredInTopic: AnsweredInTopicItem[] = [];
  const templateAnswered: Record<string, string> = {};
  const limit = Math.min(2, prep.askQuestions.length);

  for (let i = 0; i < limit; i++) {
    const currentQuestion = prep.askQuestions[i]!;
    const batchText = prep.questionTexts[currentQuestion] ?? currentQuestion;
    const display = await service.refineAndSuggestCurrent({
      sections,
      questionSet,
      currentQuestion,
      batchQuestionText: batchText,
      batchSuggestedAnswers: prep.answerSuggestions[currentQuestion] ?? [],
      answeredInTopic,
    });
    check(`第 ${i + 1} 题 questionText 非空`, display.questionText.length > 0, display);
    check(`第 ${i + 1} 题 suggestedAnswers ≤4`, display.suggestedAnswers.length <= 4, display);

    const answer = currentQuestion.includes("入学") ? "1964-09" : "长沙市实验小学";
    answeredInTopic.push({
      question: currentQuestion,
      questionText: display.questionText,
      answer,
    });
    templateAnswered[currentQuestion] = answer;
  }

  const extended = await service.extendSubCategoryQuestions({
    sections,
    questionSet,
    templateAnswered,
  });
  console.log("  extend:", JSON.stringify(extended, null, 2));

  check("extend questions ≤3", extended.questions.length <= 3, extended);
  check(
    "extend 每条 q 合法",
    extended.questions.every((item) => item.q.length > 0 && item.q.length <= 30),
    extended,
  );

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
