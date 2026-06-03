/**
 * Tier1 选题功能集成测试（打真实 LLM，不 mock）。
 *
 * 运行：在 backend 目录执行 `npm run test:topic`
 * 前置：backend/.env 配置 OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL。
 *       未配置 OPENAI_API_KEY 时跳过（退出码 0）。
 *
 * 覆盖：
 *  1. 基本档案 → 返回一个候选内话题，字段合法
 *  2. sections 为空 → 抛 TOPIC_MISSING_INPUT
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
    console.warn("[SKIP] 未配置 OPENAI_API_KEY，Tier1 选题集成测试需真实 LLM。");
    process.exit(0);
  }

  // 动态导入：config 在导入时会校验 OPENAI_* 必填，放在 key 检查之后给出更友好的提示。
  const { recommendTier1 } = await import("../../../src/topic/recommendTier1");
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

  // 场景 1：基本档案 → 合法推荐
  console.log("\n=== 场景 1：基本档案推荐 ===");
  const pick1 = await recommendTier1({ sections });
  console.log("  pick:", JSON.stringify(pick1));
  check("返回话题在配置模板候选内", inCatalog(pick1.name), pick1);
  check(
    "confidence 合法",
    ["high", "medium", "low"].includes(pick1.confidence),
    pick1.confidence,
  );
  check("reason 非空", pick1.reason.trim().length > 0);

  // 场景 2：sections 为空 → 抛错
  console.log("\n=== 场景 2：空输入应报错 ===");
  let threw = false;
  try {
    await recommendTier1({ sections: [] });
  } catch (e) {
    threw = /TOPIC_MISSING_INPUT/.test(e instanceof Error ? e.message : String(e));
  }
  check("sections 为空抛 TOPIC_MISSING_INPUT", threw);

  console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[ERROR] 集成测试异常：", e);
  process.exit(1);
});
