import { chatJson, getVideoLlmEnv, stringifyForAi } from "../client.js";
import { loadVideoPromptParts } from "../loadPrompt.js";
import type { AnsweredSection } from "../../../../topic/types";
import {
  buildMaterialPolishLlmInput,
  buildStubPolishedFromSections,
  filterSectionsForVideo,
} from "../../input/sectionsFilter.js";

const PROMPT_FILE = "step-10_material-polish.md";

export type MaterialPolishLlmInput = ReturnType<typeof buildMaterialPolishLlmInput>;

export type MaterialPolishResult = {
  polishedTemplateInstanceSummaries: Record<string, string>;
};

export type MaterialPolishMode = "llm" | "stub";

function sectionNamesFromInput(input: MaterialPolishLlmInput): string[] {
  return input.sections.map((s) => s.name.trim()).filter(Boolean);
}

function assertPolishedCoversAllSections(
  polished: Record<string, unknown>,
  sectionNames: string[],
): Record<string, string> {
  if (sectionNames.length === 0) {
    return {};
  }

  const out: Record<string, string> = {};
  for (const name of sectionNames) {
    const v = polished[name];
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`POLISH_10_FAILED: polishedTemplateInstanceSummaries 缺少或无效：name="${name}"`);
    }
    out[name] = v.trim();
  }

  const extraKeys = Object.keys(polished).filter((k) => !Object.prototype.hasOwnProperty.call(out, k));
  if (extraKeys.length > 0) {
    throw new Error(
      `POLISH_10_FAILED: polishedTemplateInstanceSummaries 存在多余键：${extraKeys.slice(0, 6).join(",")}`,
    );
  }

  return out;
}

async function callMaterialPolishLlm(
  input: MaterialPolishLlmInput,
  debugStepId: string,
): Promise<Record<string, unknown>> {
  const { systemText, userSuffix } = loadVideoPromptParts(PROMPT_FILE);
  const pipelineStr = stringifyForAi(input);
  const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);

  const parsed = await chatJson<{ polishedTemplateInstanceSummaries?: unknown }>(
    [
      { role: "system", content: systemText },
      { role: "user", content: userContent },
    ],
    { debugStepId, temperature: debugStepId.includes("repair") ? 0.1 : 0.2, useJsonObject: true },
  );

  const raw = parsed.polishedTemplateInstanceSummaries;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("POLISH_10_FAILED: 模型输出缺少 polishedTemplateInstanceSummaries 对象");
  }
  return raw as Record<string, unknown>;
}

export async function runMaterialPolish(input: MaterialPolishLlmInput): Promise<MaterialPolishResult> {
  const sectionNames = sectionNamesFromInput(input);
  if (sectionNames.length === 0) {
    return { polishedTemplateInstanceSummaries: {} };
  }

  if (!getVideoLlmEnv().apiKey) {
    throw new Error("OPENAI_API_KEY 未配置（请在 backend/.env 配置；可复制 backend/.env.example 为 backend/.env）");
  }

  const pipelineStr = stringifyForAi(input);

  try {
    const raw = await callMaterialPolishLlm(input, "polish_10");
    return {
      polishedTemplateInstanceSummaries: assertPolishedCoversAllSections(raw, sectionNames),
    };
  } catch (firstErr) {
    if (!(firstErr instanceof Error) || !firstErr.message.startsWith("POLISH_10_FAILED:")) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`POLISH_10_LLM_FAILED: ${msg}`);
    }

    const hint =
      `【服务端校验未通过】${firstErr.message}

你必须输出唯一顶层 JSON，且仅含 polishedTemplateInstanceSummaries。
其对象的键必须**恰好**为下列每一个字符串（顺序不限；不得增删改键名；每个值为非空字符串）：
${JSON.stringify(sectionNames, null, 2)}

完整输入 JSON 如下，请据此补全或重写全部键值的润色正文：
${pipelineStr}`;

    const { systemText, userSuffix } = loadVideoPromptParts(PROMPT_FILE);
    const userContent = userSuffix.replace("{{PIPELINE_JSON}}", pipelineStr);

    try {
      const parsed2 = await chatJson<{ polishedTemplateInstanceSummaries?: unknown }>(
        [
          { role: "system", content: systemText },
          { role: "user", content: userContent },
          { role: "user", content: hint },
        ],
        { debugStepId: "polish_10_repair", temperature: 0.1, useJsonObject: true },
      );
      const raw2 = parsed2.polishedTemplateInstanceSummaries;
      if (!raw2 || typeof raw2 !== "object" || Array.isArray(raw2)) {
        throw firstErr;
      }
      return {
        polishedTemplateInstanceSummaries: assertPolishedCoversAllSections(raw2 as Record<string, unknown>, sectionNames),
      };
    } catch {
      throw firstErr;
    }
  }
}

function resolvePolishMode(mode?: MaterialPolishMode): MaterialPolishMode {
  if (mode === "stub" || mode === "llm") return mode;
  if (process.env.VIDEO_INPUT_STUB === "1") return "stub";
  return "llm";
}

/** 从已答小节运行 step-10；默认 LLM，`mode: "stub"` 或 `VIDEO_INPUT_STUB=1` 时跳过模型。 */
export async function runMaterialPolishFromSections(
  sections: AnsweredSection[],
  opts?: {
    mode?: MaterialPolishMode;
  },
): Promise<MaterialPolishResult> {
  const filtered = filterSectionsForVideo(sections);
  if (filtered.length === 0) {
    return { polishedTemplateInstanceSummaries: {} };
  }

  const mode = resolvePolishMode(opts?.mode);
  if (mode === "stub") {
    return { polishedTemplateInstanceSummaries: buildStubPolishedFromSections(filtered) };
  }

  return runMaterialPolish(buildMaterialPolishLlmInput(filtered));
}
