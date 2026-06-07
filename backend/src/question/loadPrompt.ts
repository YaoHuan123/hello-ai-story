import fs from "node:fs";
import { resolvePromptFilePath } from "../content/promptPath";

/** 出题管道提示词文件名（逐步实现时从老项目精简复制到 `prompts/interview/`）。 */
export const QUESTION_PROMPT_FILES = {
  dedupe: "dedupe-template-questions.md",
  colloquialize: "colloquialize-template-questions.md",
  suggestBatch: "suggest-template-answers.md",
  refine: "refine-current-question.md",
  suggestCurrent: "suggest-current-answer-options.md",
  extend: "extend-sub-category-questions.md",
} as const;

export type QuestionPromptId = keyof typeof QUESTION_PROMPT_FILES;

const cache = new Map<string, { system: string; userTemplate: string }>();

/**
 * 加载出题提示词：以 `## User` 分隔 system 与 user 模板。
 */
export function loadQuestionPrompt(
  filename: string,
  placeholder = "{{INPUT_JSON}}",
): { system: string; userTemplate: string } {
  const cacheKey = `${filename}\0${placeholder}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const filePath = resolvePromptFilePath("interview", filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `PROMPT_NOT_FOUND: ${filename}（请先按 docs/question-generation-module.md 精简复制提示词）`,
    );
  }

  const raw = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const marker = "\n## User\n";
  const i = raw.indexOf(marker);
  if (i < 0) {
    throw new Error(`PROMPT_INVALID: ${filename} 缺少 ## User 段`);
  }
  const system = raw.slice(0, i).trim();
  const userTemplate = raw.slice(i + marker.length).trim();
  if (!userTemplate.includes(placeholder)) {
    throw new Error(`PROMPT_INVALID: ${filename} 的 User 段缺少 ${placeholder}`);
  }
  const parsed = { system, userTemplate };
  cache.set(cacheKey, parsed);
  return parsed;
}

export function loadDedupePrompt(): { system: string; userTemplate: string } {
  return loadQuestionPrompt(QUESTION_PROMPT_FILES.dedupe);
}

export function loadColloquializePrompt(): { system: string; userTemplate: string } {
  return loadQuestionPrompt(QUESTION_PROMPT_FILES.colloquialize);
}

export function loadSuggestBatchPrompt(): { system: string; userTemplate: string } {
  return loadQuestionPrompt(QUESTION_PROMPT_FILES.suggestBatch);
}

export function loadRefinePrompt(): { system: string; userTemplate: string } {
  return loadQuestionPrompt(QUESTION_PROMPT_FILES.refine);
}

export function loadSuggestCurrentPrompt(): { system: string; userTemplate: string } {
  return loadQuestionPrompt(QUESTION_PROMPT_FILES.suggestCurrent);
}

export function loadExtendPrompt(): { system: string; userTemplate: string } {
  return loadQuestionPrompt(QUESTION_PROMPT_FILES.extend);
}
