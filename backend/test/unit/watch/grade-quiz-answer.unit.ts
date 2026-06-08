/**
 * 答题判分 stub 逻辑（开发环境 WATCH_QUIZ_STUB=1）。
 *
 * 运行：`npm run build && npm run test:watch-quiz-grade`
 */
import { config as loadEnv } from "dotenv";

loadEnv();
process.env.WATCH_QUIZ_STUB = "1";

// 动态 import 确保 stub 环境变量已设置
async function main(): Promise<void> {
  const { gradeQuizAnswer } = await import("../../../dist/watch/gradeQuizAnswer.js");

  let passed = 0;
  let failed = 0;

  function check(label: string, cond: boolean): void {
    if (cond) {
      passed += 1;
      console.log(`  [ok] ${label}`);
    } else {
      failed += 1;
      console.error(`  [FAIL] ${label}`);
    }
  }

  const exact = await gradeQuizAnswer({
    question: "童年在哪里？",
    referenceAnswer: "江南水乡",
    userAnswer: "江南水乡",
  });
  check("exact match → correct", exact.correct === true);

  const paraphrase = await gradeQuizAnswer({
    question: "童年在哪里？",
    referenceAnswer: "在江南水乡长大，每天帮爷爷看鱼篓。",
    userAnswer: "江南",
  });
  check("substring / overlap → correct", paraphrase.correct === true);

  const wrong = await gradeQuizAnswer({
    question: "童年在哪里？",
    referenceAnswer: "江南水乡",
    userAnswer: "北京",
  });
  check("wrong place → incorrect", wrong.correct === false);

  const empty = await gradeQuizAnswer({
    question: "q",
    referenceAnswer: "a",
    userAnswer: "   ",
  });
  check("empty → incorrect", empty.correct === false);

  if (failed > 0) {
    console.error(`\ntest:watch-quiz-grade FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:watch-quiz-grade OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
