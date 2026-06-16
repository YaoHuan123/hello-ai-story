/**
 * parseFactContradictions：userQuestion 解析与回退。
 *
 * 运行：`npm run test:topic:parse-contradiction`
 */
import { parseFactContradictions } from "../../../src/topic/parseContradiction";

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
  const validIds = new Set(["College", "Work"]);

  console.log("\n=== userQuestion 正常解析 ===");
  const parsed = parseFactContradictions(
    {
      factContradictions: {
        items: [
          {
            involvedIds: ["College", "Work"],
            summary: "Conflicting majors across sections",
            userQuestion: "Were you majoring in communications engineering or journalism?",
            needsUserFix: "yes",
            reconciliationHypotheses: ["Different schools"],
          },
        ],
      },
    },
    validIds,
  );
  check("解析 1 条", parsed.length === 1, parsed);
  check("userQuestion 保留", parsed[0]?.userQuestion.includes("communications"), parsed[0]);

  console.log("\n=== userQuestion 缺失时回退 summary ===");
  const fallback = parseFactContradictions(
    {
      factContradictions: {
        items: [
          {
            involvedIds: ["College"],
            summary: "Timeline overlap unclear",
            needsUserFix: "maybe",
          },
        ],
      },
    },
    validIds,
  );
  check(
    "回退为 Please clarify:",
    fallback[0]?.userQuestion === "Please clarify: Timeline overlap unclear",
    fallback[0],
  );

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
