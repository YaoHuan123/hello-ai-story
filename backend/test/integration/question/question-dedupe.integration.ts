/**
 * 步骤 1：去重集成测试。
 *
 * - 无 LLM：parseDedupe 形状校验
 * - 有 LLM：接口 2 形态的 QuestionSet + stubSections
 *
 * 运行：`npm run test:question:dedupe`
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
  const { parseDedupe } = await import("../../../src/question/parseDedupe");
  const { dedupeQuestions } = await import("../../../src/question/dedupe");
  const { getTopicFieldKeys } = await import("../../../src/topic/catalog");
  const { stubSections } = await import("../../fixtures/sections.stub");

  const questions = ["入学时间（必填）", "学校名称（必填）", "学校地点（必填）"];

  console.log("\n=== parseDedupe（无 LLM）===");
  // 新格式：用 i (index)
  const valid = parseDedupe(
    {
      decisions: [
        { i: 0, skip: true },
        { i: 1, skip: false },
        { i: 2, skip: false },
      ],
    },
    questions,
  );
  check("新格式 (i) 合法 decisions 解析", valid.length === 3 && valid[0].skip === true && valid[0].question === questions[0], valid);

  // 旧格式兼容：用 question
  const legacyValid = parseDedupe(
    {
      decisions: [
        { question: questions[0], skip: true },
        { question: questions[1], skip: false },
        { question: questions[2], skip: false },
      ],
    },
    questions,
  );
  check("旧格式 (question) 兼容解析", legacyValid.length === 3 && legacyValid[0].question === questions[0], legacyValid);

  let parseErr = "";
  try {
    parseDedupe({ decisions: [{ i: 0, skip: true, questionText: "重复输出" }] }, questions);
  } catch (e) {
    parseErr = e instanceof Error ? e.message : String(e);
  }
  check("questionText 非法抛错", parseErr.includes("DEDUPE_INVALID"), parseErr);

  console.log("\n=== dedupeQuestions 边界（无 LLM）===");
  const basicSet: QuestionSet = {
    title: "基本档案",
    tier: 1,
    kind: "catalog",
    questions: ["怎么称呼你？"],
  };
  let skipErr = "";
  try {
    await dedupeQuestions({ sections: stubSections(), questionSet: basicSet });
  } catch (e) {
    skipErr = e instanceof Error ? e.message : String(e);
  }
  check("基本档案跳过", skipErr.includes("DEDUPE_SKIPPED"), skipErr);

  let naErr = "";
  try {
    await dedupeQuestions({
      sections: stubSections(),
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
  check("generated 不适用", naErr.includes("DEDUPE_NOT_APPLICABLE"), naErr);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过去重 LLM 段。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log("\n=== dedupeQuestions（真实 LLM，接口 2 QuestionSet）===");
  const questionSet: QuestionSet = {
    title: "小学",
    tier: 1,
    kind: "catalog",
    questions: getTopicFieldKeys("小学"),
  };
  const result = await dedupeQuestions({ sections: stubSections(), questionSet });
  console.log("  ", JSON.stringify(result, null, 2));

  check("decisions 条数等于 questions", result.decisions.length === questionSet.questions.length, result);
  check(
    "skipped + ask 覆盖全部 question",
    result.skippedQuestions.length + result.askQuestions.length === questionSet.questions.length,
    result,
  );
  check(
    "每条 decision 不要求 reason",
    result.decisions.every((d) => typeof d.reason === "undefined" || d.reason.length <= 60),
    result,
  );

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
