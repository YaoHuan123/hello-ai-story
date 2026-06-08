/**
 * 鲁迅生平 · tier1→8 全档 trace 集成测试（真实 LLM）。
 *
 * 每档：接口1 getPendingTopics → 接口2 getTopicQuestions（仅首条）→ 复制 tier{N}.json
 * 产物写入 `backend/data/trace/luxun-{timestamp}/`。
 *
 * 运行：`npm run test:topic:luxun:trace`
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { setupUserWithInterview } from "../../fixtures/interviewScope";
import { testUserId } from "../../helpers/testAccount";
import { getInterviewRootDir } from "../../../src/services/interviewWorkspace.service";

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

function padTier(n: number): string {
  return String(n).padStart(2, "0");
}

function writeJson(dir: string, name: string, data: unknown): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), "utf-8");
}

function copyIfExists(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function formatRunId(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `luxun-${y}${m}${day}-${h}${min}${s}`;
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，鲁迅全档 trace 测试需真实 LLM。");
    process.exit(0);
  }

  const startedAt = new Date();
  const runId = formatRunId(startedAt);
  const traceDir = path.resolve(process.cwd(), "data", "trace", runId);
  const persistenceDir = path.join(traceDir, "persistence");

  const { luxunSections } = await import("../../fixtures/sections.luxun");
  const { pendingPath } = await import("../../../src/topic/tierPending");
  const { OPENAI_MODEL } = await import("../../../src/config");
  const {
    getCurrentStage,
    advanceStage,
    getPendingTopics,
    getTopicQuestions,
    writeCurrentStage,
  } = await import("../../../src/services/topicSelection.service");

  const TEST_USER = testUserId("topic-luxun-trace");
  const sections = luxunSections();

  fs.mkdirSync(traceDir, { recursive: true });
  writeJson(traceDir, "input-sections.json", sections);
  const scope = setupUserWithInterview(TEST_USER);
  writeJson(traceDir, "meta.json", {
    userId: TEST_USER,
    interviewId: scope.interviewId,
    startedAt: startedAt.toISOString(),
    openaiModel: OPENAI_MODEL,
    traceDir,
  });

  writeCurrentStage(scope, 1);

  const selectionDir = path.join(getInterviewRootDir(scope), "选题");
  console.log("\n=== 鲁迅全档 trace ===");
  console.log("  traceDir:", traceDir);
  console.log("  userId:", TEST_USER);
  console.log("  interviewId:", scope.interviewId);

  const tiers = [1, 2, 3, 4, 5, 6, 7, 8] as const;

  for (const tier of tiers) {
    const tierDir = path.join(traceDir, `tier${padTier(tier)}`);
    console.log(`\n=== Tier${tier} ===`);

    const stage = getCurrentStage(scope);
    check(`当前阶段为 tier${tier}`, stage.tier === tier, stage);

    const picks = await getPendingTopics(scope, sections);
    writeJson(tierDir, "api1-getPendingTopics.json", picks);
    console.log(`  api1: ${picks.length} pick(s)`);

    if (picks.length > 0) {
      const first = picks[0];
      const questionSet = getTopicQuestions(scope, first.title);
      writeJson(tierDir, "api2-getTopicQuestions.json", {
        title: first.title,
        questionSet,
      });
      console.log(`  api2: ${first.title}`);
    } else {
      writeJson(tierDir, "api2-getTopicQuestions.json", {
        skipped: true,
        reason: "no picks from getPendingTopics",
      });
      console.warn(`  api2: skipped (no picks)`);
    }

    const pendingFile = pendingPath(scope);
    const destTier = path.join(persistenceDir, `tier${tier}.json`);
    if (copyIfExists(pendingFile, destTier)) {
      check(`persistence/tier${tier}.json 已复制（来自 pending.json）`, true);
    } else {
      writeJson(persistenceDir, `tier${tier}.missing.json`, {
        expectedPath: pendingFile,
        reason: "pending.json not found after getPendingTopics",
      });
      check(`persistence/tier${tier}.json 存在`, false, pendingFile);
    }

    if (tier < 8) {
      const next = advanceStage(scope);
      check(`advance → tier${tier + 1}`, next.tier === tier + 1, next);
    }
  }

  const stagePath = path.join(selectionDir, "current-stage.json");
  copyIfExists(stagePath, path.join(persistenceDir, "current-stage.json"));
  check("末档 current-stage 为 tier8", getCurrentStage(scope).tier === 8);

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  console.log("  trace 目录:", traceDir);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
