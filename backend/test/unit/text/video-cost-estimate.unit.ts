/**
 * 视频制作费用预估：tier 账本 × $0.2。
 */
import {
  VIDEO_ESTIMATE_USD_PER_TIER,
  countBillableTiersFromSections,
  estimateVideoCostForSections,
  estimateVideoCostFromTierCount,
} from "../../../src/text/videoCostEstimate";
import { getBasicProfileTopicName } from "../../../src/topic/catalog";
import type { AnsweredSection } from "../../../src/topic/types";

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

const sections: AnsweredSection[] = [
  { name: getBasicProfileTopicName(), qa: [{ q: "Name?", a: "Ann" }] },
  { name: "Elementary School", tier: 1, kind: "catalog", qa: [{ q: "School?", a: "No.1" }] },
  { name: "A turning point", tier: 7, kind: "material_turn", qa: [{ q: "Why?", a: "Moved" }] },
];

function main() {
  check("usd per tier is 0.2", VIDEO_ESTIMATE_USD_PER_TIER === 0.2);
  check(
    "(N+1) * 0.2",
    estimateVideoCostFromTierCount(5).estimatedUsd === 1.2,
  );
  check(
    "sections fallback excludes basic profile",
    countBillableTiersFromSections(sections) === 2,
  );
  check(
    "ledger count preferred over sections",
    estimateVideoCostForSections(sections, 12).tierCount === 12 &&
      estimateVideoCostForSections(sections, 12).usedLegacyFallback === false,
  );
  check(
    "empty ledger falls back to sections",
    estimateVideoCostForSections(sections, 0).tierCount === 2 &&
      estimateVideoCostForSections(sections, 0).usedLegacyFallback === true,
  );

  if (failed > 0) {
    console.error(`\ntest:video:cost-estimate FAILED (${passed} ok, ${failed} fail)`);
    process.exit(1);
  }
  console.log(`\ntest:video:cost-estimate OK (${passed} checks)`);
}

main();
