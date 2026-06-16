/**
 * 结构型备选：提示词约定 +（有 API Key 时）多子类 LLM 抽样。
 *
 * 运行：`npm run test:question:structural-suggest`
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

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

const PROMPTS_DIR = path.join(__dirname, "..", "..", "..", "..", "prompts", "interview");

function readPrompt(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), "utf-8");
}

function hasStructuralChip(suggested: string[], allowed: string[]): boolean {
  if (suggested.length === 0) return false;
  const norm = (s: string) => s.trim().toLowerCase();
  const allowedNorm = new Set(allowed.map(norm));
  return suggested.some((s) => allowedNorm.has(norm(s)));
}

async function main(): Promise<void> {
  console.log("\n=== 提示词含结构型备选规则 ===");
  const currentMd = readPrompt("suggest-current-answer-options.md");
  const batchMd = readPrompt("suggest-template-answers.md");
  const extendMd = readPrompt("extend-sub-category-questions.md");
  check("suggest-current 含 Structural mode", /Structural mode/i.test(currentMd));
  check("suggest-current 含开放 or 反例", /playmates.*friends|Do NOT use structural/i.test(currentMd));
  check("suggest-batch 含 Structural mode", /Structural mode/i.test(batchMd));
  check("extend 含 Structural chips", /Structural chips/i.test(extendMd));

  const { SUGGEST_CURRENT_VALUE_MAX_LEN } = await import("../../../src/question/parseSuggestCurrent");
  check("解析硬上限 80", SUGGEST_CURRENT_VALUE_MAX_LEN === 80);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过结构型 LLM 抽样。");
    console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const { suggestCurrentAnswers } = await import("../../../src/question/suggestCurrent");
  const { stubSections } = await import("../../fixtures/sections.stub");

  const sections = stubSections();

  console.log("\n=== 结构型：Middle school 寄宿/走读 ===");
  const boarding = await suggestCurrentAnswers({
    sections,
    questionSet: {
      title: "Middle school",
      tier: 1,
      kind: "catalog",
      questions: [
        "Enrollment date (required)",
        "School name (required)",
        "School location (required)",
        "Boarding or day student (optional)",
      ],
    },
    currentQuestion: "Boarding or day student (optional)",
    questionText:
      "When you were at Duanji Middle School, did you live on campus as a boarder or commute daily?",
    answeredInTopic: [
      {
        question: "School name (required)",
        questionText: "What middle school did you attend?",
        answer: "Duanji Middle School",
      },
      {
        question: "School location (required)",
        questionText: "Where was the school?",
        answer: "Henan",
      },
    ],
  });
  console.log("  ", JSON.stringify(boarding.suggestedAnswers));
  check(
    "寄宿/走读 chip",
    hasStructuralChip(boarding.suggestedAnswers, [
      "Boarding",
      "Day student",
      "寄宿",
      "走读",
      "住校",
    ]),
    boarding,
  );

  console.log("\n=== 结构型：High school 学习成绩 ===");
  const grades = await suggestCurrentAnswers({
    sections,
    questionSet: {
      title: "High school",
      tier: 1,
      kind: "catalog",
      questions: [
        "Enrollment date (required)",
        "School name (required)",
        "Academic performance (optional, poor/average/excellent)",
      ],
    },
    currentQuestion: "Academic performance (optional, poor/average/excellent)",
    questionText: "Overall, how were your grades in high school?",
    answeredInTopic: [
      {
        question: "School name (required)",
        questionText: "What high school did you attend?",
        answer: "County No.1 High",
      },
    ],
  });
  console.log("  ", JSON.stringify(grades.suggestedAnswers));
  check(
    "差/中/优 chip",
    hasStructuralChip(grades.suggestedAnswers, [
      "Poor",
      "Average",
      "Excellent",
      "差",
      "中",
      "优",
    ]),
    grades,
  );

  console.log("\n=== 反例：Elementary 玩伴或好友（开放 or）===");
  const playmates = await suggestCurrentAnswers({
    sections,
    questionSet: {
      title: "Elementary school",
      tier: 1,
      kind: "catalog",
      questions: ["School name (required)", "Playmates or friends (optional)"],
    },
    currentQuestion: "Playmates or friends (optional)",
    questionText: "Who did you usually hang out with after school?",
    answeredInTopic: [
      {
        question: "School name (required)",
        questionText: "What elementary school?",
        answer: "Riverside Elementary",
      },
    ],
  });
  console.log("  ", JSON.stringify(playmates.suggestedAnswers));
  check(
    "玩伴或好友不为双维度 chip",
    !hasStructuralChip(playmates.suggestedAnswers, ["Playmates", "Friends", "玩伴", "好友"]),
    playmates,
  );

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
