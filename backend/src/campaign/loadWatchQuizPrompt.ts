import fs from "node:fs";
import { resolvePromptFilePath } from "../content/promptPath.js";
import { stripUserSuffixSchemaAppendix } from "../video/shared/llm/loadPrompt.js";

const PROMPT_GENERATE = "generate-questions.md";
const PROMPT_GRADE = "grade-answer.md";
const PLACEHOLDER = "{{INPUT_JSON}}";

let generateCache: { systemText: string; userSuffix: string } | null = null;
let gradeCache: { systemText: string; userSuffix: string } | null = null;

function loadPromptParts(filename: string, cache: { systemText: string; userSuffix: string } | null): { systemText: string; userSuffix: string } {
  if (cache) return cache;
  const filePath = resolvePromptFilePath("watch-quiz", filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`WATCH_QUIZ_PROMPT_NOT_FOUND: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
  const marker = "\n## User\n";
  const i = raw.indexOf(marker);
  if (i < 0) {
    throw new Error(`WATCH_QUIZ_PROMPT_INVALID: ${filename} 缺少 ## User 段`);
  }
  const systemText = raw.slice(0, i).trim();
  const userSuffixRaw = raw.slice(i + marker.length).trim();
  if (!userSuffixRaw.includes(PLACEHOLDER)) {
    throw new Error(`WATCH_QUIZ_PROMPT_INVALID: ${filename} User 段缺少 ${PLACEHOLDER}`);
  }
  return { systemText, userSuffix: stripUserSuffixSchemaAppendix(userSuffixRaw) };
}

export function loadWatchQuizGeneratePrompt(): { systemText: string; userSuffix: string } {
  if (!generateCache) {
    generateCache = loadPromptParts(PROMPT_GENERATE, generateCache);
  }
  return generateCache;
}

export function loadWatchQuizGradePrompt(): { systemText: string; userSuffix: string } {
  if (!gradeCache) {
    gradeCache = loadPromptParts(PROMPT_GRADE, gradeCache);
  }
  return gradeCache;
}
