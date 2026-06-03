/**
 * 步骤 2：口语化集成测试。
 *
 * - 无 LLM：parseColloquialize 形状校验
 * - 有 LLM：dedupe → colloquialize（接口 2 QuestionSet + stubSections）
 *
 * 运行：`npm run test:question:colloquialize`
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
  const { parseColloquialize } = await import("../../../src/question/parseColloquialize");
  const { colloquializeQuestions } = await import("../../../src/question/colloquialize");
  const { dedupeQuestions } = await import("../../../src/question/dedupe");
  const { getTopicFieldKeys } = await import("../../../src/topic/catalog");
  const { stubSections } = await import("../../fixtures/sections.stub");

  const ask = ["学校名称（必填）", "学校地点（必填）"];

  console.log("\n=== parseColloquialize（无 LLM）===");
  const valid = parseColloquialize(
    {
      questions: [
        { question: ask[0], questionText: "你上小学时读的是哪所学校？" },
        { question: ask[1], questionText: "这所小学在哪个城市或地区？" },
      ],
    },
    ask,
  );
  check("合法 questions 解析", valid.length === 2 && valid[0].questionText.length > 0, valid);

  let parseErr = "";
  try {
    parseColloquialize({ questions: [{ question: ask[0], questionText: "" }] }, ask);
  } catch (e) {
    parseErr = e instanceof Error ? e.message : String(e);
  }
  check("questionText 缺失抛错", parseErr.includes("COLLOQUIALIZE_INVALID"), parseErr);

  console.log("\n=== colloquializeQuestions 边界（无 LLM）===");
  const sections = stubSections();
  const basicSet: QuestionSet = {
    title: "基本档案",
    tier: 1,
    kind: "catalog",
    questions: ["怎么称呼你？"],
  };
  let skipErr = "";
  try {
    await colloquializeQuestions({
      sections,
      questionSet: basicSet,
      askQuestions: ["怎么称呼你？"],
    });
  } catch (e) {
    skipErr = e instanceof Error ? e.message : String(e);
  }
  check("基本档案跳过", skipErr.includes("COLLOQUIALIZE_SKIPPED"), skipErr);

  const empty = await colloquializeQuestions({
    sections,
    questionSet: { title: "小学", tier: 1, kind: "catalog", questions: ask },
    askQuestions: [],
  });
  check("askQuestions 为空直接返回", empty.questions.length === 0 && Object.keys(empty.questionTexts).length === 0, empty);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过口语化 LLM 段。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log("\n=== colloquializeQuestions（真实 LLM，dedupe → colloquialize）===");
  const questionSet: QuestionSet = {
    title: "小学",
    tier: 1,
    kind: "catalog",
    questions: getTopicFieldKeys("小学"),
  };
  const deduped = await dedupeQuestions({ sections, questionSet });
  if (deduped.askQuestions.length === 0) {
    console.warn("  [SKIP] 去重后无待问项，跳过口语化 LLM。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const result = await colloquializeQuestions({
    sections,
    questionSet,
    askQuestions: deduped.askQuestions,
  });
  console.log("  ", JSON.stringify(result, null, 2));

  check(
    "questions 条数等于 askQuestions",
    result.questions.length === deduped.askQuestions.length,
    result,
  );
  check(
    "questionTexts 与 items 一致",
    result.questions.every((q) => result.questionTexts[q.question] === q.questionText),
    result,
  );
  check(
    "每条 questionText 非空且 ≤80 字",
    result.questions.every((q) => q.questionText.length > 0 && q.questionText.length <= 80),
    result,
  );

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
