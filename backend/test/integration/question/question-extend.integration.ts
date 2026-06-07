/**
 * 步骤 8：扩展追问集成测试。
 *
 * 运行：`npm run test:question:extend`
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
  const { parseExtend } = await import("../../../src/question/parseExtend");
  const { extendSubCategoryQuestions } = await import("../../../src/question/extend");
  const { runTemplatePrep } = await import("../../../src/question/runTemplatePrep");
  const { getTopicFieldKeys } = await import("../../../src/topic/catalog");
  const { stubSections } = await import("../../fixtures/sections.stub");

  console.log("\n=== parseExtend（无 LLM）===");
  const valid = parseExtend({
    questions: [
      { q: "班主任你还记得叫什么吗？", suggestedAnswers: [] },
      { q: "那时最好的朋友是谁？", suggestedAnswers: ["小明"] },
    ],
  });
  check("合法 questions 解析", valid.length === 2, valid);

  const sections = stubSections();
  const questionSet: QuestionSet = {
    title: "小学",
    tier: 1,
    kind: "catalog",
    questions: getTopicFieldKeys("小学"),
  };

  console.log("\n=== extendSubCategoryQuestions 边界（无 LLM）===");
  let emptyRequiredThrew = false;
  try {
    await extendSubCategoryQuestions({
      sections,
      questionSet,
      templateAnswered: {},
    });
  } catch (err) {
    emptyRequiredThrew =
      err instanceof Error && err.message.includes("EXTEND_MISSING_INPUT");
  }
  check("templateAnswered 为空抛错", emptyRequiredThrew);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过 extend LLM 段。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log("\n=== extendSubCategoryQuestions（真实 LLM，模拟模板答完）===");
  const prep = await runTemplatePrep({ sections, questionSet });
  const templateAnswered: Record<string, string> = {};
  for (const q of prep.askQuestions.slice(0, 2)) {
    templateAnswered[q] = q.includes("入学") ? "1964-09" : "长沙市实验小学";
  }

  const result = await extendSubCategoryQuestions({
    sections,
    questionSet,
    templateAnswered,
  });
  console.log("  ", JSON.stringify(result, null, 2));

  check("questions ≤3", result.questions.length <= 3, result);
  const { EXTEND_QUESTION_MAX_CHARS } = await import("../../../src/content/displayLocale");
  check(
    `每条 q 非空且 ≤${EXTEND_QUESTION_MAX_CHARS} 字`,
    result.questions.every(
      (item) => item.q.length > 0 && item.q.length <= EXTEND_QUESTION_MAX_CHARS,
    ),
    result,
  );
  check(
    "备选 ≤4 且 ≤40 字",
    result.questions.every(
      (item) =>
        item.suggestedAnswers.length <= 4 &&
        item.suggestedAnswers.every((s) => s.length > 0 && s.length <= 40),
    ),
    result,
  );

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
