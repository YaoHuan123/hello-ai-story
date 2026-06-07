import { VOICEOVER_LINE_MAX_CHARS } from "../../../shared/constants/voiceoverLimits.js";
import { loadVideoPromptParts } from "../../../shared/llm/loadPrompt.js";
import { chatJson, getVideoLlmEnv, stringifyForAi } from "../../../shared/llm/client.js";
import type { MergedNarrativeSegmentItem } from "./step150MergeEnvAndEra.js";
const PROMPT_FILE = "step-170_voiceover-coherence.md";
const ERR = "VOICEOVER_COHERENCE_170_INVALID";
const MAX_CHARS_PER_LINE = VOICEOVER_LINE_MAX_CHARS;

export type VoiceoverFlatItem = {
  voiceoverOrder: number;
  segmentIndex: number;
  sceneIndex: number | null;
  text: string;
};

export type VoiceoverCoherenceFilePayload = {
  savedAt: string;
  inputFile: string;
  /** 实际调用 chat 的模型 id */
  model: string;
  skippedModel: boolean;
  mergedNarrativeSegments: MergedNarrativeSegmentItem[];
};

function step170VoiceoverCoherenceModel(): string | undefined {
  const v = process.env.VOICEOVER_COHERENCE_170_MODEL?.trim();
  return v || undefined;
}

/** 按 merged 顺序展平旁白；与 step180Tts 一致：有 visualScenes 时按数组下标对齐 voiceover[i]。 */
export function flattenVoiceoverItems(merged: MergedNarrativeSegmentItem[]): VoiceoverFlatItem[] {
  const out: VoiceoverFlatItem[] = [];
  let order = 1;
  for (const row of merged) {
    const scenes = Array.isArray(row.visualScenes) ? row.visualScenes : [];
    const vo = row.voiceover;
    if (scenes.length > 0) {
      if (!Array.isArray(vo) || vo.length !== scenes.length) {
        throw new Error(
          `${ERR}: segmentIndex=${row.segmentIndex} 含 ${scenes.length} 个 visualScenes，voiceover 须为 ${scenes.length} 条`,
        );
      }
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i]!;
        const si = typeof sc.sceneIndex === "number" && Number.isFinite(sc.sceneIndex) ? sc.sceneIndex : NaN;
        if (!Number.isFinite(si)) {
          throw new Error(`${ERR}: segmentIndex=${row.segmentIndex} 第 ${i + 1} 个 visualScene 缺少有效 sceneIndex`);
        }
        const t = String(vo[i] ?? "").trim();
        if (!t) {
          throw new Error(`${ERR}: segmentIndex=${row.segmentIndex} sceneIndex=${si} 旁白为空`);
        }
        out.push({ voiceoverOrder: order++, segmentIndex: row.segmentIndex, sceneIndex: si, text: t });
      }
    } else {
      if (!Array.isArray(vo) || vo.length === 0) {
        continue;
      }
      const t = vo.map((x) => String(x ?? "").trim()).join(" ").trim();
      if (!t) {
        continue;
      }
      out.push({ voiceoverOrder: order++, segmentIndex: row.segmentIndex, sceneIndex: null, text: t });
    }
  }
  return out;
}

export function mergeOptimizedVoiceovers(
  merged: MergedNarrativeSegmentItem[],
  flatIn: VoiceoverFlatItem[],
  optimized: VoiceoverFlatItem[],
): MergedNarrativeSegmentItem[] {
  if (optimized.length !== flatIn.length) {
    throw new Error(`${ERR}: optimizedItems 长度 ${optimized.length} 与输入 ${flatIn.length} 不一致`);
  }
  for (let i = 0; i < flatIn.length; i++) {
    const a = flatIn[i]!;
    const b = optimized[i]!;
    if (b.voiceoverOrder !== a.voiceoverOrder || b.segmentIndex !== a.segmentIndex || b.sceneIndex !== a.sceneIndex) {
      throw new Error(
        `${ERR}: 第 ${i + 1} 项键不一致：期望 order=${a.voiceoverOrder} seg=${a.segmentIndex} scene=${String(a.sceneIndex)}，实际 order=${b.voiceoverOrder} seg=${b.segmentIndex} scene=${String(b.sceneIndex)}`,
      );
    }
    const t = String(b.text ?? "").trim();
    if (!t) {
      throw new Error(`${ERR}: 第 ${i + 1} 项优化后 text 为空`);
    }
    if ([...t].length > MAX_CHARS_PER_LINE) {
      throw new Error(`${ERR}: 第 ${i + 1} 项超过 ${MAX_CHARS_PER_LINE} 字：${t.slice(0, 40)}…`);
    }
    optimized[i] = { ...b, text: t };
  }

  // 按 flatten 时的遍历顺序回写，勿用 segmentIndex:sceneIndex 作键——同段多镜可能共用 sceneIndex。
  let cursor = 0;
  return merged.map((row) => {
    const scenes = Array.isArray(row.visualScenes) ? row.visualScenes : [];
    if (scenes.length > 0) {
      const newVo: string[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const opt = optimized[cursor++];
        if (!opt) {
          throw new Error(`${ERR}: 旁白条数不足，segmentIndex=${row.segmentIndex} 第 ${i + 1} 镜缺少优化结果`);
        }
        newVo.push(opt.text);
      }
      return { ...row, voiceover: newVo };
    }
    const vo = row.voiceover;
    if (!Array.isArray(vo) || vo.length === 0) {
      return row;
    }
    const opt = optimized[cursor++];
    if (!opt) {
      throw new Error(`${ERR}: 旁白条数不足，segmentIndex=${row.segmentIndex} 缺少优化结果`);
    }
    return { ...row, voiceover: [opt.text] };
  });
}

function assertOptimizedTexts(parsed: unknown, expectedLen: number): string[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${ERR}: 模型输出须为对象`);
  }
  const root = parsed as Record<string, unknown>;
  const arr = root.optimizedTexts;
  if (!Array.isArray(arr)) {
    throw new Error(`${ERR}: 缺少 optimizedTexts 数组`);
  }
  if (arr.length !== expectedLen) {
    throw new Error(`${ERR}: optimizedTexts 长度须为 ${expectedLen}，实际 ${arr.length}`);
  }
  const out: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const text = typeof arr[i] === "string" ? arr[i].trim() : "";
    if (!text) {
      throw new Error(`${ERR}: optimizedTexts[${i}] 为空`);
    }
    out.push(text);
  }
  return out;
}

function mergeOptimizedTextsIntoFlat(flat: VoiceoverFlatItem[], texts: string[]): VoiceoverFlatItem[] {
  return flat.map((item, i) => ({ ...item, text: texts[i]! }));
}

function deepCloneMerged(merged: MergedNarrativeSegmentItem[]): MergedNarrativeSegmentItem[] {
  return JSON.parse(JSON.stringify(merged)) as MergedNarrativeSegmentItem[];
}

export async function runVoiceoverCoherenceFromMerged(params: {
  mergedNarrativeSegments: MergedNarrativeSegmentItem[];
  savedAt: string;
  inputFile: string;
}): Promise<{ payload: VoiceoverCoherenceFilePayload; model: string }> {
  const merged = params.mergedNarrativeSegments;
  const model = step170VoiceoverCoherenceModel() ?? getVideoLlmEnv().model;

  if (merged.length === 0) {
    const payload: VoiceoverCoherenceFilePayload = {
      savedAt: params.savedAt,
      inputFile: params.inputFile,
      model,
      skippedModel: true,
      mergedNarrativeSegments: [],
    };
    return { payload, model };
  }

  const flat = flattenVoiceoverItems(merged);
  if (flat.length === 0) {
    const payload: VoiceoverCoherenceFilePayload = {
      savedAt: params.savedAt,
      inputFile: params.inputFile,
      model,
      skippedModel: true,
      mergedNarrativeSegments: deepCloneMerged(merged),
    };
    return { payload, model };
  }

  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const fullScript = flat.map((x) => x.text).join("\n");
  const { systemText, userSuffix } = loadVideoPromptParts(PROMPT_FILE);
  const pipelineStr = stringifyForAi({ items: flat, fullScript });
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);

  const callForTexts = async (debugStepId: string, extraGuidance?: string): Promise<string[]> => {
    const messages = [
      { role: "system" as const, content: systemText },
      { role: "user" as const, content: userContent },
    ];
    if (extraGuidance) {
      messages.push({ role: "user" as const, content: extraGuidance });
    }
    const parsed = await chatJson<unknown>(messages, {
      debugStepId,
      model,
      temperature: extraGuidance ? 0.1 : 0.2,
      useJsonObject: true,
    });
    const texts = assertOptimizedTexts(parsed, flat.length);
    for (let i = 0; i < texts.length; i++) {
      if ([...texts[i]!].length > MAX_CHARS_PER_LINE) {
        throw new Error(`${ERR}: optimizedTexts[${i}] 超过 ${MAX_CHARS_PER_LINE} 字：${texts[i]!.slice(0, 40)}…`);
      }
    }
    return texts;
  };

  let optimizedTexts: string[];
  try {
    optimizedTexts = await callForTexts("voiceover_coherence_170");
  } catch (firstErr) {
    if (!(firstErr instanceof Error) || !firstErr.message.startsWith(`${ERR}:`)) {
      throw firstErr;
    }
    const guidance = `【服务端校验未通过，请修正后重新输出】\n${firstErr.message}\n\n硬性约束：顶层仅含 optimizedTexts（字符串数组，长度=${flat.length}，与输入 items 一一对应）；每条不超过 ${MAX_CHARS_PER_LINE} 字；不要回吐 voiceoverOrder/segmentIndex/sceneIndex。`;
    optimizedTexts = await callForTexts("voiceover_coherence_170_repair", guidance);
  }

  const optimizedFlat = mergeOptimizedTextsIntoFlat(flat, optimizedTexts);
  const mergedOut = mergeOptimizedVoiceovers(deepCloneMerged(merged), flat, optimizedFlat);

  const payload: VoiceoverCoherenceFilePayload = {
    savedAt: params.savedAt,
    inputFile: params.inputFile,
    model,
    skippedModel: false,
    mergedNarrativeSegments: mergedOut,
  };
  return { payload, model };
}
