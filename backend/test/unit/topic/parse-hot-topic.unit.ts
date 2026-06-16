/**
 * mapHotTopicRow：超长 q 截断。
 *
 * 运行：`npm run test:topic:parse-hot-topic`
 */
import { mapHotTopicRow } from "../../../src/topic/parse";

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
  const seen = new Set<string>();
  const longQ =
    "When you think back to your very first day at the factory, what details about the workshop floor, the smell of machine oil, and the people who showed you around still stand out most clearly in your memory today?";

  console.log("\n=== 超长 q 截断至 120 字 ===");
  const pick = mapHotTopicRow(
    { domainId: "daily_life", domainName: "Daily life", q: longQ },
    "questions[0]",
    seen,
  );
  check("截断后 ≤120", pick.q.length <= 120, pick.q.length);
  check("仍以问号结尾", pick.q.endsWith("?"), pick.q);
  check("非空", pick.q.length > 20, pick.q);

  console.log(`\n=== 结果：${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
