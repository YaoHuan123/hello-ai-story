/**
 * Tier5 矛盾检测 LLM 入参：referenceDate + polishedEventSummaries。
 *
 * 运行：`npm run test:topic:contradiction-input`
 */
import { buildContradictionLlmInput } from "../../../src/topic/sectionsInput";
import { stubSections } from "../../fixtures/sections.stub";

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

function main(): void {
  console.log("\n=== buildContradictionLlmInput ===");
  const input = buildContradictionLlmInput(stubSections(), "2026-06-14");
  check("含 referenceDate", input.referenceDate === "2026-06-14", input.referenceDate);
  check("含 polishedEventSummaries", typeof input.polishedEventSummaries === "object");
  check("基本档案节存在", Object.keys(input.polishedEventSummaries).length >= 1);

  const fixed = buildContradictionLlmInput(stubSections(), "2026-01-01");
  check("固定日期可注入", fixed.referenceDate === "2026-01-01");

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
