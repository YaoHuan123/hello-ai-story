/**
 * Tier3 questions：复合问句拆分为单问。
 *
 * 运行：`npm run test:topic:parse-tier3-questions`
 */
import { mapGeneratedPickRow, splitIntoSingleQuestions } from "../../../src/topic/parse";

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

function main(): void {
  console.log("\n=== splitIntoSingleQuestions ===");
  const compoundEn =
    "Who usually cooks in your family? What is the dish you cook most often?";
  const splitEn = splitIntoSingleQuestions(compoundEn);
  check("英文复合句拆成 2 条", splitEn.length === 2, splitEn);
  check("每条仅一个问号", splitEn.every((q) => (q.match(/\?/g) ?? []).length === 1), splitEn);

  const compoundZh = "你们家平时一般是谁做饭呀？你们最常做的菜是什么呢？";
  const splitZh = splitIntoSingleQuestions(compoundZh);
  check("中文复合句拆成 2 条", splitZh.length === 2, splitZh);

  const single = "What street did you grow up on?";
  check("单问句不拆分", splitIntoSingleQuestions(single).length === 1, single);

  console.log("\n=== mapGeneratedPickRow 复合 questions[0] ===");
  const pick = mapGeneratedPickRow(
    {
      title: "Family cooking routines",
      reason: "Daily life angle",
      questions: [compoundEn],
    },
    "picks[0]",
  );
  check("解析后 2 条单问", pick.questions.length === 2, pick.questions);
  check(
    "无复合问句",
    pick.questions.every((q) => (q.match(/[?？]/gu) ?? []).length === 1),
    pick.questions,
  );

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
