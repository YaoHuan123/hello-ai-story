/**
 * Tier2 选题功能集成测试（打真实 LLM，不 mock）。
 *
 * 运行：`npm run test:topic:tier2`
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
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，Tier2 选题集成测试需真实 LLM。");
    process.exit(0);
  }

  const { recommendTier2 } = await import("../../../src/topic/recommendTier2");
  const { loadTopics } = await import("../../../src/topic/catalog");

  const catalog = loadTopics();
  const inCatalog = (name: string): boolean => catalog.some((t) => t.name === name);

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
  ];

  console.log("\n=== 场景 1：基本档案 → 返回 1～6 条候选 ===");
  const picks = await recommendTier2({ sections, maxPicks: 6 });
  console.log("  picks:", JSON.stringify(picks));
  check("条数在 1～6", picks.length >= 1 && picks.length <= 6, picks.length);
  check("无重复 name", new Set(picks.map((p) => p.name)).size === picks.length);
  check(
    "均在配置模板内",
    picks.every((p) => inCatalog(p.name)),
    picks.map((p) => p.name),
  );
  check(
    "字段完整",
    picks.every(
      (p) =>
        !!p.reason &&
        ["high", "medium", "low"].includes(p.confidence),
    ),
  );

  console.log("\n=== 场景 2：空 sections 应报错 ===");
  let threw = false;
  try {
    await recommendTier2({ sections: [] });
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
