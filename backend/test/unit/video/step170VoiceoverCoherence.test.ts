/**
 * 步骤 170 旁白回写：同段多镜共用 sceneIndex 时不得覆盖/重复。
 * 运行：`npm run test:video:voiceover-coherence`
 */
import {
  flattenVoiceoverItems,
  mergeOptimizedVoiceovers,
  type VoiceoverFlatItem,
} from "../../../src/video/biography/llm/steps/step170VoiceoverCoherence";
import type { MergedNarrativeSegmentItem } from "../../../src/video/biography/llm/steps/step150MergeEnvAndEra";

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

function main(): void {
  console.log("\n=== step170 同段重复 sceneIndex ===");
  const merged: MergedNarrativeSegmentItem[] = [
    {
      segmentIndex: 3,
      visualScenes: [
        { sceneIndex: 1, sceneDescription: "毕业仪式" },
        { sceneIndex: 1, sceneDescription: "手持证书" },
      ],
      voiceover: ["2016年6月毕业", "顺利取得本科学历"],
    } as MergedNarrativeSegmentItem,
  ];

  const flat = flattenVoiceoverItems(merged);
  check("展平 2 条", flat.length === 2, flat);

  const optimizedTexts = ["2016年6月毕业", "顺利取得本科学历"];
  const optimized: VoiceoverFlatItem[] = flat.map((item, i) => ({
    ...item,
    text: optimizedTexts[i]!,
  }));

  const out = mergeOptimizedVoiceovers(merged, flat, optimized);
  check("回写 2 条旁白", out[0]?.voiceover?.length === 2, out[0]?.voiceover);
  check("第 1 镜不变", out[0]?.voiceover?.[0] === "2016年6月毕业");
  check("第 2 镜不变", out[0]?.voiceover?.[1] === "顺利取得本科学历");
  check("无连续重复", out[0]?.voiceover?.[0] !== out[0]?.voiceover?.[1]);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
