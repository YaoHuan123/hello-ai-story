/**
 * 调度层 + 已答 + 出题器集成测试（基本档案无 LLM）。
 *
 * 运行：`npm run test:interview:orchestrator`
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

const TEST_USER = `interview-orch-${Date.now()}`;

function topicDir(root: string): string {
  return path.join(root, "出题");
}

async function main(): Promise<void> {
  const { createUserWorkspace, getUserRootDir } = await import(
    "../../../src/services/workspace.service"
  );
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
  const { writeTierPending } = await import("../../../src/topic/tierPending");
  const { readPrep, readAnswers, writePrep } = await import("../../../src/question/topicPersist");

  createUserWorkspace(TEST_USER);
  seedCommittedSections(TEST_USER, stubSections());
  const userRoot = getUserRootDir(TEST_USER);

  const title = "基本档案";
  const questionSet = {
    title,
    tier: 1 as const,
    kind: "catalog" as const,
    questions: ["怎么称呼你？", "你是几几年几月出生的？"],
  };

  const questionEngine = await import("../../../src/services/questionEngine.service");

  console.log("\n=== 答题循环（submit → getNext → commit）===");
  questionEngine.initQuestion(TEST_USER, questionSet);

  check(
    "落盘 questionSet + answers",
    fs.existsSync(path.join(topicDir(userRoot), "questionSet.json")) &&
      fs.existsSync(path.join(topicDir(userRoot), "answers.json")),
  );

  let current = await getNextQuestion(TEST_USER);
  check("第 1 题", current?.text === "怎么称呼你？", current);

  submitAnswer(TEST_USER, {
    key: current!.key,
    questionText: current!.text,
    answer: "张建国",
  });
  check("answers 1 条", readAnswers(TEST_USER).length === 1);

  current = await getNextQuestion(TEST_USER);
  check("提交后仍有第 2 题", current?.key === "你是几几年几月出生的？", current);

  let rejectedDuplicate = false;
  try {
    submitAnswer(TEST_USER, { key: "怎么称呼你？", questionText: "x", answer: "y" });
  } catch (err) {
    rejectedDuplicate = err instanceof Error && err.message.includes("DUPLICATE");
  }
  check("重复提交被拒（DUPLICATE）", rejectedDuplicate);
  check("被拒后 answers 仍 1 条", readAnswers(TEST_USER).length === 1);

  submitAnswer(TEST_USER, {
    key: current!.key,
    questionText: current!.text,
    answer: "1958-07",
  });

  current = await getNextQuestion(TEST_USER);
  check("本节无下一题", current === null, current);

  let rejectedComplete = false;
  try {
    submitAnswer(TEST_USER, { key: "任意", questionText: "x", answer: "y" });
  } catch (err) {
    rejectedComplete = err instanceof Error && err.message.includes("COMPLETE");
  }
  check("答完后再提交被拒（COMPLETE）", rejectedComplete);

  commitTopic(TEST_USER);

  const sections = getSections(TEST_USER);
  const basic = sections.find((s) => s.name === title);
  check("commit 后 sections 含基本档案", basic?.qa.length === 2, basic);
  check("commit 后清空出题器目录", !fs.existsSync(path.join(topicDir(userRoot), "questionSet.json")));

  console.log("\n=== getPendingTopics + enterTopic（generated）===");
  writeCurrentStage(TEST_USER, 3);
  writeTierPending(
    TEST_USER,
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
  const picks = await getPendingTopics(TEST_USER);
  check("待选非空", picks.length > 0, picks);
  await enterTopic(TEST_USER, "童年趣事");
  const genViaOrch = await getNextQuestion(TEST_USER);
  check("enterTopic 后取题", genViaOrch?.text.includes("开心"), genViaOrch);
  check("generated 无 prep.json", readPrep(TEST_USER) === null);

  console.log("\n=== 两接口 getCurrentStep + submit（scan 驱动）===");
  const u2 = `${TEST_USER}-2api`;
  createUserWorkspace(u2);
  seedCommittedSections(u2, stubSections());
  writeCurrentStage(u2, 3);
  writeTierPending(
    u2,
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

  const q1 = await getCurrentQuestion(u2);
  check(
    "读=选主题题目",
    q1.type === "topic" && q1.options.includes("童年趣事"),
    q1,
  );

  submit(u2, { key: q1.key, text: q1.text, value: "童年趣事" });
  const q2 = await getCurrentQuestion(u2);
  check(
    "交(选主题)后读=普通问答",
    q2.type === "normal" && q2.title === "童年趣事" && q2.text.includes("开心"),
    q2,
  );

  submit(u2, { key: q2.key, text: q2.text, value: "考了第一名" });
  const q3 = await getCurrentQuestion(u2);
  check("交(答完唯一题)后读=回到选主题", q3.type === "topic", q3);
  check(
    "答完自动 commit 进 sections",
    getSections(u2).some((s) => s.name === "童年趣事" && s.qa.length === 1),
    getSections(u2),
  );

  console.log("\n=== 空主题（prep 去重为空）跳过而非卡死 ===");
  const uEmpty = `${TEST_USER}-empty`;
  createUserWorkspace(uEmpty);
  seedCommittedSections(uEmpty, stubSections());
  writeCurrentStage(uEmpty, 3);
  writeTierPending(
    uEmpty,
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
  questionEngine.initQuestion(uEmpty, {
    title: "小学",
    tier: 1 as const,
    kind: "catalog" as const,
    questions: ["问题A", "问题B"],
  });
  // 模拟 prep 把模板题全部去重：askQuestions 为空
  writePrep(uEmpty, {
    skipped: false,
    askQuestions: [],
    skippedQuestions: ["问题A", "问题B"],
    questionTexts: {},
    answerSuggestions: {},
  });
  const qEmpty = await getCurrentQuestion(uEmpty);
  check("空主题不抛错、回到选主题", qEmpty.type === "topic", qEmpty);
  check(
    "空主题目录已清空",
    !fs.existsSync(path.join(topicDir(getUserRootDir(uEmpty)), "questionSet.json")),
  );

  console.log("\n=== 非 catalog：跳过 prep ====");
  const user2 = `${TEST_USER}-gen`;
  createUserWorkspace(user2);
  seedCommittedSections(user2, stubSections());
  const genTitle = "童年趣事";
  questionEngine.initQuestion(user2, {
    title: genTitle,
    tier: 3 as const,
    kind: "generated" as const,
    questions: ["你小时候最开心的一件事是什么？"],
  });
  const genQ = await questionEngine.getNextQuestion(user2);
  check("generated 直接出题", genQ?.text.includes("开心"), genQ);
  check("generated 仍无 prep", readPrep(user2) === null);

  if (process.env.OPENAI_API_KEY?.trim()) {
    console.log("\n=== enterTopic 小学（LLM 仅取第 1 题）===");
    const user3 = `${TEST_USER}-llm`;
    createUserWorkspace(user3);
    seedCommittedSections(user3, stubSections());
    writeCurrentStage(user3, 1);
    writeTierPending(
      user3,
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
    await enterTopic(user3, "小学");
    const first = await getNextQuestion(user3);
    check("小学第 1 题非空", (first?.text.length ?? 0) > 0, first);
    check("小学有 prep.json", fs.existsSync(path.join(getUserRootDir(user3), "出题", "prep.json")));
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
