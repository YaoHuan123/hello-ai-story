/**
 * 文本流水线 smoke：sections stub → tx_article → 正式文章.json
 * 用法：npm run build && npm run test:text:article
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { seedCommittedSections } from "../../../src/services/answeredSections.service";
import { createInterview } from "../../../src/services/interviewWorkspace.service";
import { createUserWorkspace } from "../../../src/services/workspace.service";
import type { AnsweredSection } from "../../../src/topic/types";
import { createTextTask, runTextPipeline } from "../../../dist/text/orchestrator/runTextPipeline.js";
import { TEXT_ARTICLE_OUTPUT_FILE } from "../../../dist/text/constants/textFilenames.js";

loadEnv();
process.env.TEXT_ARTICLE_STUB = "1";

const FIXTURE: AnsweredSection[] = [
  {
    name: "基本档案",
    qa: [
      { q: "您怎么称呼？", a: "陈建国" },
      { q: "哪年出生？", a: "1965年3月" },
    ],
  },
  {
    name: "小学",
    qa: [{ q: "在哪里读小学？", a: "成都市城关第一小学" }],
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
  const userId = `text-pipeline-test-${Date.now()}`;
  createUserWorkspace(userId);
  const interview = createInterview(userId, { title: "文本流水线测试" });
  const scope = { userId, interviewId: interview.id };
  seedCommittedSections(scope, FIXTURE);

  const handle = createTextTask(scope);
  check("create text task meta", fs.existsSync(handle.paths.metaPath));

  const result = await runTextPipeline(scope, {
    taskId: handle.taskId,
    mode: "stub",
  });

  check("pipeline success", result.status === "success");
  check("tx_article in results", result.stepResults.some((r) => r.stepId === "tx_article"));

  const articlePath = path.join(handle.paths.outputDir, TEXT_ARTICLE_OUTPUT_FILE);
  check("article file written", fs.existsSync(articlePath));
  if (fs.existsSync(articlePath)) {
    const raw = JSON.parse(fs.readFileSync(articlePath, "utf-8")) as {
      article?: string;
      videoCostEstimate?: { tierCount?: number; estimatedUsd?: number };
    };
    check("article non-empty", typeof raw.article === "string" && raw.article.trim().length > 0);
    check(
      "video cost estimate written",
      raw.videoCostEstimate?.tierCount === 1 && raw.videoCostEstimate?.estimatedUsd === 0.4,
      raw.videoCostEstimate,
    );
  }

  const snapshotPath = path.join(handle.paths.inputDir, "sections-snapshot.json");
  check("sections snapshot written", fs.existsSync(snapshotPath));

  if (failed > 0) {
    console.error(`\ntest:text:article FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:text:article OK (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
