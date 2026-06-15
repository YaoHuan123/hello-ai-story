/**
 * 鲁迅生平 · 两接口真实访谈（真实 LLM）。
 *
 * 仅通过最外层两个接口驱动整段访谈：
 *   - `getCurrentQuestion(scope)`：读当前题（选主题 or 普通问答）
 *   - `submit(scope, { key, text, value })`：交（选主题标题 / 答案）
 *
 * 「用户」由 LLM 扮演鲁迅本人，依据公开生平资料以第一人称作答；
 * 出题侧（prep / refine / extend）与选题侧均为真实 LLM。
 *
 * 产物写入 `backend/data/trace/luxun-2api-{timestamp}/`：
 *   - transcript.json：逐步问答记录
 *   - sections.json：访谈结束时合并到「已答」的小节
 *
 * 运行：`npm run test:interview:luxun`
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

/** 边界（控制真实 LLM 调用规模与时长）。 */
const MAX_TOPICS = 3; // 最多完成几个主题
const MAX_STEPS = 80; // 总步数硬上限
const MAX_ANSWERS = 30; // 总作答题数硬上限

function formatRunId(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `luxun-2api-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours(),
  )}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，鲁迅两接口访谈需真实 LLM。");
    process.exit(0);
  }

  const { seedCommittedSections, getSections } = await import(
    "../../../src/services/answeredSections.service"
  );
  const { getInterviewRootDir } = await import("../../../src/services/interviewWorkspace.service");
  const { luxunSections } = await import("../../fixtures/sections.luxun");
  const { writeCurrentStage } = await import("../../../src/services/topicSelection.service");
  const { chatJson } = await import("../../../src/topic/llm");
  const { getCurrentStage, getCurrentQuestion, submit, SELECT_TOPIC_KEY } = await import(
    "../../../src/services/interviewOrchestrator.service"
  );
  const { setupUserWithInterview } = await import("../../fixtures/interviewScope");

  const startedAt = new Date();
  const runId = formatRunId(startedAt);
  const traceDir = path.resolve(process.cwd(), "data", "trace", runId);
  fs.mkdirSync(traceDir, { recursive: true });

  // 鲁迅生平参考资料：仅以「基本档案」作为开场已知信息，其余由访谈逐步采集。
  const bio = luxunSections();
  const knownProfile = bio.filter((s) => s.name === "基本档案");

  const TEST_USER = `interview-luxun-${startedAt.getTime()}`;
  const scope = setupUserWithInterview(TEST_USER);
  seedCommittedSections(scope, knownProfile);
  writeCurrentStage(scope, 1);

  console.log("\n=== 鲁迅 · 两接口真实访谈 ===");
  console.log("  traceDir:", traceDir);
  console.log("  userId:", TEST_USER);
  console.log("  interviewId:", scope.interviewId);
  console.log("  起始阶段:", getCurrentStage(scope).tier);

  /** LLM 扮演鲁迅作答：给定问句（及备选）返回第一人称答案。 */
  async function answerAsLuxun(question: string, options: string[]): Promise<string> {
    const sys = [
      "你现在扮演周树人（笔名鲁迅）本人，正在接受一次口述传记访谈。",
      "请依据下列公开生平资料，用第一人称、口语化、简洁真实地回答提问（1～3 句）。",
      "资料未覆盖的细节，可在不与史实冲突的前提下合理补充，但不要杜撰重大事实。",
      "只输出 JSON：{\"answer\": \"……\"}。",
      `生平资料：${JSON.stringify(bio)}`,
    ].join("\n");
    const user = options.length
      ? `问题：${question}\n（参考备选，可选用也可自述）：${JSON.stringify(options)}`
      : `问题：${question}`;
    const out = await chatJson<{ answer?: string }>([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);
    const answer = (out.answer ?? "").trim();
    return answer || "（暂无可述）";
  }

  type Step = {
    step: number;
    phase: "topic" | "normal";
    title: string | null;
    key: string;
    text: string;
    options: string[];
    submitted: string;
  };
  const transcript: Step[] = [];

  let topicsCompleted = 0;
  let answers = 0;
  let lastTitle: string | null = null;

  let stopReason = "达到步数上限";
  for (let step = 1; step <= MAX_STEPS; step++) {
    let q;
    try {
      q = await getCurrentQuestion(scope);
    } catch (err) {
      // LLM 偶发坏输出（如 EXTEND_INVALID）不中断整段访谈，记录后优雅结束。
      stopReason = `getCurrentQuestion 出错：${err instanceof Error ? err.message : String(err)}`;
      console.warn(`  [warn] ${stopReason}`);
      break;
    }

    if (q.type === "topic") {
      // 上一主题若已完成（标题从有到无）记一次
      if (lastTitle) {
        topicsCompleted += 1;
        console.log(`  ✓ 主题「${lastTitle}」已完成并合并\n`);
        lastTitle = null;
      }
      if (q.options.length === 0) {
        stopReason = "无更多候选主题";
        console.log(`  （${stopReason}，访谈结束）`);
        break;
      }
      if (topicsCompleted >= MAX_TOPICS) {
        stopReason = `已完成 ${topicsCompleted} 个主题（达到上限）`;
        console.log(`  （${stopReason}，结束）`);
        break;
      }
      const chosen = q.options[0]!;
      console.log(`[步骤 ${step}] 选主题：候选 ${JSON.stringify(q.options)} → 选「${chosen}」`);
      transcript.push({
        step,
        phase: "topic",
        title: null,
        key: q.key,
        text: q.text,
        options: q.options,
        submitted: chosen,
      });
      await submit(scope, { key: SELECT_TOPIC_KEY, text: q.text, value: chosen });
      continue;
    }

    // 普通问答
    lastTitle = q.title;
    const answer = await answerAsLuxun(q.text, q.options);
    answers += 1;
    console.log(`[步骤 ${step}] [${q.title}] 问：${q.text}`);
    if (q.options.length) console.log(`            备选：${JSON.stringify(q.options)}`);
    console.log(`            答：${answer}`);
    transcript.push({
      step,
      phase: "normal",
      title: q.title,
      key: q.key,
      text: q.text,
      options: q.options,
      submitted: answer,
    });
    await submit(scope, { key: q.key, text: q.text, value: answer });

    if (answers >= MAX_ANSWERS) {
      stopReason = `已作答 ${answers} 题（达到上限）`;
      console.log(`  （${stopReason}，结束）`);
      break;
    }
  }

  const finalSections = getSections(scope);
  fs.writeFileSync(
    path.join(traceDir, "transcript.json"),
    JSON.stringify(transcript, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(traceDir, "sections.json"),
    JSON.stringify(finalSections, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(traceDir, "meta.json"),
    JSON.stringify(
      {
        userId: TEST_USER,
        interviewId: scope.interviewId,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        steps: transcript.length,
        answers,
        topicsCompleted,
        stopReason,
        interviewRoot: getInterviewRootDir(scope),
      },
      null,
      2,
    ),
    "utf-8",
  );

  console.log("\n=== 访谈完成 ===");
  console.log(`  结束原因：${stopReason}`);
  console.log(`  步数：${transcript.length}，作答：${answers} 题，完成主题：${topicsCompleted} 个`);
  console.log("  合并到「已答」的小节：");
  for (const s of finalSections) {
    console.log(`    · ${s.name}（${s.qa.length} 问）`);
  }
  console.log("  产物目录：", traceDir);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
