/**
 * 采访完成判定：≥50 条已答 + tier 整轮无候选。
 */
import { config as loadEnv } from "dotenv";
import { countCommittedAnswers, seedCommittedSections } from "../../../src/services/answeredSections.service";
import { createInterview } from "../../../src/services/interviewWorkspace.service";
import { createUserWorkspace } from "../../../src/services/workspace.service";
import { testUserId } from "../../helpers/testAccount";
import type { AnsweredSection } from "../../../src/topic/types";
import {
  INTERVIEW_COMPLETE_MIN_ANSWERS,
  isInterviewCompleteByRules,
} from "../../../dist/services/interviewOrchestrator.service.js";

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

function makeSections(answerCount: number): AnsweredSection[] {
  const qa = Array.from({ length: answerCount }, (_, i) => ({
    q: `Question ${i + 1}?`,
    a: `Answer ${i + 1}`,
  }));
  return [{ name: "基本档案", qa }];
}

function main() {
  check("min answers is 50", INTERVIEW_COMPLETE_MIN_ANSWERS === 50);

  check(
    "complete when 50 answers and empty topics",
    isInterviewCompleteByRules(50, []) === true,
  );
  check(
    "not complete when 49 answers and empty topics",
    isInterviewCompleteByRules(49, []) === false,
  );
  check(
    "not complete when 50 answers but topics remain",
    isInterviewCompleteByRules(50, [{ tier: 1, kind: "catalog", title: "Childhood", reason: "r" }]) === false,
  );

  const userId = testUserId("interview-complete-count");
  createUserWorkspace(userId);
  const interview = createInterview(userId, { title: "count测试" });
  const scope = { userId, interviewId: interview.id };
  seedCommittedSections(scope, makeSections(50));
  check("countCommittedAnswers", countCommittedAnswers(scope) === 50);

  if (failed > 0) {
    console.error(`\ntest:interview:complete FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:interview:complete OK (${passed} checks)`);
}

main();
