/**
 * 步骤 90 子场景拆分：严格 JSON 形状校验。
 * 运行：`npm run test:video:subscene-split-90`
 */
import { parseSubsceneSplit90ModelOutput } from "../../../src/video/biography/llm/steps/step90SubsceneSplit";

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  [ok] ${label}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${label}`, detail !== undefined ? detail : "");
  }
}

function expectError(label: string, fn: () => void, includes: string): void {
  try {
    fn();
    check(label, false, "expected throw");
  } catch (e) {
    check(label, e instanceof Error && e.message.includes(includes), e);
  }
}

function main(): void {
  console.log("\n=== step90 subscene split parse (strict) ===");

  const canonical = parseSubsceneSplit90ModelOutput({
    subsceneSplitTimelineSegments: [
      {
        segmentIndex: 1,
        narrative: ["我出生于成都。", "我在小学读书。"],
        timeLabel: "1965年",
      },
    ],
  });
  check("canonical object", canonical.length === 1 && canonical[0]!.narrative.length === 2, canonical);

  expectError("reject string items", () => {
    parseSubsceneSplit90ModelOutput({
      subsceneSplitTimelineSegments: ["我出生于成都。", "我在小学读书。"],
    });
  }, "须为对象");

  expectError("reject bare string[] item", () => {
    parseSubsceneSplit90ModelOutput({
      subsceneSplitTimelineSegments: [["我出生于成都。", "我在小学读书。"]],
    });
  }, "须为对象");

  expectError("reject step80 output key", () => {
    parseSubsceneSplit90ModelOutput({
      splitDedupedTimelineSegments: [
        { segmentIndex: 1, narrative: "整段叙述", timeLabel: "1990年" },
      ],
    });
  }, "splitDedupedTimelineSegments");

  expectError("reject top-level array", () => {
    parseSubsceneSplit90ModelOutput([{ segmentIndex: 1, narrative: ["A"], timeLabel: "2000年" }]);
  }, "须为对象");

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
