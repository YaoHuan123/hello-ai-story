/**
 * 演播室脚本 LLM 入参 outputLocale 单测（无 LLM）。
 * 用法：npm run test:video:studio:locale
 */
import { studioScriptPipelineJsonForTest } from "../../../dist/video/studio/llm/studioScript.js";
import { studioPipelineJsonForTest } from "../../../dist/video/studio/llm/localeLlm.js";
import type { PolishedEventSummariesContextExpandedItem } from "../../../dist/video/shared/llm/steps/step70ContextExpand.js";

const FIXTURE_EVENTS: PolishedEventSummariesContextExpandedItem[] = [
  {
    segmentIndex: 1,
    narrative: "I grew up in a small town.",
    timeLabel: "1960-01",
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
  const zhJson = studioScriptPipelineJsonForTest(
    { events: FIXTURE_EVENTS, qaGranularity: "hybrid" },
    "zh",
  );
  const zhParsed = JSON.parse(zhJson) as { outputLocale?: string; qaGranularity?: string };
  check("iv_script zh outputLocale", zhParsed.outputLocale === "zh", zhParsed);
  check("qaGranularity 保留", zhParsed.qaGranularity === "hybrid", zhParsed);

  const turnPayload = studioPipelineJsonForTest(
    { speaker: "guest", currentText: "测试", currentDurationSec: 3, targetTotalVideoSec: 5, targetCharsEstimate: 20, deltaChars: 5 },
    "zh",
  );
  check("duration align payload locale", (JSON.parse(turnPayload) as { outputLocale?: string }).outputLocale === "zh");

  if (failed > 0) {
    console.error(`\ntest:video:studio:locale FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:video:studio:locale OK (${passed} checks)`);
}

main();
