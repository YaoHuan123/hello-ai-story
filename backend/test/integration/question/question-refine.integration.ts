/**
 * 步骤 5：逐题 refine 集成测试。
 *
 * 运行：`npm run test:question:refine`
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
  const { parseRefine } = await import("../../../src/question/parseRefine");
  const { refineCurrentQuestion, shouldRefineCurrentQuestion } = await import(
    "../../../src/question/refineCurrent"
  );
  const { runTemplatePrep } = await import("../../../src/question/runTemplatePrep");
  const { getTopicFieldKeys } = await import("../../../src/topic/catalog");
  const { stubSections } = await import("../../fixtures/sections.stub");

  console.log("\n=== parseRefine（无 LLM）===");
  const valid = parseRefine({
    mode: "open",
    questionText: "长沙实验小学是在长沙哪个区上的学？",
    reason: "已知校名追问区位",
  });
  check("合法 open 解析", valid.mode === "open" && valid.questionText.length > 0, valid);

  let parseErr = "";
  try {
    parseRefine({ mode: "judgment", questionText: "x", reason: "y" });
  } catch (e) {
    parseErr = e instanceof Error ? e.message : String(e);
  }
  check("judgment 模式抛错", parseErr.includes("REFINE_INVALID"), parseErr);

  const sections = stubSections();

  console.log("\n=== refineCurrentQuestion 边界（无 LLM）===");
  const prepStub: QuestionSet = {
    title: "小学",
    tier: 1,
    kind: "catalog",
    questions: ["学校名称（必填）", "学校地点（必填）"],
  };
  check(
    "无已答不必 refine",
    shouldRefineCurrentQuestion([]) === false,
  );
  const first = await refineCurrentQuestion({
    sections,
    questionSet: prepStub,
    currentQuestion: "学校名称（必填）",
    batchQuestionText: "你上小学时读的是哪所学校？",
    answeredInTopic: [],
  });
  check(
    "第 1 题直通批量文案",
    first.questionText === "你上小学时读的是哪所学校？" && first.reason === "first-question-use-batch",
    first,
  );

  let skipErr = "";
  try {
    await refineCurrentQuestion({
      sections,
      questionSet: { title: "基本档案", tier: 1, kind: "catalog", questions: ["怎么称呼你？"] },
      currentQuestion: "怎么称呼你？",
      batchQuestionText: "怎么称呼你？",
      answeredInTopic: [{ question: "x", questionText: "x", answer: "y" }],
    });
  } catch (e) {
    skipErr = e instanceof Error ? e.message : String(e);
  }
  check("基本档案跳过", skipErr.includes("REFINE_SKIPPED"), skipErr);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过 refine LLM 段。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log("\n=== refineCurrentQuestion（真实 LLM，prep 后第 2 题）===");
  const questionSet: QuestionSet = {
    title: "小学",
    tier: 1,
    kind: "catalog",
    questions: getTopicFieldKeys("小学"),
  };
  const prep = await runTemplatePrep({ sections, questionSet });
  if (prep.askQuestions.length < 2) {
    console.warn("  [SKIP] askQuestions 不足 2 道，跳过 refine LLM。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const q1 = prep.askQuestions[0]!;
  const q2 = prep.askQuestions[1]!;
  const result = await refineCurrentQuestion({
    sections,
    questionSet,
    currentQuestion: q2,
    batchQuestionText: prep.questionTexts[q2] ?? q2,
    answeredInTopic: [
      {
        question: q1,
        questionText: prep.questionTexts[q1] ?? q1,
        answer: "长沙市实验小学",
      },
    ],
  });
  console.log("  ", JSON.stringify(result, null, 2));

  check("mode 为 open", result.mode === "open", result);
  check(
    "questionText 非空且 ≤80",
    result.questionText.length > 0 && result.questionText.length <= 80,
    result,
  );
  check("reason 非空", result.reason.length > 0, result);
  check(
    "与批量文案不完全相同（通常应承接已答）",
    result.questionText !== prep.questionTexts[q2] || result.reason !== "first-question-use-batch",
    result,
  );

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
