import { chatJson, getVideoLlmEnv } from "../client.js";
import { buildVideoLlmMessages, stringifyVideoPipeline } from "../localeLlm.js";
import type { AnsweredSection } from "../../../../topic/types";
import { filterSectionsForVideo } from "../../input/sectionsFilter.js";
import { assertPolishedCoversAllSections } from "./step10MaterialPolish.js";
import type { MaterialPolishMode } from "./step10MaterialPolish.js";

const PROMPT_FILE = "step-10_story-article-to-sections.md";

export type StoryArticlePolishLlmInput = {
  storyArticle: string;
  sections: Array<{ name: string }>;
};

export type StoryArticlePolishResult = {
  polishedTemplateInstanceSummaries: Record<string, string>;
};

function buildStoryArticlePolishLlmInput(
  sections: AnsweredSection[],
  storyArticle: string,
): StoryArticlePolishLlmInput {
  const filtered = filterSectionsForVideo(sections);
  return {
    storyArticle: storyArticle.trim(),
    sections: filtered.map((s) => ({ name: s.name.trim() })),
  };
}

export function buildStubPolishedFromStoryArticle(
  sections: AnsweredSection[],
  storyArticle: string,
): Record<string, string> {
  const filtered = filterSectionsForVideo(sections);
  const names = filtered.map((s) => s.name.trim()).filter(Boolean);
  const trimmed = storyArticle.trim();
  if (names.length === 0) return {};

  const paragraphs = trimmed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) {
    return Object.fromEntries(names.map((name) => [name, trimmed || "???"]));
  }

  const out: Record<string, string> = {};
  names.forEach((name, i) => {
    out[name] = paragraphs[i % paragraphs.length]!;
  });
  return out;
}

function resolveStoryPolishMode(mode?: MaterialPolishMode): MaterialPolishMode {
  if (mode === "stub" || mode === "llm") return mode;
  if (process.env.VIDEO_INPUT_STUB === "1") return "stub";
  return "llm";
}

async function callStoryArticlePolishLlm(
  input: StoryArticlePolishLlmInput,
  debugStepId: string,
): Promise<Record<string, unknown>> {
  const { messages } = buildVideoLlmMessages(PROMPT_FILE, input as Record<string, unknown>);
  const parsed = await chatJson<{ polishedTemplateInstanceSummaries?: unknown }>(
    messages,
    { debugStepId, temperature: debugStepId.includes("repair") ? 0.1 : 0.2, useJsonObject: true },
  );

  const raw = parsed.polishedTemplateInstanceSummaries;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("STORY_POLISH_10_FAILED: ?????? polishedTemplateInstanceSummaries ??");
  }
  return raw as Record<string, unknown>;
}

export async function runStoryArticlePolish(
  sections: AnsweredSection[],
  storyArticle: string,
): Promise<StoryArticlePolishResult> {
  const input = buildStoryArticlePolishLlmInput(sections, storyArticle);
  const sectionNames = input.sections.map((s) => s.name).filter(Boolean);
  if (sectionNames.length === 0) {
    return { polishedTemplateInstanceSummaries: {} };
  }

  if (!getVideoLlmEnv().apiKey) {
    throw new Error("OPENAI_API_KEY ?????? backend/.env ?????? backend/.env.example ? backend/.env?");
  }

  const pipelineStr = stringifyVideoPipeline(input as Record<string, unknown>);

  try {
    const raw = await callStoryArticlePolishLlm(input, "story_polish_10");
    return {
      polishedTemplateInstanceSummaries: assertPolishedCoversAllSections(raw, sectionNames),
    };
  } catch (firstErr) {
    if (!(firstErr instanceof Error) || !firstErr.message.startsWith("POLISH_10_FAILED:")) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`STORY_POLISH_10_LLM_FAILED: ${msg}`);
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
        { debugStepId: "story_polish_10_repair", temperature: 0.1, useJsonObject: true },
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

/** ???? ? step-10 ????????? LLM?`mode: "stub"` ? `VIDEO_INPUT_STUB=1` ????????? */
export async function runStoryArticlePolishFromSections(
  sections: AnsweredSection[],
  storyArticle: string,
  opts?: { mode?: MaterialPolishMode },
): Promise<StoryArticlePolishResult> {
  const filtered = filterSectionsForVideo(sections);
  if (filtered.length === 0) {
    return { polishedTemplateInstanceSummaries: {} };
  }

  const mode = resolveStoryPolishMode(opts?.mode);
  if (mode === "stub") {
    return { polishedTemplateInstanceSummaries: buildStubPolishedFromStoryArticle(filtered, storyArticle) };
  }

  return runStoryArticlePolish(filtered, storyArticle);
}
