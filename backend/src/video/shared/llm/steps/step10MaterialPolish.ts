import { chatJson, getVideoLlmEnv } from "../client.js";
import { buildVideoLlmMessages, stringifyVideoPipeline } from "../localeLlm.js";
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

export function assertPolishedCoversAllSections(
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
      throw new Error(`POLISH_10_FAILED: polishedTemplateInstanceSummaries ??????name="${name}"`);
    }
    out[name] = v.trim();
  }

  const extraKeys = Object.keys(polished).filter((k) => !Object.prototype.hasOwnProperty.call(out, k));
  if (extraKeys.length > 0) {
    throw new Error(
      `POLISH_10_FAILED: polishedTemplateInstanceSummaries ??????${extraKeys.slice(0, 6).join(",")}`,
    );
  }

  return out;
}

async function callMaterialPolishLlm(
  input: MaterialPolishLlmInput,
  debugStepId: string,
): Promise<Record<string, unknown>> {
  const { messages } = buildVideoLlmMessages(PROMPT_FILE, input as Record<string, unknown>);
  const parsed = await chatJson<{ polishedTemplateInstanceSummaries?: unknown }>(
    messages,
    { debugStepId, temperature: debugStepId.includes("repair") ? 0.1 : 0.2, useJsonObject: true },
  );

  const raw = parsed.polishedTemplateInstanceSummaries;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("POLISH_10_FAILED: ?????? polishedTemplateInstanceSummaries ??");
  }
  return raw as Record<string, unknown>;
}

export async function runMaterialPolish(input: MaterialPolishLlmInput): Promise<MaterialPolishResult> {
  const sectionNames = sectionNamesFromInput(input);
  if (sectionNames.length === 0) {
    return { polishedTemplateInstanceSummaries: {} };
  }

  if (!getVideoLlmEnv().apiKey) {
    throw new Error("OPENAI_API_KEY ?????? backend/.env ?????? backend/.env.example ? backend/.env?");
  }

  const pipelineStr = stringifyVideoPipeline(input as Record<string, unknown>);

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
      `??????????${firstErr.message}

????????? JSON???? polishedTemplateInstanceSummaries?
???????**??**??????????????????????????????????
${JSON.stringify(sectionNames, null, 2)}

???? JSON ?????????????????????
${pipelineStr}`;

    const { messages: repairMessages } = buildVideoLlmMessages(PROMPT_FILE, input as Record<string, unknown>);

    try {
      const parsed2 = await chatJson<{ polishedTemplateInstanceSummaries?: unknown }>(
        [...repairMessages, { role: "user", content: hint }],
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

/** ??????? step-10??? LLM?`mode: "stub"` ? `VIDEO_INPUT_STUB=1` ?????? */
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
