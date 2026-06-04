/**
 * 调度层 + 已答 + 出题器集成测试（基本档案无 LLM）。
 *
 * 运行：`npm run test:interview:orchestrator`
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { InterviewScope } from "../../../src/services/interviewWorkspace.service";
import { getInterviewRootDir } from "../../../src/services/interviewWorkspace.service";
import { setupUserWithInterview } from "../../fixtures/interviewScope";

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

const TEST_USER = `interview-orch-${Date.now()}`;

function topicDir(scope: InterviewScope): string {
  return path.join(getInterviewRootDir(scope), "出题");
}

async function main(): Promise<void> {
  const { seedCommittedSections, getSections } = await import(
    "../../../src/services/answeredSections.service"
  );
  const {
    enterTopic,
    getNextQuestion,
    submitAnswer,
    commitTopic,
    getPendingTopics,
    getCurrentQuestion,
    submit,
  } = await import("../../../src/services/interviewOrchestrator.service");
  const { stubSections } = await import("../../fixtures/sections.stub");
  const { writeCurrentStage } = await import("../../../src/services/topicSelection.service");
  const { writePending } = await import("../../../src/topic/tierPending");
  const { readPrep, readAnswers, writePrep } = await import("../../../src/question/topicPersist");

  const scope = setupUserWithInterview(TEST_USER);
  seedCommittedSections(scope, stubSections());

  console.log("\n=== 新用户冷启动：无 sections → 基本档案 ===");
  const coldScope = setupUserWithInterview(`${TEST_USER}-cold`);
  const qCold0 = await getCurrentQuestion(coldScope);
  check(
    "冷启动首读=基本档案普通问答",
    qCold0.type === "normal" && qCold0.title === "基本档案" && (qCold0.text?.length ?? 0) > 0,
    qCold0,
  );
  let coldSteps = 0;
  const coldMax = 12;
  let qCold = qCold0;
  while (qCold.type === "normal" && coldSteps < coldMax) {
    submit(coldScope, { key: qCold.key, text: qCold.text, value: `冷启动答${coldSteps + 1}` });
    qCold = await getCurrentQuestion(coldScope);
    coldSteps += 1;
  }
  check("冷启动答完后回到选主题", qCold.type === "topic", qCold);
  const coldSections = getSections(coldScope);
  const coldBasic = coldSections.find((s) => s.name === "基本档案");
  check("冷启动 commit 后 sections 含基本档案 8 问", coldBasic?.qa.length === 8, coldBasic);
  check(
    "冷启动答完后清空出题器",
    !fs.existsSync(path.join(topicDir(coldScope), "questionSet.json")),
  );

  const title = "基本档案";
  const questionSet = {
    title,
    tier: 1 as const,
    kind: "catalog" as const,
    questions: ["怎么称呼你？", "你是几几年几月出生的？"],
  };

  const questionEngine = await import("../../../src/services/questionEngine.service");

  console.log("\n=== 答题循环（submit → getNext → commit）===");
  questionEngine.initQuestion(scope, questionSet);

  check(
    "落盘 questionSet + answers",
    fs.existsSync(path.join(topicDir(scope), "questionSet.json")) &&
      fs.existsSync(path.join(topicDir(scope), "answers.json")),
  );

  let current = await getNextQuestion(scope);
  check("第 1 题", current?.text === "怎么称呼你？", current);

  submitAnswer(scope, {
    key: current!.key,
    questionText: current!.text,
    answer: "张建国",
  });
  check("answers 1 条", readAnswers(scope).length === 1);

  current = await getNextQuestion(scope);
  check("提交后仍有第 2 题", current?.key === "你是几几年几月出生的？", current);

  let rejectedDuplicate = false;
  try {
    submitAnswer(scope, { key: "怎么称呼你？", questionText: "x", answer: "y" });
  } catch (err) {
    rejectedDuplicate = err instanceof Error && err.message.includes("DUPLICATE");
  }
  check("重复提交被拒（DUPLICATE）", rejectedDuplicate);
  check("被拒后 answers 仍 1 条", readAnswers(scope).length === 1);

  submitAnswer(scope, {
    key: current!.key,
    questionText: current!.text,
    answer: "1958-07",
  });

  current = await getNextQuestion(scope);
  check("本节无下一题", current === null, current);

  let rejectedComplete = false;
  try {
    submitAnswer(scope, { key: "任意", questionText: "x", answer: "y" });
  } catch (err) {
    rejectedComplete = err instanceof Error && err.message.includes("COMPLETE");
  }
  check("答完后再提交被拒（COMPLETE）", rejectedComplete);

  commitTopic(scope);

  const sections = getSections(scope);
  const basic = sections.find((s) => s.name === title);
  check("commit 后 sections 含基本档案", basic?.qa.length === 2, basic);
  check("commit 后清空出题器目录", !fs.existsSync(path.join(topicDir(scope), "questionSet.json")));

  console.log("\n=== getPendingTopics + enterTopic（generated）===");
  writeCurrentStage(scope, 3);
  writePending(
    scope,
    {
      tier: 3,
      createdAt: new Date().toISOString(),
      picks: [
        {
          pick: { tier: 3, kind: "generated", title: "童年趣事", reason: "测试" },
          questions: ["你小时候最开心的一件事是什么？"],
        },
      ],
    },
    (p, d) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(d, null, 2), "utf-8");
    },
  );
  const picks = await getPendingTopics(scope);
  check("待选非空", picks.length > 0, picks);
  await enterTopic(scope, "童年趣事");
  const genViaOrch = await getNextQuestion(scope);
  check("enterTopic 后取题", genViaOrch?.text.includes("开心") ?? false, genViaOrch);
  check("generated 无 prep.json", readPrep(scope) === null);

  console.log("\n=== 两接口 getCurrentStep + submit（scan 驱动）===");
  const scope2 = setupUserWithInterview(`${TEST_USER}-2api`);
  seedCommittedSections(scope2, stubSections());
  writeCurrentStage(scope2, 3);
  writePending(
    scope2,
    {
      tier: 3,
      createdAt: new Date().toISOString(),
      picks: [
        {
          pick: { tier: 3, kind: "generated", title: "童年趣事", reason: "测试" },
          questions: ["你小时候最开心的一件事是什么？"],
        },
      ],
    },
    (p, d) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(d, null, 2), "utf-8");
    },
  );

  const q1 = await getCurrentQuestion(scope2);
  check(
    "读=选主题题目",
    q1.type === "topic" && q1.options.includes("童年趣事"),
    q1,
  );

  submit(scope2, { key: q1.key, text: q1.text, value: "童年趣事" });
  const q2 = await getCurrentQuestion(scope2);
  check(
    "交(选主题)后读=普通问答",
    q2.type === "normal" && q2.title === "童年趣事" && (q2.text.includes("开心") ?? false),
    q2,
  );

  submit(scope2, { key: q2.key, text: q2.text, value: "考了第一名" });
  const q3 = await getCurrentQuestion(scope2);
  check("交(答完唯一题)后读=回到选主题", q3.type === "topic", q3);
  check(
    "答完自动 commit 进 sections",
    getSections(scope2).some((s) => s.name === "童年趣事" && s.qa.length === 1),
    getSections(scope2),
  );

  console.log("\n=== 空主题（prep 去重为空）跳过而非卡死 ===");
  const scopeEmpty = setupUserWithInterview(`${TEST_USER}-empty`);
  seedCommittedSections(scopeEmpty, stubSections());
  writeCurrentStage(scopeEmpty, 3);
  writePending(
    scopeEmpty,
    {
      tier: 3,
      createdAt: new Date().toISOString(),
      picks: [
        {
          pick: { tier: 3, kind: "generated", title: "童年趣事", reason: "测试" },
          questions: ["你小时候最开心的一件事是什么？"],
        },
      ],
    },
    (p, d) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(d, null, 2), "utf-8");
    },
  );
  questionEngine.initQuestion(scopeEmpty, {
    title: "小学",
    tier: 1 as const,
    kind: "catalog" as const,
    questions: ["问题A", "问题B"],
  });
  writePrep(scopeEmpty, {
    skipped: false,
    askQuestions: [],
    skippedQuestions: ["问题A", "问题B"],
    questionTexts: {},
    answerSuggestions: {},
  });
  const qEmpty = await getCurrentQuestion(scopeEmpty);
  check("空主题不抛错、回到选主题", qEmpty.type === "topic", qEmpty);
  check(
    "空主题目录已清空",
    !fs.existsSync(path.join(topicDir(scopeEmpty), "questionSet.json")),
  );

  console.log("\n=== 非 catalog：跳过 prep ====");
  const scopeGen = setupUserWithInterview(`${TEST_USER}-gen`);
  seedCommittedSections(scopeGen, stubSections());
  const genTitle = "童年趣事";
  questionEngine.initQuestion(scopeGen, {
    title: genTitle,
    tier: 3 as const,
    kind: "generated" as const,
    questions: ["你小时候最开心的一件事是什么？"],
  });
  const genQ = await questionEngine.getNextQuestion(scopeGen);
  check("generated 直接出题", genQ?.text.includes("开心") ?? false, genQ);
  check("generated 仍无 prep", readPrep(scopeGen) === null);

  if (process.env.OPENAI_API_KEY?.trim()) {
    console.log("\n=== enterTopic 小学（LLM 仅取第 1 题）===");
    const scopeLlm = setupUserWithInterview(`${TEST_USER}-llm`);
    seedCommittedSections(scopeLlm, stubSections());
    writeCurrentStage(scopeLlm, 1);
    writePending(
      scopeLlm,
      {
        tier: 1,
        createdAt: new Date().toISOString(),
        picks: [{ pick: { tier: 1, kind: "catalog", title: "小学", reason: "测试" } }],
      },
      (p, d) => {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(d, null, 2), "utf-8");
      },
    );
    await enterTopic(scopeLlm, "小学");
    const first = await getNextQuestion(scopeLlm);
    check("小学第 1 题非空", (first?.text.length ?? 0) > 0, first);
    check("小学有 prep.json", fs.existsSync(path.join(topicDir(scopeLlm), "prep.json")));
  } else {
    console.warn("\n[SKIP] 未配置 OPENAI_API_KEY，跳过小学 LLM 段。");
  }

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
