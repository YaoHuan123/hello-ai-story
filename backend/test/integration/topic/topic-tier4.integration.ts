/**
 * Tier4 生活记忆热点集成测试（打真实 LLM）。
 * 运行：`npm run test:topic:tier4`
 */
import { config as loadEnv } from "dotenv";
import { loadTopics } from "../../../src/topic/catalog";

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

const catalogNames = new Set(loadTopics().map((t) => t.name));

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，Tier4 集成测试需真实 LLM。");
    process.exit(0);
  }

  const { recommendTier4 } = await import("../../../src/topic/recommendTier4");

  const sections = [
    {
      name: "基本档案",
      qa: [
        { q: "怎么称呼你？", a: "张建国" },
        { q: "你是几几年几月出生的？", a: "1958-07" },
        { q: "你出生在哪个城市或地区？", a: "湖南长沙" },
      ],
    },
  ];

  console.log("\n=== Tier4：热点问句列表 ===");
  const picks = await recommendTier4({ sections, maxPicks: 4 });
  console.log("  ", JSON.stringify(picks));
  check("条数 1～4", picks.length >= 1 && picks.length <= 4, picks.length);
  check(
    "字段完整",
    picks.every(
      (p) =>
        !!p.domainId &&
        !!p.domainName &&
        p.q.trim().length > 0 &&
        p.q.length <= 120 &&
        Array.isArray(p.suggestedAnswers) &&
        p.suggestedAnswers.length <= 4,
    ),
    picks,
  );
  check("问句不重复", new Set(picks.map((p) => p.q)).size === picks.length);
  check(
    "title 语义：q 不是裸 catalog 名",
    picks.every((p) => !catalogNames.has(p.q) || p.q.length > 6),
    picks.map((p) => p.q),
  );

  console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[ERROR] 集成测试异常：", e);
  process.exit(1);
});
