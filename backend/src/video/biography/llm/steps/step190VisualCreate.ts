import { loadVideoPromptParts } from "../../../shared/llm/loadPrompt.js";
import { chatJson, getVideoLlmEnv, stringifyForAi } from "../../../shared/llm/client.js";
import type { MergedNarrativeSegmentItem } from "./step150MergeEnvAndEra.js";

const PROMPT_FILE = "step-190_visual-create.md";
const ERR = "VISUAL_CREATE_190_INVALID";

export type VisualEntry = {
  label: string;
  description: string;
};

export type VisualCreateInput = {
  mergedNarrativeSegments: MergedNarrativeSegmentItem[];
  confirmedGenderByName?: Record<string, string>;
};

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function normalizeLabelCandidate(raw: string): string | null {
  const t = raw.trim();
  const l = t.indexOf("[");
  const r = t.indexOf("]", l + 1);
  if (l <= 0 || r <= l + 1) return null;
  const namePart = t.slice(0, l).trim();
  const stage = t.slice(l + 1, r).trim();
  if (!namePart || !stage) return null;

  // 仅保留 `[` 前最后一个姓名样式 token，避免把“1992年8月姚欢[刚出生]”整段当作 label。
  const nameMatch = namePart.match(/([\u4e00-\u9fa5A-Za-z·]{1,20})$/);
  const name = (nameMatch?.[1] ?? namePart).trim();
  if (!name) return null;
  return `${name}[${stage}]`;
}

/**
 * 为每个 [人物/阶段] 标签选取一条出现该标签的 sceneDescription 作为模型上下文，避免向模型发送整包 mergedNarrativeSegments。
 */
function buildVisualLabelSamples(
  merged: MergedNarrativeSegmentItem[],
  labels: Set<string>,
): { label: string; sampleSceneDescription: string }[] {
  const out: { label: string; sampleSceneDescription: string }[] = [];
  for (const label of labels) {
    let sample = "";
    outer: for (const row of merged) {
      if (!Array.isArray(row.visualScenes)) continue;
      for (const sc of row.visualScenes) {
        const d = typeof sc.sceneDescription === "string" ? sc.sceneDescription : "";
        if (d && d.includes(label)) {
          sample = d.trim();
          break outer;
        }
      }
    }
    if (sample) {
      out.push({ label, sampleSceneDescription: sample });
    }
  }
  return out;
}

function extractLabelsFromMergedSegments(merged: MergedNarrativeSegmentItem[]): Set<string> {
  const out = new Set<string>();
  const directLabelRe = /([\u4e00-\u9fa5A-Za-z·]{1,20}\[[^\]\n]{1,30}\])/g;
  const fallbackRe = /([^\s\[\]，。；、：:()（）]{1,40}\[[^\]\n]{1,30}\])/g;
  for (const row of merged) {
    // Only look at visualScenes.sceneDescription fields
    if (Array.isArray(row.visualScenes)) {
      for (const scene of row.visualScenes) {
        if (typeof scene.sceneDescription === "string" && scene.sceneDescription) {
          const v = scene.sceneDescription;
          directLabelRe.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = directLabelRe.exec(v)) !== null) {
            const label = normalizeLabelCandidate(m[1] ?? "");
            if (label) {
              out.add(label);
            }
          }
          fallbackRe.lastIndex = 0;
          while ((m = fallbackRe.exec(v)) !== null) {
            const label = normalizeLabelCandidate(m[1] ?? "");
            if (label) {
              out.add(label);
            }
          }
        }
      }
    }
  }
  return out;
}

function parseVisualEntriesFromModel(parsed: unknown): unknown[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${ERR}: 模型输出须为对象`);
  }
  const root = parsed as Record<string, unknown>;
  const keys = Object.keys(root);
  if (Object.prototype.hasOwnProperty.call(root, "visualEntries")) {
    const arr = root.visualEntries;
    if (!Array.isArray(arr)) {
      throw new Error(`${ERR}: visualEntries 须为数组`);
    }
    return arr;
  }
  if (Object.prototype.hasOwnProperty.call(root, "visualLabelSamples")) {
    const arr = root.visualLabelSamples;
    if (!Array.isArray(arr)) {
      throw new Error(`${ERR}: visualLabelSamples 须为数组`);
    }
    return arr;
  }
  throw new Error(`${ERR}: 顶层须含 visualEntries（或 visualLabelSamples），当前键: ${keys.join(",")}`);
}

function assertVisualCreateShape(parsed: unknown, allowedLabels: Set<string>): VisualEntry[] {
  const arr = parseVisualEntriesFromModel(parsed);
  const out: VisualEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${ERR}: 第 ${i + 1} 条须为对象`);
    }
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const normalized = normalizeLabelCandidate(label);
    const description = typeof o.description === "string" ? o.description.trim() : "";
    if (!normalized || !description) {
      throw new Error(`${ERR}: 第 ${i + 1} 条 label/description 须为非空字符串`);
    }
    if (seen.has(normalized)) {
      throw new Error(`${ERR}: label 重复：${normalized}`);
    }
    // 模型偶发会把同人物的阶段词做轻微改写（如“幼年”/“刚出生”）。
    // 这里不再硬失败，保留该条，后续步骤按实际 label 做可替换匹配（未命中则自然不替换）。
    seen.add(normalized);
    out.push({ label: normalized, description });
  }
  return out;
}

export async function runVisualCreateFromMergedSegments(input: VisualCreateInput): Promise<VisualEntry[]> {
  const mergedNarrativeSegments = input.mergedNarrativeSegments;
  const confirmedGenderByName = input.confirmedGenderByName ?? {};
  if (mergedNarrativeSegments.length === 0) {
    return [];
  }
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }
  const labels = extractLabelsFromMergedSegments(mergedNarrativeSegments);
  if (labels.size === 0) {
    return [];
  }

  const visualLabelSamples = buildVisualLabelSamples(mergedNarrativeSegments, labels);
  const { systemText, userSuffix } = loadVideoPromptParts(PROMPT_FILE);
  const pipelineStr = stringifyForAi({ visualLabelSamples, confirmedGenderByName });
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);

  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(
      [
        { role: "system", content: systemText },
        { role: "user", content: userContent },
      ],
      {
        debugStepId: "visual_create_190",
        temperature: 0.35,
        useJsonObject: true,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${ERR}: 模型调用或 JSON 解析失败。${msg}`);
  }

  return assertVisualCreateShape(parsed, labels);
}

