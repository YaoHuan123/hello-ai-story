/**
 * 步骤 4：runTemplatePrep 集成测试。
 *
 * 运行：`npm run test:question:prep`
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
  const { runTemplatePrep } = await import("../../../src/question/runTemplatePrep");
  const { getTopicFieldKeys } = await import("../../../src/topic/catalog");
  const { stubSections } = await import("../../fixtures/sections.stub");

  const sections = stubSections();

  console.log("\n=== runTemplatePrep 边界（无 LLM）===");
  const basic = await runTemplatePrep({
    sections,
    questionSet: {
      title: "基本档案",
      tier: 1,
      kind: "catalog",
      questions: ["怎么称呼你？", "你是几几年几月出生的？"],
    },
  });
  check("基本档案 skipped", basic.skipped === true, basic);
  check(
    "基本档案 questionTexts 为模板原文",
    basic.questionTexts["怎么称呼你？"] === "怎么称呼你？",
    basic.questionTexts,
  );

  let naErr = "";
  try {
    await runTemplatePrep({
      sections,
      questionSet: {
        title: "童年趣事",
        tier: 3,
        kind: "generated",
        questions: ["你小时候最开心的一件事是什么？"],
      },
    });
  } catch (e) {
    naErr = e instanceof Error ? e.message : String(e);
  }
  check("generated 不适用", naErr.includes("TEMPLATE_PREP_NOT_APPLICABLE"), naErr);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过 prep LLM 段。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log("\n=== runTemplatePrep（真实 LLM，小学）===");
  const questionSet: QuestionSet = {
    title: "小学",
    tier: 1,
    kind: "catalog",
    questions: getTopicFieldKeys("小学"),
  };
  const result = await runTemplatePrep({ sections, questionSet });
  console.log("  ", JSON.stringify({
    skipped: result.skipped,
    askCount: result.askQuestions.length,
    skippedCount: result.skippedQuestions.length,
    sampleText: result.askQuestions[0] ? result.questionTexts[result.askQuestions[0]] : null,
    sampleSuggest: result.askQuestions[0] ? result.answerSuggestions[result.askQuestions[0]] : null,
  }, null, 2));

  check("未跳过三步", result.skipped === false, result);
  check(
    "ask + skipped 覆盖全部题",
    result.askQuestions.length + result.skippedQuestions.length === questionSet.questions.length,
    result,
  );
  check(
    "每道待问题有口语化文案",
    result.askQuestions.every((q) => String(result.questionTexts[q] ?? "").trim().length > 0),
    result,
  );
  check(
    "answerSuggestions 键与 askQuestions 一致",
    result.askQuestions.every((q) => Array.isArray(result.answerSuggestions[q])),
    result,
  );

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
