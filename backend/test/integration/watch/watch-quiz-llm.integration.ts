/**
 * 真实 LLM 判分（可选）：需配置 OPENAI_* 且不设 WATCH_QUIZ_STUB。
 *
 * 运行：`npm run build && set WATCH_QUIZ_LIVE=1&& npm run test:watch-quiz-llm`
 * PowerShell: `$env:WATCH_QUIZ_LIVE='1'; npm run test:watch-quiz-llm`
 */
import { config as loadEnv } from "dotenv";

loadEnv();

if (process.env.WATCH_QUIZ_LIVE !== "1") {
  console.log("test:watch-quiz-llm SKIPPED (set WATCH_QUIZ_LIVE=1 to run live LLM grading)");
  process.exit(0);
}

delete process.env.WATCH_QUIZ_STUB;

async function main(): Promise<void> {
  const { gradeQuizAnswer } = await import("../../../dist/watch/gradeQuizAnswer.js");

  let passed = 0;
  let failed = 0;

  function check(label: string, cond: boolean, detail?: unknown): void {
    if (cond) {
      passed += 1;
      console.log(`  [ok] ${label}`);
    } else {
      failed += 1;
      console.error(`  [FAIL] ${label}`, detail !== undefined ? JSON.stringify(detail) : "");
    }
  }

  console.log("\n=== LLM 判分：同义改写 ===");
  const paraphrase = await gradeQuizAnswer({
    question: "主人公童年在哪里长大？",
    referenceAnswer: "在江南水乡长大，常帮爷爷在河边看鱼篓。",
    userAnswer: "江南水乡，小时候帮爷爷看鱼篓",
  });
  check("paraphrase → correct", paraphrase.correct === true, paraphrase);

  console.log("\n=== LLM 判分：明显错误 ===");
  const wrong = await gradeQuizAnswer({
    question: "主人公童年在哪里长大？",
    referenceAnswer: "在江南水乡长大。",
    userAnswer: "在北京胡同里",
  });
  check("wrong place → incorrect", wrong.correct === false, wrong);

  if (failed > 0) {
    console.error(`\ntest:watch-quiz-llm FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:watch-quiz-llm OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
