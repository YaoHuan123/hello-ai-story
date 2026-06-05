import type { MergedNarrativeSegmentItem } from "../llm/steps/step150MergeEnvAndEra.js";
import { resolveSelectedStyle, styleToPromptPrefix, type VideoStyleRow } from "../llm/steps/videoStyles.js";

const STYLE_PREFIX_START_RE = /^【[^】]+】/;

function stripExistingStylePrefix(narrative: string): string {
  let s = narrative.trim();
  // 如果文本前面已带类似 `【xx】...。` 的风格段，剥离一次，避免重复叠加
  if (STYLE_PREFIX_START_RE.test(s)) {
    const idx = s.indexOf("。");
    if (idx >= 0) {
      s = s.slice(idx + 1).trim();
    }
  }
  return s;
}

export function step210AddStylePrefix(params: {
  mergedNarrativeSegments: MergedNarrativeSegmentItem[];
  styleConfig: { selectedStyleId: string; styles: VideoStyleRow[] };
}): {
  style: VideoStyleRow;
  stylePrefix: string;
  mergedNarrativeSegments: MergedNarrativeSegmentItem[];
} {
  const style = resolveSelectedStyle(params.styleConfig);
  const stylePrefix = styleToPromptPrefix(style);

  const mergedNarrativeSegments = params.mergedNarrativeSegments.map((seg) => {
    const next = { ...seg };
    // Process visualScenes.sceneDescription
    if (Array.isArray(next.visualScenes)) {
      next.visualScenes = next.visualScenes.map((scene) => {
        if (scene && typeof scene === "object" && typeof scene.sceneDescription === "string") {
          return {
            ...scene,
            sceneDescription: `${stylePrefix}${stripExistingStylePrefix(scene.sceneDescription)}`
          };
        }
        return scene;
      });
    }
    return next;
  });

  return { style, stylePrefix, mergedNarrativeSegments };
}

