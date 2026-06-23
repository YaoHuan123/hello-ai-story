/**
 * Admin 用量聚合单测（无 DB，内存 sqlite + 临时用户目录）。
 * 用法：npm run build && npm run test:admin:usage
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildAdminUsageReport } from "../../../dist/services/adminUsage.service.js";
import { createUserWorkspace } from "../../../dist/services/workspace.service.js";
import { createInterview } from "../../../dist/services/interviewWorkspace.service.js";
import { seedCommittedSections } from "../../../dist/services/answeredSections.service.js";
import { writeVideoTaskMeta, type VideoTaskMeta } from "../../../dist/video/shared/orchestrator/videoTaskWorkspace.js";

async function main(): Promise<void> {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "admin-usage-"));
  process.env.DATA_USERS_ROOT = tmpRoot;

  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer'
    );
  `);

  const userId = "userAlphaBeta12";
  db.prepare("INSERT INTO users (id, created_at, role) VALUES (?, ?, 'viewer')").run(
    userId,
    "2026-06-01T00:00:00.000Z",
  );
  createUserWorkspace(userId);
  const interview = createInterview(userId, { locale: "en" });
  seedCommittedSections(
    { userId, interviewId: interview.id },
    [{ name: "Basic profile", qa: [{ q: "q1", a: "a1" }, { q: "q2", a: "a2" }] }],
  );

  const videoMeta: VideoTaskMeta = {
    id: "vid-task-001",
    interviewId: interview.id,
    productionMode: "biography_narration",
    status: "success",
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:01:00.000Z",
    completedSteps: ["260"],
  };
  const paths = (
    await import("../../../dist/video/shared/orchestrator/videoTaskWorkspace.js")
  ).getVideoTaskPaths({ userId, interviewId: interview.id }, videoMeta.id);
  fs.mkdirSync(paths.taskRoot, { recursive: true });
  writeVideoTaskMeta(paths, videoMeta);

  const report = buildAdminUsageReport(db);
  assert.equal(report.summary.userCount, 1);
  assert.equal(report.summary.interviewCount, 1);
  assert.equal(report.summary.answerCount, 2);
  assert.equal(report.summary.videos.total, 1);
  assert.equal(report.users[0]?.userIdShort, "userAlph");
  assert.equal(report.users[0]?.interviews[0]?.answerCount, 2);
  assert.equal(report.users[0]?.interviews[0]?.videos.success, 1);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  db.close();
  console.log("test:admin:usage OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
