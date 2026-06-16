/**
 * 方案 A：locale 原生输出与 legacy MT 判定。
 *
 * 运行：`npm run test:interview:output-locale`
 */
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
  const { shouldUseLegacyDisplayTranslation, appendLocaleOutputRules } = await import(
    "../../../src/content/interviewOutputLocale"
  );
  const { gapQuestionText, contradictionQuestionFallback } = await import(
    "../../../src/topic/materialCopy"
  );

  console.log("\n=== shouldUseLegacyDisplayTranslation ===");
  check("zh + 中文问句不 legacy", shouldUseLegacyDisplayTranslation("你女儿小名叫什么？", "zh") === false);
  check("zh + 一一不 legacy", shouldUseLegacyDisplayTranslation("一一", "zh") === false);
  check("zh + 英文 legacy", shouldUseLegacyDisplayTranslation("What is your name?", "zh") === true);
  check("en 不 legacy", shouldUseLegacyDisplayTranslation("What is your name?", "en") === false);

  console.log("\n=== materialCopy locale fallback ===");
  check("gap zh", gapQuestionText("关键时间", "zh").includes("关键时间"));
  check("contradiction zh", contradictionQuestionFallback("摘要", "zh").startsWith("请说明"));

  console.log("\n=== appendLocaleOutputRules ===");
  check("zh rules 含 outputLocale", appendLocaleOutputRules("base", "zh").includes("outputLocale"));
  check("zh rules 含 一一", appendLocaleOutputRules("base", "zh").includes("一一"));

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
