/**
 * Tier3 创意主题选题集成测试（打真实 LLM）。
 *
 * 运行：`npm run test:topic:tier3`
 */
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

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，Tier3 集成测试需真实 LLM。");
    process.exit(0);
  }

  const { recommendTier3 } = await import("../../../src/topic/recommendTier3");
  const { loadTopics } = await import("../../../src/topic/catalog");

  const catalogNames = new Set(loadTopics().map((t) => t.name));

  const sections = [
    {
      name: "基本档案",
      qa: [
        { q: "怎么称呼你？", a: "张建国" },
        { q: "你是几几年几月出生的？", a: "1958-07" },
        { q: "你的最高学历是？", a: "高中" },
        { q: "你现在已婚吗？", a: "是" },
        { q: "你有子女吗？", a: "有" },
        { q: "你出生在哪个城市或地区？", a: "湖南长沙" },
      ],
    },
    {
      name: "小学",
      qa: [
        { q: "关于你的小学，入学时间是？", a: "1965-09" },
        { q: "班主任或印象最深老师是？", a: "李老师" },
      ],
    },
  ];

  console.log("\n=== 场景 1：已有多节档案 → 返回创意主题 ===");
  const picks = await recommendTier3({ sections, maxPicks: 5 });
  console.log("  picks:", JSON.stringify(picks, null, 2));
  check("条数在 1～5", picks.length >= 1 && picks.length <= 5, picks.length);
  check("无重复 title", new Set(picks.map((p) => p.title)).size === picks.length);
  check(
    "字段完整",
    picks.every(
      (p) =>
        p.title.trim().length > 0 &&
        p.reason.trim().length > 0 &&
        p.questions.length >= 1 &&
        p.questions.length <= 3 &&
        p.questions.every((q) => q.trim().length > 0),
    ),
  );
  check(
    "title 不是裸 catalog 子类名",
    picks.every((p) => !catalogNames.has(p.title)),
    picks.map((p) => p.title),
  );

  console.log("\n=== 场景 2：空 sections 应报错 ===");
  let threw = false;
  try {
    await recommendTier3({ sections: [] });
  } catch (e) {
    threw = /TOPIC_MISSING_INPUT/.test(e instanceof Error ? e.message : String(e));
  }
  check("sections 为空抛 TOPIC_MISSING_INPUT", threw);

  console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[ERROR] 集成测试异常：", e);
  process.exit(1);
});
