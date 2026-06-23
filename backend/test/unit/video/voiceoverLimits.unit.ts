/**
 * 旁白单行限长（locale-aware）单测。
 * 用法：npm run test:video:voiceover-limits
 */
import {
  clampVoiceoverLine,
  countVoiceoverWords,
  voiceoverLineTooLong,
  VOICEOVER_LINE_MAX_CHARS,
  VOICEOVER_LINE_MAX_CHARS_EN,
  VOICEOVER_LINE_MAX_WORDS_EN,
} from "../../../src/video/shared/constants/voiceoverLimits";

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

function enWords(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i + 1}`).join(" ");
}

function main(): void {
  console.log("\n=== voiceoverLimits locale rules ===");

  const zh81 = "中".repeat(81);
  check("zh 81 码点 too long", voiceoverLineTooLong(zh81, "zh"));
  check("zh 80 码点 OK", !voiceoverLineTooLong("中".repeat(80), "zh"));

  const en18 = enWords(18);
  const en19 = enWords(19);
  check("en 18 词 OK", !voiceoverLineTooLong(en18, "en"));
  check("en 19 词 too long", voiceoverLineTooLong(en19, "en"));
  check("countVoiceoverWords 18", countVoiceoverWords(en18) === 18);

  const en15long = `${enWords(15)} ${"x".repeat(VOICEOVER_LINE_MAX_CHARS_EN - enWords(15).length + 20)}`;
  check("en 15 词但超 140 码点 too long", voiceoverLineTooLong(en15long, "en"));

  const clamped19 = clampVoiceoverLine(en19, "en");
  check(
    "clamp en 19 词 → 18 词",
    countVoiceoverWords(clamped19) <= VOICEOVER_LINE_MAX_WORDS_EN,
    { words: countVoiceoverWords(clamped19), text: clamped19 },
  );
  check(
    "clamp en 码点 ≤ 140",
    [...clamped19].length <= VOICEOVER_LINE_MAX_CHARS_EN,
    clamped19.length,
  );

  const clampedZh = clampVoiceoverLine(zh81, "zh");
  check(
    "clamp zh 81 → ≤80",
    [...clampedZh].length <= VOICEOVER_LINE_MAX_CHARS,
    clampedZh.length,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
