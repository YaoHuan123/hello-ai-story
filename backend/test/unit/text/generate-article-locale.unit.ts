/**
 * 正式文章 LLM 入参 outputLocale 单测（无 LLM）。
 * 用法：npm run test:text:locale
 */
import { formalArticlePipelineJsonForTest } from "../../../dist/text/llm/generateArticle.js";
import type { AnsweredSection } from "../../../src/topic/types";

const FIXTURE: AnsweredSection[] = [
  {
    name: "Basic profile",
    qa: [{ q: "Name?", a: "Alex" }],
  },
];

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
  const zhJson = formalArticlePipelineJsonForTest(FIXTURE, "zh");
  const zhParsed = JSON.parse(zhJson) as { outputLocale?: string; sections?: unknown[] };
  check("zh outputLocale", zhParsed.outputLocale === "zh", zhParsed);
  check("sections 保留", Array.isArray(zhParsed.sections) && zhParsed.sections.length === 1, zhParsed);

  const enJson = formalArticlePipelineJsonForTest(FIXTURE, "en");
  check("en outputLocale", (JSON.parse(enJson) as { outputLocale?: string }).outputLocale === "en");

  if (failed > 0) {
    console.error(`\ntest:text:locale FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:text:locale OK (${passed} checks)`);
}

main();
