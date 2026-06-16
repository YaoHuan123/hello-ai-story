import { buildVideoLlmMessages, buildVideoLlmUserContent, stringifyVideoPipeline } from "../../../shared/llm/localeLlm.js";
import { chatJson, getVideoLlmEnv } from "../../../shared/llm/client.js";
import type { CrossValidatedTimelineItem } from "./step110EnvNarrativePack.js";

const PROMPT_FILE = "step-130_name-unify.md";

export type NameUnifyInput = {
  crossValidatedTimelineSegments: CrossValidatedTimelineItem[];
};

export type NameUnifyOutput = {
  crossValidatedTimelineSegments: CrossValidatedTimelineItem[];
};

function applyOrderedTextReplacements(text: string, rules: { from: string; to: string }[]): string {
  let t = text;
  for (const { from, to } of rules) {
    if (!from) continue;
    t = t.split(from).join(to);
  }
  return t;
}

function parseReplacementObjectArray(raw: unknown[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const o = item as Record<string, unknown>;
    const from = o.from;
    const to = o.to;
    if (typeof from !== "string" || !from) {
      continue;
    }
    if (typeof to !== "string") {
      continue;
    }
    out.push({ from, to });
  }
  return out;
}

/**
 * 当顶层含 `nameUnifyTextReplacements` 时解析替换规则。支持多种模型写法：
 * - `{ replacements: [{from,to},...] }`
 * - `replacement` / `items` / `rules` 同义
 * - 直传 `[{from,to},...]`
 * 空列表视为「无替换需要」，对输入**原样返回**（深拷贝），不再误走全量分支报「顶层键不对」。
 */
function parseNameUnifyTextReplacementsRules(root: Record<string, unknown>): { from: string; to: string }[] {
  const n = root.nameUnifyTextReplacements;
  if (n === null || n === undefined) {
    return [];
  }
  if (Array.isArray(n)) {
    return parseReplacementObjectArray(n);
  }
  if (typeof n !== "object") {
    throw new Error(
      "NAME_UNIFY_130_INVALID: nameUnifyTextReplacements 须为对象或 {from,to} 数组，或为 null",
    );
  }
  const o = n as Record<string, unknown>;
  const raw = o.replacements ?? o.replacement ?? o.items ?? o.rules;
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error("NAME_UNIFY_130_INVALID: nameUnifyTextReplacements 内的替换表须为数组，可为空数组");
  }
  return parseReplacementObjectArray(raw);
}

function cloneCrossValidatedFromInput(
  segs: CrossValidatedTimelineItem[],
): CrossValidatedTimelineItem[] {
  return JSON.parse(JSON.stringify(segs)) as CrossValidatedTimelineItem[];
}

/** 仅向模型提供识别人物称呼所需文本（narrative + visualScenes 文本），去掉 originalNarrative 等冗余字段。 */
function slimInputForNameUnify(input: NameUnifyInput) {
  return input.crossValidatedTimelineSegments.map((seg) => ({
    segmentIndex: seg.segmentIndex,
    narrative: seg.narrative ?? [],
    visualScenes: (seg.visualScenes ?? []).map((vs) => vs.sceneDescription),
  }));
}

function applyNameUnifyRulesToInput(
  input: NameUnifyInput,
  rules: { from: string; to: string }[],
): CrossValidatedTimelineItem[] {
  return input.crossValidatedTimelineSegments.map((seg) => {
    const narrative = (seg.narrative ?? []).map((line) => applyOrderedTextReplacements(line, rules));
    const visualScenes = (seg.visualScenes ?? []).map((vs) => ({
      sceneIndex: vs.sceneIndex,
      sceneDescription: applyOrderedTextReplacements(vs.sceneDescription, rules),
    }));
    return {
      ...seg,
      narrative,
      timeLabel: applyOrderedTextReplacements(seg.timeLabel, rules),
      originalNarrative: applyOrderedTextReplacements(seg.originalNarrative, rules),
      visualScenes,
      title: seg.title ? applyOrderedTextReplacements(seg.title, rules) : undefined,
    };
  });
}

export async function runNameUnifyFromPipelineJson(input: NameUnifyInput): Promise<NameUnifyOutput> {
  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { messages: baseMessages } = buildVideoLlmMessages(PROMPT_FILE, { crossValidatedTimelineSegments: slimInputForNameUnify(input) });
  // 模型只回传差量替换表 nameUnifyTextReplacements；服务端按规则改写所有字段（narrative/visualScenes/timeLabel/originalNarrative/title）。
  const callForRules = async (debugStepId: string, extraGuidance?: string): Promise<{ from: string; to: string }[]> => {
    const messages = [...baseMessages];
    if (extraGuidance) {
      messages.push({ role: "user" as const, content: extraGuidance });
    }
    let parsed: unknown;
    try {
      parsed = await chatJson<unknown>(messages, {
        debugStepId,
        temperature: extraGuidance ? 0.1 : 0.25,
        useJsonObject: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`NAME_UNIFY_130_INVALID: 模型调用或 JSON 解析失败。${msg}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("NAME_UNIFY_130_INVALID: 模型输出须为对象");
    }
    const root = parsed as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(root, "nameUnifyTextReplacements")) {
      throw new Error(
        `NAME_UNIFY_130_INVALID: 顶层须含 nameUnifyTextReplacements（{from,to} 数组，可为空数组）。当前键: ${Object.keys(root).join(",")}`,
      );
    }
    return parseNameUnifyTextReplacementsRules(root);
  };

  let rules: { from: string; to: string }[];
  try {
    rules = await callForRules("name_unify_130");
  } catch (firstErr) {
    if (!(firstErr instanceof Error) || !firstErr.message.startsWith("NAME_UNIFY_130_INVALID:")) {
      throw firstErr;
    }
    const guidance = `【服务端校验未通过，请修正后重新输出】\n${firstErr.message}\n\n硬性约束：顶层仅含 nameUnifyTextReplacements，值为 {from,to} 字符串数组；无需统一时返回空数组 []。不要回吐时间线全文。`;
    rules = await callForRules("name_unify_130_repair", guidance);
  }

  if (rules.length === 0) {
    return { crossValidatedTimelineSegments: cloneCrossValidatedFromInput(input.crossValidatedTimelineSegments) };
  }
  const applied = applyNameUnifyRulesToInput(input, rules);
  for (const seg of applied) {
    if (!seg.narrative?.length || !seg.narrative.some((l) => l.trim())) {
      throw new Error("NAME_UNIFY_130_INVALID: 应用替换后 narrative 为空");
    }
    if (!Array.isArray(seg.visualScenes) || seg.visualScenes.length === 0) {
      throw new Error("NAME_UNIFY_130_INVALID: 应用替换后 visualScenes 为空");
    }
  }
  return { crossValidatedTimelineSegments: applied };
}
