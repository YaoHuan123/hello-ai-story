import type { DisplayLocale } from "../../../content/displayLocale";
import {
  interviewOutputLocale,
  systemWithOutputLocale,
  withOutputLocale,
} from "../../../content/interviewOutputLocale";
import { stringifyForAi } from "../../shared/llm/client.js";
import { loadInterviewStudioPromptParts } from "./loadStudioPrompt.js";

export type StudioLlmChatMessage = { role: "system" | "user"; content: string };

/** 演播室 LLM 入参 JSON（注入 `outputLocale`）。 */
export function stringifyStudioPipeline(
  pipeline: Record<string, unknown>,
  locale?: DisplayLocale,
): string {
  return stringifyForAi(withOutputLocale(pipeline, locale));
}

export function buildStudioLlmUserContent(
  userSuffix: string,
  pipeline: Record<string, unknown>,
  placeholder: string,
  locale?: DisplayLocale,
): string {
  return userSuffix.replace(placeholder, stringifyStudioPipeline(pipeline, locale));
}

/** 加载 interview-studio 提示词并组装 system/user 消息（方案 A）。 */
export function buildStudioLlmMessages(
  promptBasename: string,
  pipeline: Record<string, unknown>,
  placeholder = "{{PIPELINE_JSON}}",
  locale?: DisplayLocale,
): { messages: StudioLlmChatMessage[]; locale: DisplayLocale } {
  const loc = locale ?? interviewOutputLocale();
  const { systemText, userSuffix } = loadInterviewStudioPromptParts(promptBasename, placeholder);
  return {
    locale: loc,
    messages: [
      { role: "system", content: systemWithOutputLocale(systemText, loc) },
      { role: "user", content: buildStudioLlmUserContent(userSuffix, pipeline, placeholder, loc) },
    ],
  };
}

/** 单测：返回带 outputLocale 的 pipeline JSON 字符串。 */
export function studioPipelineJsonForTest(
  pipeline: Record<string, unknown>,
  locale: DisplayLocale,
): string {
  return stringifyStudioPipeline(pipeline, locale);
}
