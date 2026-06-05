import { chatJson, getVideoLlmEnv, stringifyForAi } from "../client.js";
import { loadVideoPromptParts } from "../loadPrompt.js";
import { classifyPipelineForLlm } from "../../input/sectionsFilter.js";
import type { ClassifyPipelineJson } from "./step60Classify.js";

const PROMPT_FILE = "step-20_era-backdrop-segments.md";

export type EraBackdropSegment = {
  narrative: string;
  timeLabel: string;
};

function assertEraBackdropShape(parsed: unknown): EraBackdropSegment[] {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("ERA_BACKDROP_INVALID: 模型输出不是对象");
  }
  const root = parsed as Record<string, unknown>;
  const arr = root.step20EraBackdropSegments;
  if (!Array.isArray(arr)) {
    throw new Error("ERA_BACKDROP_INVALID: 缺少 step20EraBackdropSegments 数组");
  }
  const out: EraBackdropSegment[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("ERA_BACKDROP_INVALID: step20EraBackdropSegments 项须为对象");
    }
    const o = item as Record<string, unknown>;
    if (typeof o.narrative !== "string" || !o.narrative.trim()) {
      throw new Error("ERA_BACKDROP_INVALID: narrative 须为非空字符串");
    }
    if (typeof o.timeLabel !== "string" || !o.timeLabel.trim()) {
      throw new Error("ERA_BACKDROP_INVALID: timeLabel 须为非空字符串（粗粒度年代亦可，如「1990年代」）");
    }
    out.push({
      narrative: o.narrative.trim(),
      timeLabel: o.timeLabel.trim(),
    });
  }
  return out;
}

export type EraBackdropPipelineJson = ClassifyPipelineJson;

export async function runEraBackdropFromPipelineJson(pipeline: EraBackdropPipelineJson): Promise<EraBackdropSegment[]> {
  const polishedKeys = Object.keys(pipeline.polishedTemplateInstanceSummaries).filter((k) => k.trim() !== "");
  if (polishedKeys.length === 0) {
    return [];
  }

  if (!getVideoLlmEnv().apiKey) {
    throw new Error(
      "OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）",
    );
  }

  const { systemText, userSuffix } = loadVideoPromptParts(PROMPT_FILE);
  const pipelineStr = stringifyForAi(classifyPipelineForLlm(pipeline));
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);

  const parsed = await chatJson<unknown>(
    [
      { role: "system", content: systemText },
      { role: "user", content: userContent },
    ],
    {
      debugStepId: "era_backdrop",
      temperature: 0.25,
      useJsonObject: true,
    },
  );

  return assertEraBackdropShape(parsed);
}
