import type { MergedNarrativeSegmentItem } from "../llm/steps/step150MergeEnvAndEra.js";
import type { VisualEntry } from "../llm/steps/step190VisualCreate.js";

const STRING_KEYS_TO_REPLACE = [
  "name",
  "env_time",
  "env_location",
  "env_location_time_detail",
  "env_style",
  "env_event",
  "narrative",
  "voiceover",
] as const;

export function parseVisualEntriesRaw(raw: Record<string, unknown>, errPrefix = "VISUAL_EXPAND_200_INVALID"): VisualEntry[] {
  const arr = raw.visualEntries;
  if (!Array.isArray(arr)) {
    throw new Error(`${errPrefix}: visualEntries 须为数组`);
  }
  const out: VisualEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${errPrefix}: visualEntries 第 ${i + 1} 条须为对象`);
    }
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const description = typeof o.description === "string" ? o.description.trim() : "";
    if (!label || !description) {
      throw new Error(`${errPrefix}: visualEntries 第 ${i + 1} 条 label/description 须为非空字符串`);
    }
    if (seen.has(label)) {
      throw new Error(`${errPrefix}: visualEntries label 重复：${label}`);
    }
    seen.add(label);
    out.push({ label, description });
  }
  return out;
}

function escapedVisualDesc(desc: string): string {
  return desc.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function expandMergedSegmentsWithVisual(
  mergedNarrativeSegments: MergedNarrativeSegmentItem[],
  visualEntries: VisualEntry[],
): MergedNarrativeSegmentItem[] {
  if (visualEntries.length === 0) {
    return mergedNarrativeSegments.map((x) => ({ ...x }));
  }
  const map = new Map(visualEntries.map((x) => [x.label.trim(), x.description]));
  const labels = [...map.keys()].sort((a, b) => b.length - a.length);

  const replaceText = (text: string): string => {
    let out = text;
    for (const label of labels) {
      const desc = map.get(label);
      if (!desc || !out.includes(label)) continue;
      const bracket = label.indexOf("[");
      const name = bracket >= 0 ? label.slice(0, bracket) : label;
      out = out.split(label).join(`${name}["${escapedVisualDesc(desc)}"]`);
    }
    return out;
  };

  return mergedNarrativeSegments.map((seg) => {
    const next = { ...seg } as Record<string, unknown>;
    for (const k of STRING_KEYS_TO_REPLACE) {
      const v = next[k];
      if (typeof v === "string") {
        next[k] = replaceText(v);
      }
    }
    // Process visualScenes.sceneDescription
    if (Array.isArray(next.visualScenes)) {
      next.visualScenes = next.visualScenes.map((scene: any) => {
        if (scene && typeof scene === "object" && typeof scene.sceneDescription === "string") {
          return {
            ...scene,
            sceneDescription: replaceText(scene.sceneDescription)
          };
        }
        return scene;
      });
    }
    return next as MergedNarrativeSegmentItem;
  });
}

