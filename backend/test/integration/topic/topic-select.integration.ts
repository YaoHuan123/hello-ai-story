/**
 * 统一选题入口集成测试（打真实 LLM）。
 *
 * 验证 selectTopics 在 tier 1/2/3/4 下输出 PendingPickRow（pick + 可选题面）。
 * 运行：`npm run test:topic:select`
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

type AnyRow = {
  pick: {
    tier: number;
    kind: string;
    title?: unknown;
    reason?: unknown;
  };
  questions?: unknown;
  suggestedAnswers?: unknown;
};

function checkCommonShape(prefix: string, rows: AnyRow[], expectTier: number): void {
  check(`${prefix} 非空数组`, Array.isArray(rows) && rows.length >= 1, rows);
  check(
    `${prefix} pick 公共字段齐全`,
    rows.every(
      (r) =>
        r.pick.tier === expectTier &&
        (r.pick.kind === "catalog" ||
          r.pick.kind === "generated" ||
          r.pick.kind === "hot_topic") &&
        typeof r.pick.title === "string" &&
        (r.pick.title as string).trim().length > 0 &&
        typeof r.pick.reason === "string" &&
        (r.pick.reason as string).trim().length > 0,
    ),
    rows,
  );
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，统一选题集成测试需真实 LLM。");
    process.exit(0);
  }

  const { selectTopics } = await import("../../../src/topic/selectTopics");

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

  console.log("\n=== Tier1：单条 catalog ===");
  const t1 = (await selectTopics({ tier: 1, sections })) as AnyRow[];
  console.log("  ", JSON.stringify(t1));
  checkCommonShape("Tier1", t1, 1);
  check("Tier1 长度为 1", t1.length === 1, t1.length);
  check("Tier1 为 catalog", t1.every((r) => r.pick.kind === "catalog"), t1);

  console.log("\n=== Tier2：catalog 列表 ===");
  const t2 = (await selectTopics({ tier: 2, sections, maxPicks: 4 })) as AnyRow[];
  console.log("  ", JSON.stringify(t2));
  checkCommonShape("Tier2", t2, 2);
  check("Tier2 条数 ≤ 4", t2.length <= 4, t2.length);
  check("Tier2 均为 catalog", t2.every((r) => r.pick.kind === "catalog"), t2);

  console.log("\n=== Tier3：generated 列表 ===");
  const t3 = (await selectTopics({ tier: 3, sections, maxPicks: 4 })) as AnyRow[];
  console.log("  ", JSON.stringify(t3));
  checkCommonShape("Tier3", t3, 3);
  check(
    "Tier3 均为 generated 且 row 带 questions(1~3)",
    t3.every(
      (r) =>
        r.pick.kind === "generated" &&
        Array.isArray(r.questions) &&
        (r.questions as unknown[]).length >= 1 &&
        (r.questions as unknown[]).length <= 3,
    ),
    t3,
  );

  console.log("\n=== Tier4：hot_topic 问句列表 ===");
  const t4 = (await selectTopics({ tier: 4, sections, maxPicks: 4 })) as AnyRow[];
  console.log("  ", JSON.stringify(t4));
  checkCommonShape("Tier4", t4, 4);
  check("Tier4 条数 ≤ 4", t4.length <= 4, t4.length);
  check(
    "Tier4 均为 hot_topic 且 title=问句",
    t4.every(
      (r) =>
        r.pick.kind === "hot_topic" &&
        typeof r.pick.title === "string" &&
        (r.pick.title as string).length > 0 &&
        (r.pick.reason as string).startsWith("生活记忆："),
    ),
    t4,
  );
  check("Tier4 问句 title 不重复", new Set(t4.map((r) => r.pick.title)).size === t4.length);

  console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[ERROR] 集成测试异常：", e);
  process.exit(1);
});
