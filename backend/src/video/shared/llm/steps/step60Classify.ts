import { chatJson, getVideoLlmEnv, stringifyForAi } from "../client.js";
import { loadVideoPromptParts } from "../loadPrompt.js";
import { classifyPipelineForLlm } from "../../input/sectionsFilter.js";

const PROMPT_FILE = "step-60_classify.md";

export type SegmentKind = "event" | "context";

export type ClassifyResult = {
  templateInstances: Array<Record<string, unknown> & { id: string }>;
  segmentKindById: Record<string, SegmentKind>;
};

export type ClassifyPipelineJson = {
  polishedTemplateInstanceSummaries: Record<string, string>;
  turnReasonAnswers?: {
    items: Array<{ order: number; question: string; answer: string; savedAt?: string }>;
  };
};

const PREP_SPLIT_ID_RE = /__s\d+$/;

function kindFromUnknown(v: unknown): SegmentKind | null {
  return v === "event" || v === "context" ? v : null;
}

function assertClassifyShape(parsed: unknown, polishedById: Record<string, string>): ClassifyResult {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CLASSIFY_60_INVALID: 模型输出不是对象");
  }
  const root = parsed as Record<string, unknown>;

  const sk = root.segmentKindById;
  if (!sk || typeof sk !== "object" || Array.isArray(sk)) {
    throw new Error("CLASSIFY_60_INVALID: segmentKindById 须为对象");
  }
  const skObj = sk as Record<string, unknown>;
  const allIds = Object.keys(skObj).filter((k) => k.trim() !== "");
  if (allIds.length < 1) {
    throw new Error("CLASSIFY_60_INVALID: segmentKindById 不得为空");
  }

  const polishedKeys = Object.keys(polishedById).filter((k) => k.trim() !== "");
  const polishedKeySet = new Set(polishedKeys);

  const templateInstances: Array<Record<string, unknown> & { id: string }> = [];
  for (const id of allIds) {
    if (PREP_SPLIT_ID_RE.test(id)) {
      throw new Error(
        `CLASSIFY_60_INVALID: id "${id}" 为拆条子 id；prep 阶段仅按节名分类，拆条留给步骤 80`,
      );
    }
    if (!polishedKeySet.has(id)) {
      throw new Error(`CLASSIFY_60_INVALID: id "${id}" 须为润色表节名之一`);
    }
    if (!kindFromUnknown(skObj[id])) {
      throw new Error(`CLASSIFY_60_INVALID: segmentKindById["${id}"] 须为字符串 event 或 context`);
    }
    const summary = String(polishedById[id] ?? "").trim();
    if (!summary) {
      throw new Error(`CLASSIFY_60_INVALID: id "${id}" 在润色表中 summary 为空`);
    }
    templateInstances.push({ id, summary });
  }

  if (allIds.length !== polishedKeys.length) {
    throw new Error(
      `CLASSIFY_60_INVALID: segmentKindById 键数须等于润色表节数（${polishedKeys.length}），当前 ${allIds.length}`,
    );
  }
  for (const key of polishedKeys) {
    if (!Object.prototype.hasOwnProperty.call(skObj, key)) {
      throw new Error(`CLASSIFY_60_INVALID: 缺少润色表节名 "${key}" 的分类`);
    }
  }

  const segmentKindById: Record<string, SegmentKind> = {};
  for (const id of allIds) {
    segmentKindById[id] = kindFromUnknown(skObj[id])!;
  }

  return { templateInstances, segmentKindById };
}

export async function runClassifyFromPipelineJson(pipeline: ClassifyPipelineJson): Promise<ClassifyResult> {
  const polishedKeys = Object.keys(pipeline.polishedTemplateInstanceSummaries).filter((k) => k.trim() !== "");
  if (polishedKeys.length === 0) {
    return { templateInstances: [], segmentKindById: {} };
  }

  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { systemText, userSuffix } = loadVideoPromptParts(PROMPT_FILE);
  const pipelineStr = stringifyForAi(classifyPipelineForLlm(pipeline));
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);

  let parsed: unknown;
  try {
    parsed = await chatJson<unknown>(
      [
        { role: "system", content: systemText },
        { role: "user", content: userContent },
      ],
      { debugStepId: "classify_60", temperature: 0.15, useJsonObject: true },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `CLASSIFY_60_INVALID: 模型调用或 JSON 解析失败（常见于响应截断、非完整 JSON）。原始信息：${msg}`,
    );
  }

  return assertClassifyShape(parsed, pipeline.polishedTemplateInstanceSummaries);
}
