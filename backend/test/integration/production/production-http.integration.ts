/**
 * 成片 / 文本生产 HTTP 集成测试（stub 模式，无需 LLM）。
 *
 * 运行：`npm run build && npm run test:production:http`
 */
import jwt from "jsonwebtoken";
import { config as loadEnv } from "dotenv";
import type { Server } from "node:http";
import { createApp } from "../../../dist/app.js";
import { JWT_EXPIRES_IN, JWT_SECRET } from "../../../dist/config.js";
import { initDb } from "../../../dist/db/init.js";
import { seedCommittedSections } from "../../../dist/services/answeredSections.service.js";
import { createInterview } from "../../../dist/services/interviewWorkspace.service.js";
import { createUserWorkspace, getUserRootDir } from "../../../dist/services/workspace.service.js";
import { AuthService } from "../../../dist/services/auth/auth.service.js";
import { AliyunSmsService } from "../../../dist/services/auth/aliyunSms.service.js";
import { AuthAuditLogService } from "../../../dist/services/auth/authAuditLog.service.js";
import { SmsRateLimitService } from "../../../dist/services/auth/smsRateLimit.service.js";
import type { AnsweredSection } from "../../../dist/topic/types.js";

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

function authHeader(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function main(): Promise<void> {
  const db = initDb();
  const authService = new AuthService(
    db,
    new AliyunSmsService(),
    new SmsRateLimitService(db),
    new AuthAuditLogService(db),
  );
  const app = createApp(db, authService);

  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s));
    s.on("error", reject);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const userId = `prod-http-${Date.now()}`;
  const phone = `138${String(Date.now()).slice(-8)}`;
  createUserWorkspace(userId);
  const dataDir = getUserRootDir(userId);
  db.prepare("INSERT INTO users (id, phone, data_dir, token_version) VALUES (?, ?, ?, 1)").run(
    userId,
    phone,
    dataDir,
  );
  const token = jwt.sign({ userId, phone, tv: 1 }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });

  const interview = createInterview(userId, { title: "HTTP 生产测试" });
  const interviewId = interview.id;
  seedCommittedSections({ userId, interviewId }, FIXTURE);
  const prodBase = `${base}/api/interviews/${interviewId}`;

  try {
    console.log("\n=== 未登录 → 401 ===");
    const unauth = await fetch(`${prodBase}/text/tasks`);
    check("GET /text/tasks without token → 401", unauth.status === 401);

    console.log("\n=== 生产就绪 & 配置 ===");
    const readiness = await fetch(`${prodBase}/production/readiness`, { headers: authHeader(token) });
    const readinessBody = (await readiness.json()) as {
      ready?: boolean;
      usableSectionCount?: number;
      hasStoryText?: boolean;
    };
    check(
      "GET /production/readiness → ready",
      readiness.status === 200 && readinessBody.ready === true && (readinessBody.usableSectionCount ?? 0) >= 1,
    );
    check(
      "readiness hasStoryText false before text",
      readinessBody.hasStoryText === false,
    );

    const styles = await fetch(`${base}/api/production/video-styles`, { headers: authHeader(token) });
    const stylesBody = (await styles.json()) as { styles?: Array<{ id: string }>; selectedStyleId?: string };
    check(
      "GET /api/production/video-styles",
      styles.status === 200 && (stylesBody.styles?.length ?? 0) >= 1 && !!stylesBody.selectedStyleId,
    );

    console.log("\n=== 文本生产（同步） ===");
    const createText = await fetch(`${prodBase}/text/tasks`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ mode: "stub" }),
    });
    const createTextBody = (await createText.json()) as {
      taskId?: string;
      status?: string;
      articlePath?: string;
    };
    check("POST /text/tasks → 201", createText.status === 201, createTextBody);
    const textTaskId = createTextBody.taskId ?? "";

    const listText = await fetch(`${prodBase}/text/tasks`, { headers: authHeader(token) });
    const listTextBody = (await listText.json()) as { tasks?: Array<{ taskId: string }> };
    check("GET /text/tasks lists task", listText.status === 200 && (listTextBody.tasks?.length ?? 0) >= 1);

    const textProgress = await fetch(`${prodBase}/text/tasks/${textTaskId}`, {
      headers: authHeader(token),
    });
    check("GET /text/tasks/:taskId → 200", textProgress.status === 200);

    const article = await fetch(`${prodBase}/text/tasks/${textTaskId}/article`, {
      headers: authHeader(token),
    });
    const articleBody = (await article.json()) as { article?: string };
    check(
      "GET /text/tasks/:taskId/article returns article",
      article.status === 200 && typeof articleBody.article === "string" && articleBody.article.length > 0,
    );

    const readinessAfterText = await fetch(`${prodBase}/production/readiness`, { headers: authHeader(token) });
    const readinessAfterTextBody = (await readinessAfterText.json()) as {
      hasStoryText?: boolean;
      storyTextTasks?: Array<{ taskId: string }>;
    };
    check("readiness hasStoryText true after text", readinessAfterTextBody.hasStoryText === true);
    check(
      "readiness lists story text task",
      (readinessAfterTextBody.storyTextTasks?.length ?? 0) >= 1 &&
        readinessAfterTextBody.storyTextTasks?.some((t) => t.taskId === textTaskId),
    );

    const textArtifacts = await fetch(`${prodBase}/text/tasks/${textTaskId}/artifacts`, {
      headers: authHeader(token),
    });
    const textArtifactsBody = (await textArtifacts.json()) as { article?: { available?: boolean } };
    check(
      "GET /text/tasks/:taskId/artifacts",
      textArtifacts.status === 200 && textArtifactsBody.article?.available === true,
    );

    const textArtifactFile = await fetch(`${prodBase}/text/tasks/${textTaskId}/artifacts/file`, {
      headers: authHeader(token),
    });
    check("GET /text/tasks/:taskId/artifacts/file → 200", textArtifactFile.status === 200);

    console.log("\n=== 视频任务（异步入队） ===");
    const scheduleBio = await fetch(`${prodBase}/video/biography`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({
        styleId: stylesBody.selectedStyleId,
        textTaskId,
        polishMode: "stub",
      }),
    });
    const bioBody = (await scheduleBio.json()) as { taskId?: string; status?: string };
    check("POST /video/biography → 202", scheduleBio.status === 202, bioBody);
    const videoTaskId = bioBody.taskId ?? "";

    const listVideo = await fetch(`${prodBase}/video/tasks`, { headers: authHeader(token) });
    const listVideoBody = (await listVideo.json()) as { tasks?: Array<{ taskId: string }> };
    check("GET /video/tasks lists task", listVideo.status === 200 && (listVideoBody.tasks?.length ?? 0) >= 1);

    const videoProgress = await fetch(`${prodBase}/video/tasks/${videoTaskId}`, {
      headers: authHeader(token),
    });
    check("GET /video/tasks/:taskId → 200", videoProgress.status === 200);

    const videoArtifacts = await fetch(`${prodBase}/video/tasks/${videoTaskId}/artifacts`, {
      headers: authHeader(token),
    });
    check("GET /video/tasks/:taskId/artifacts → 200", videoArtifacts.status === 200);

    const videoPrimary = await fetch(`${prodBase}/video/tasks/${videoTaskId}/video`, {
      headers: authHeader(token),
    });
    check("GET /video/tasks/:taskId/video → 404 when not rendered", videoPrimary.status === 404);

    const retryNotFailed = await fetch(`${prodBase}/video/tasks/${videoTaskId}/retry`, {
      method: "POST",
      headers: authHeader(token),
    });
    check("POST retry on queued task → 409", retryNotFailed.status === 409);

    const deleteVideo = await fetch(`${prodBase}/video/tasks/${videoTaskId}`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    check("DELETE /video/tasks/:taskId → 204", deleteVideo.status === 204);

    const listVideoAfterDelete = await fetch(`${prodBase}/video/tasks`, { headers: authHeader(token) });
    const listVideoAfterDeleteBody = (await listVideoAfterDelete.json()) as { tasks?: Array<{ taskId: string }> };
    check(
      "GET /video/tasks after delete",
      listVideoAfterDelete.status === 200 &&
        !listVideoAfterDeleteBody.tasks?.some((t) => t.taskId === videoTaskId),
    );

    const deleteText = await fetch(`${prodBase}/text/tasks/${textTaskId}`, {
      method: "DELETE",
      headers: authHeader(token),
    });
    check("DELETE /text/tasks/:taskId → 204", deleteText.status === 204);

    const readinessAfterDelete = await fetch(`${prodBase}/production/readiness`, { headers: authHeader(token) });
    const readinessAfterDeleteBody = (await readinessAfterDelete.json()) as { hasStoryText?: boolean };
    check("readiness hasStoryText false after text delete", readinessAfterDeleteBody.hasStoryText === false);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  if (failed > 0) {
    console.error(`\ntest:production:http FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:production:http OK (${passed} checks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
