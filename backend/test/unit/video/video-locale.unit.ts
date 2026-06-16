/**
 * 视频 LLM 入参 outputLocale 单测（无 LLM）。
 * 用法：npm run test:video:locale
 */
import { videoPipelineJsonForTest } from "../../../dist/video/shared/llm/localeLlm.js";
import { extractEnvLocationFromText, extractEnvTimeFromText } from "../../../dist/video/shared/envSceneExtract.js";

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  [ok] ${label}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${label}`, detail ?? "");
  }
}

function main() {
  const zhJson = videoPipelineJsonForTest({ sections: [{ name: "Basic profile" }] }, "zh");
  const zhParsed = JSON.parse(zhJson) as { outputLocale?: string; sections?: unknown[] };
  check("zh outputLocale", zhParsed.outputLocale === "zh", zhParsed);
  check("sections 保留", Array.isArray(zhParsed.sections) && zhParsed.sections.length === 1, zhParsed);

  const enJson = videoPipelineJsonForTest({ foo: "bar" }, "en");
  check("en outputLocale", (JSON.parse(enJson) as { outputLocale?: string }).outputLocale === "en");

  check(
    "英文 timeLabel",
    extractEnvTimeFromText("In March 1998, at Beijing University", "fallback") === "March 1998",
  );
  check(
    "中文 timeLabel",
    extractEnvTimeFromText("1998年3月在北京", "fallback") === "1998年3月",
  );
  check(
    "英文 location",
    extractEnvLocationFromText("In March 1998, at Beijing University") === "Beijing University",
  );
  check("中文 location", extractEnvLocationFromText("1998年3月在北京大学") === "北京大学");

  if (failed > 0) {
    console.error(`\ntest:video:locale FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:video:locale OK (${passed} checks)`);
}

main();
