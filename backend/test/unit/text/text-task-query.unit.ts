/**
 * 文本任务查询：listTextTasks / getTextTaskProgress。
 */
import fs from "node:fs";
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { createInterview } from "../../../src/services/interviewWorkspace.service";
import { createUserWorkspace } from "../../../src/services/workspace.service";
import { testUserId } from "../../helpers/testAccount";
import type { AnsweredSection } from "../../../src/topic/types";
import { createTextTask, runTextPipeline } from "../../../dist/text/orchestrator/runTextPipeline.js";
import { getTextTaskProgress, listTextTasks } from "../../../dist/text/textTaskQuery.js";

loadEnv();
process.env.TEXT_ARTICLE_STUB = "1";

const FIXTURE: AnsweredSection[] = [
  {
    name: "基本档案",
    qa: [
      { q: "您怎么称呼？", a: "测试用户" },
      { q: "哪年出生？", a: "1960年" },
    ],
  },
];

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

async function main() {
  const userId = testUserId("text-query");
  createUserWorkspace(userId);
  const interview = createInterview(userId, { title: "文本 query 测试" });
  const scope = { userId, interviewId: interview.id };
  seedCommittedSections(scope, FIXTURE);

  const pending = createTextTask(scope);
  check("list has pending task", listTextTasks(scope).some((t) => t.taskId === pending.taskId));

  const pendingProgress = getTextTaskProgress(scope, pending.taskId);
  check("pending meta status", pendingProgress.status === "pending");
  check("pending no output", pendingProgress.output === null);

  const result = await runTextPipeline(scope, { taskId: pending.taskId, mode: "stub" });
  check("pipeline success", result.status === "success");

  const listed = listTextTasks(scope);
  check("list includes finished task", listed.some((t) => t.taskId === pending.taskId));
  check("list sorted desc", listed[0]?.taskId === pending.taskId);
  check("productionMode", listed[0]?.productionMode === "biography_formal_article");

  const doneProgress = getTextTaskProgress(scope, pending.taskId);
  check("success meta status", doneProgress.status === "success");
  check("completedSteps has tx_article", doneProgress.completedSteps.includes("tx_article"));
  check("output has article", doneProgress.output?.hasArticle === true);
  check("output articleLength > 0", (doneProgress.output?.articleLength ?? 0) > 0);
  check("article file exists", fs.existsSync(result.articlePath));

  if (failed > 0) {
    console.error(`\ntest:text:query FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:text:query OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
